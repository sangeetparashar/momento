'use client';

import { useEffect, useRef, useState } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

export default function RiveAnimation() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const { RiveComponent } = useRive({
    src: 'https://public.rive.app/community/runtime-files/24427-45631-portal-suspense.riv',
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 overflow-hidden"
    >
      {/* Ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,136,0.03)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`flex flex-col lg:flex-row items-center gap-12 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Left: Text content */}
          <div className="flex-1 text-center lg:text-left">
            <span className="text-momento-primary text-xs font-medium tracking-[0.25em] uppercase">
              Powered by Solana
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mt-4 leading-tight">
              Enter the{' '}
              <span className="text-gradient-green">Portal</span>
            </h2>
            <p className="text-momento-text-secondary text-lg mt-4 leading-relaxed max-w-lg">
              Step into a new dimension of creator economics. Where fans become
              investors, creators become assets, and culture becomes the market.
            </p>
            <div className="flex flex-wrap gap-4 mt-8 justify-center lg:justify-start">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-momento-primary" />
                <span className="text-sm text-white/70">Instant settlements</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-momento-primary" />
                <span className="text-sm text-white/70">Sub-cent fees</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-momento-primary" />
                <span className="text-sm text-white/70">Real-time trading</span>
              </div>
            </div>
          </div>

          {/* Right: Rive animation */}
          <div className="flex-1 flex items-center justify-center">
            <div
              className={`w-[340px] h-[340px] md:w-[420px] md:h-[420px] lg:w-[480px] lg:h-[480px] rounded-3xl overflow-hidden transition-all duration-1000 delay-300 ${
                isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              }`}
            >
              <RiveComponent />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
