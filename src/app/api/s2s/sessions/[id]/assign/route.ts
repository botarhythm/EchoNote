import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionClientName } from '@/lib/db';
import { moveFileToClientFolder } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S書込API: セッションを指定クライアントに割り当て直す。
 * 伴走ボットが「直近の録音を〇〇さんのコーチングに紐づけて」を実行するためのエンドポイント。
 * 録音ファイル名の規約に依存せず、後からclient_nameを正す運用を可能にする。
 *
 * 認証: Authorization: Bearer <ECHONOTE_READ_TOKEN>（S2S同一信頼圏のため読取と共通）
 * ボディ: { "clientName": "みおり" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const expected = process.env.ECHONOTE_READ_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 's2s API 無効（ECHONOTE_READ_TOKEN 未設定）' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let clientName = '';
  try {
    const body = (await request.json()) as { clientName?: string };
    clientName = (body.clientName ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'JSONボディが必要です' }, { status: 400 });
  }
  if (!clientName) {
    return NextResponse.json({ error: 'clientName が必要です' }, { status: 400 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: `セッション ${id} が見つかりません` }, { status: 404 });
  }

  // 重複セッションへの割り当ては元セッションに解決する。
  // サマリー・書き起こしは元セッションにしか無く、資産同期（clients/[name]/sessions）も
  // done+サマリーありしか返さないため、重複側だけを付け替えると取り込みが空振りする。
  const targetId = session.duplicateOf ?? id;
  const updated = await updateSessionClientName(targetId, clientName);
  if (!updated) {
    return NextResponse.json(
      { error: `セッション ${targetId} が見つかりません` },
      { status: 404 }
    );
  }
  // 重複側の記録も同じ分類に揃える（一覧表示の整合のため。失敗しても本体は成立）
  if (targetId !== id) {
    await updateSessionClientName(id, clientName).catch(() => false);
  }

  // Drive 上のファイルをクライアント別サブフォルダへ追従移動（ベストエフォート）。
  // done=処理済み本体 / duplicate=退避済み重複ファイル。処理中セッションは
  // poller 完了時の moveToProcessed が正しいフォルダへ入れるため、ここでは触らない。
  if (session.status === 'done' || session.status === 'duplicate') {
    try {
      await moveFileToClientFolder(session.meta.driveFileId, clientName);
    } catch (err) {
      console.error(`[s2s/assign] フォルダ追従移動に失敗 (${id}):`, err);
    }
  }
  if (targetId !== id) {
    // 元セッションのファイルも追従（ユーザーがDriveから削除済みの場合は静かに失敗）
    try {
      await moveFileToClientFolder(targetId, clientName);
    } catch (err) {
      console.error(`[s2s/assign] 元セッションの追従移動に失敗 (${targetId}):`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    clientName,
    resolvedTo: targetId,
    duplicateResolved: targetId !== id,
  });
}
