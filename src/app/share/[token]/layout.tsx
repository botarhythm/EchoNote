import type { Metadata } from 'next';
import { getShareData } from '@/lib/db';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const data = await getShareData(token);
    if (!data) {
      return { title: 'EchoNote — 共有リンクが無効です' };
    }
    const summary = data.session.summary;
    const fallback = data.session.meta.clientName || 'セッション';
    const title = summary?.title?.trim() || fallback;
    const description = summary?.overallAssessment?.trim().slice(0, 160) || 'EchoNote 共有セッション';
    return {
      title: `${title} — EchoNote`,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    };
  } catch {
    return { title: 'EchoNote — Shared Session' };
  }
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
