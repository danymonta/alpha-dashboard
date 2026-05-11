import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alpha Dashboard · Instagram Reels',
  description: 'Analytics personale per i tuoi Instagram Reels',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
