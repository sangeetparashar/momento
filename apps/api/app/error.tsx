'use client';

export default function Error() {
  return (
    <div style={{ backgroundColor: '#0D0D0D', color: '#FFFFFF', fontFamily: 'system-ui', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', margin: '0 0 16px' }}>500</h1>
        <p style={{ color: '#8A8A8A' }}>Internal server error</p>
      </div>
    </div>
  );
}
