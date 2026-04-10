'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AppShowcaseFlow from './showcase/AppShowcaseFlow';

type Phase = 'loading' | 'polaroid' | 'main';

export default function CreatorLanding() {
  const [phase, setPhase] = useState<Phase>('loading');

  // Auto-transition: loading → polaroid
  useEffect(() => {
    const timer = setTimeout(() => setPhase('polaroid'), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-black">
      {/* ═══ PHASE 1: LOADING ═══ */}
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-700 ${
          phase === 'loading' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-momento-primary animate-pulse-dot" />
          <p className="font-mono text-[10px] text-[#555555] lowercase tracking-[0.15em]">
            loading your momento...
          </p>
        </div>
      </div>

      {/* ═══ PHASE 2: POLAROID ═══ */}
      <div
        className={`fixed inset-0 z-40 flex flex-col items-center justify-center bg-black transition-all duration-700 ${
          phase === 'polaroid' ? 'opacity-100 scale-100' : phase === 'main' ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <button
          onClick={() => setPhase('main')}
          className="polaroid animate-polaroid-float focus:outline-none"
          aria-label="Enter Momento"
        >
          {/* Photo area */}
          <div className="w-64 h-64 md:w-72 md:h-72 bg-black rounded-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0a0a0a] to-black" />

            {/* Breathing green glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-momento-primary/[0.08] rounded-full blur-[60px] animate-breathe-glow" />

            {/* Logo + text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
              <Image
                src="/logo-white.svg"
                alt="Momento"
                width={48}
                height={48}
              />
              <span className="font-serif font-light text-2xl text-white tracking-[0.3em] uppercase">
                Momento
              </span>
            </div>
          </div>

          {/* Polaroid caption area */}
          <p className="text-center text-[#999] text-sm mt-1 italic" style={{ fontFamily: 'Georgia, serif' }}>
            the stock market for culture
          </p>
        </button>

        {/* Tap hint */}
        <p className="mt-8 text-[#333] text-[10px] font-mono animate-pulse-dot tracking-[0.15em]">
          tap to enter
        </p>
      </div>

      {/* ═══ PHASE 3: APP SHOWCASE ═══ */}
      <div
        className={`transition-opacity duration-700 ${
          phase === 'main' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <AppShowcaseFlow />
      </div>
    </div>
  );
}
