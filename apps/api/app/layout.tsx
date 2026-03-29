// Force all pages to be dynamic (API-only app, no static generation needed)
export const dynamic = 'force-dynamic';

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
};

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
    <html lang="en" className={inter.variable}>
      <body className="bg-momento-bg text-white antialiased font-sans">
        {/* Fixed noise overlay across the entire page */}
        <div
          className="noise-overlay pointer-events-none fixed inset-0 z-50"
          aria-hidden="true"
        />
        {children}
      </body>
    </html>
  );
}
