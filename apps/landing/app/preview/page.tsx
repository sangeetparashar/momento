export default function PreviewPage() {
  return (
    <main className="min-h-screen bg-momento-bg text-white">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-4">Animation Preview — Pick Your Favorite</h1>
        <p className="text-momento-text-secondary mb-16">
          Scroll through all 3 options. Each is shown at the size it would appear on the landing page.
        </p>

        {/* Option 1: Spline Motion Scene */}
        <section className="mb-24">
          <div className="mb-6">
            <span className="text-momento-primary text-xs font-medium tracking-widest uppercase">Option 1</span>
            <h2 className="text-3xl font-bold mt-2">Spline — Motion Scene</h2>
            <p className="text-momento-text-secondary mt-1">
              3D animated motion scene · CC0 license · Interactive (drag to rotate)
            </p>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ height: '500px' }}>
            <iframe
              src="https://my.spline.design/720fc8dc-e099-45e2-a26d-adc4d30a9fb4/"
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              title="Spline Motion Scene"
              loading="lazy"
            />
          </div>
        </section>

        {/* Option 2: Rive Portal Suspense */}
        <section className="mb-24">
          <div className="mb-6">
            <span className="text-momento-primary text-xs font-medium tracking-widest uppercase">Option 2</span>
            <h2 className="text-3xl font-bold mt-2">Rive — Portal Suspense</h2>
            <p className="text-momento-text-secondary mt-1">
              Animated mascot portal effect · CC BY license · Lightweight .riv file
            </p>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black flex items-center justify-center" style={{ height: '500px' }}>
            <canvas
              id="rive-canvas"
              width="500"
              height="500"
              style={{ width: '500px', height: '500px' }}
            />
            {/* Rive runtime loaded via script */}
            <iframe
              src="https://editor.rive.app/preview/24427-45631-portal-suspense/28681208?mode=animate&artboard=ScreenTransition&animation=State%20Machine%201"
              width="100%"
              height="100%"
              style={{ border: 'none', position: 'absolute', inset: 0 }}
              title="Rive Portal Suspense"
              loading="lazy"
              allow="autoplay"
            />
          </div>
        </section>

        {/* Option 3: Spline Abstract Crypto Scene */}
        <section className="mb-24">
          <div className="mb-6">
            <span className="text-momento-primary text-xs font-medium tracking-widest uppercase">Option 3</span>
            <h2 className="text-3xl font-bold mt-2">Spline — Abstract Crypto Scene</h2>
            <p className="text-momento-text-secondary mt-1">
              Blockchain &amp; digital finance 3D scene · CC0 license · Interactive
            </p>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ height: '500px' }}>
            <iframe
              src="https://my.spline.design/1c406718-0bc2-4d6d-aec9-27f53279231a/"
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              title="Spline Abstract Crypto Scene"
              loading="lazy"
            />
          </div>
        </section>

        <div className="text-center py-12 border-t border-white/10">
          <p className="text-momento-text-secondary">
            Pick your favorite and let me know — I&apos;ll integrate it into the landing page.
          </p>
        </div>
      </div>
    </main>
  );
}
