import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Momento — Own the Culture',
  description:
    'Invest in the creators you believe in and profit alongside the culture you shape.',
  keywords: ['creators', 'tokens', 'culture', 'social', 'crypto', 'fans', 'decentralized', 'solana'],
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'Momento — Own the Culture',
    description:
      'Invest in the creators you believe in and profit alongside the culture you shape.',
    type: 'website',
    url: 'https://moment.network',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Momento — Own the Culture',
    description: 'Invest in the creators you believe in and profit alongside the culture you shape.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
