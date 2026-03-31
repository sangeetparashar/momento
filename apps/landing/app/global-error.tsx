'use client';

export default function GlobalError() {
  return (
    <html>
      <body style={{ backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, fontFamily: 'monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>500</h1>
          <p style={{ color: '#666', marginTop: '1rem' }}>Something went wrong</p>
          <a href="/" style={{ color: '#00FF88', marginTop: '1.5rem', display: 'inline-block' }}>
            Back to Momento
          </a>
        </div>
      </body>
    </html>
  );
}
