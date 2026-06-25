import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inkah — Chinese & Korean Pop-up Dictionary',
  description:
    'Look up Chinese and Korean words while browsing the web. Hover over characters to see definitions, pinyin, romanization, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
