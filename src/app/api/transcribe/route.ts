import { NextRequest, NextResponse } from 'next/server';
import { downloadFile } from '@/lib/drive';
import { transcribeAudio } from '@/lib/gemini';
import { getSession, updateStatus } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json() as { fileId: string };
    if (!fileId) {
      return NextResponse.json({ error: 'fileId が必要です' }, { status: 400 });
    }

    const session = await getSession(fileId);
    if (!session) {
      return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
    }

    await updateStatus(fileId, 'transcribing');

    const audioBuffer = await downloadFile(fileId);
    const transcript = await transcribeAudio(
      audioBuffer,
      session.meta.mimeType
    );

    await updateStatus(fileId, 'summarizing', { transcript });

    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
