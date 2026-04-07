import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ja" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
