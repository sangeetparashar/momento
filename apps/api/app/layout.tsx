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
