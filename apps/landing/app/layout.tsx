import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Momento — The Stock Market for Culture',
  description:
    'Invest in the creators you believe in. Trade in real time. Profit alongside the culture you helped create.',
  keywords: ['creators', 'tokens', 'culture', 'social', 'crypto', 'fans'],
  openGraph: {
    title: 'Momento — The Stock Market for Culture',
    description:
      'Invest in the creators you believe in. Trade in real time. Profit alongside the culture you helped create.',
    type: 'website',
    url: 'https://momento.io',
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
