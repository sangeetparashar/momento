import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Momento — The Stock Market for Culture',
  description:
    'Decentralizing income in the arts. The people dictate value, not algorithms. Invest in the creators you believe in.',
  keywords: ['creators', 'tokens', 'culture', 'social', 'crypto', 'fans', 'decentralized', 'solana'],
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'Momento — The Stock Market for Culture',
    description:
      'Decentralizing income in the arts. The people dictate value, not algorithms.',
    type: 'website',
    url: 'https://moment.network',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Momento — The Stock Market for Culture',
    description: 'Invest in the creators you believe in.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
