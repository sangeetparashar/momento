'use client';

import { useState, useEffect } from 'react';
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
          <p className="loading-text text-sm text-[#666666] lowercase">
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
            {/* Gradient background inside polaroid */}
            <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0a0a0a] to-black" />

            {/* Breathing green glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-[#00FF88]/[0.08] rounded-full blur-[60px] animate-breathe-glow" />

            {/* Logo + text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <svg
                width="48"
                height="48"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
              </svg>
              <span className="font-display text-2xl font-bold text-white tracking-[0.2em] uppercase">
                MOMENTO
              </span>
            </div>
          </div>

          {/* Polaroid caption area */}
          <p className="text-center text-[#999] text-sm mt-1 italic" style={{ fontFamily: 'Georgia, serif' }}>
            own the culture
          </p>
        </button>

        {/* Tap hint */}
        <p className="mt-8 text-[#333] text-xs font-mono animate-pulse-dot">
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
