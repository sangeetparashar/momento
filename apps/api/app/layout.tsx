// Force all pages to be dynamic (API-only app, no static generation needed)
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Momento API',
  description: 'API backend for Momento - a location-based creator platform',
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
