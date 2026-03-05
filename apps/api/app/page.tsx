export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#0a0a0a',
        color: '#fafafa',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Momento API</h1>
      <p style={{ color: '#888', fontSize: '1.1rem' }}>
        Location-based creator platform with Solana wallet integration
      </p>
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem 2rem',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
        }}
      >
        <p style={{ margin: 0, color: '#aaa' }}>
          API Status: <span style={{ color: '#4ade80' }}>Online</span>
        </p>
      </div>
      <div style={{ marginTop: '1.5rem', color: '#666', fontSize: '0.9rem' }}>
        <p>Base URL: /api</p>
      </div>
    </main>
  );
}
