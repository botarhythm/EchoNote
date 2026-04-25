import type { Metadata } from 'next';
import { Noto_Sans_JP, Noto_Serif_JP } from 'next/font/google';
import './globals.css';

const notoSans = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans-jp',
  display: 'swap',
});

const notoSerif = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-serif-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EchoNote - Session Archive',
  description: 'Botarhythm Studio セッション議事録自動化',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`dark h-full antialiased ${notoSans.variable} ${notoSerif.variable}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
