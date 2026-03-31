'use client';

import { useEffect, useState } from 'react';
import WaitlistForm from './WaitlistForm';

export default function Hero() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Breathing gradient orbs with organic flutter */}
      <div className="absolute top-[10%] left-[15%] w-[600px] h-[600px] bg-[#00FF88]/[0.06] rounded-full blur-[180px] pointer-events-none animate-flutter" />
      <div className="absolute bottom-[15%] right-[10%] w-[500px] h-[500px] bg-[#00FF88]/[0.04] rounded-full blur-[160px] pointer-events-none animate-breathe-glow" />
      <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] bg-emerald-400/[0.03] rounded-full blur-[200px] pointer-events-none animate-float-slow" />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
        {/* Logo mark */}
        <div
          className="flex justify-center mb-8 opacity-0 animate-slide-up"
          style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-float-slow"
          >
            <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
          </svg>
        </div>

        {/* Main headline — Space Grotesk, massive */}
        <h1
          className="opacity-0 animate-slide-up"
          style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}
        >
          <span className="block font-display text-7xl md:text-8xl lg:text-[10rem] font-bold text-white leading-[0.9] tracking-tight">
            <span
              className="inline-block transition-all duration-700 ease-out"
              style={{
                transform: revealed ? 'translateY(0)' : 'translateY(40%)',
                opacity: revealed ? 1 : 0,
                transitionDelay: '300ms',
              }}
            >
              Own the
            </span>
          </span>
          <span className="block relative mt-2">
            <span
              className="inline-block font-display text-7xl md:text-8xl lg:text-[10rem] font-bold leading-[0.9] tracking-tight bg-gradient-to-r from-[#00FF88] via-[#00DDAA] to-[#00FF88] bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-shift transition-all duration-700 ease-out"
              style={{
                transform: revealed ? 'translateY(0) scale(1)' : 'translateY(40%) scale(0.95)',
                opacity: revealed ? 1 : 0,
                transitionDelay: '500ms',
              }}
            >
              Culture
            </span>
            {/* Sweep effect */}
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:50%_100%] pointer-events-none"
              style={{
                animation: revealed ? 'sweep 2s ease-in-out 1s forwards' : 'none',
                opacity: 0,
              }}
            />
          </span>
        </h1>

        {/* Single punchy subtitle */}
        <p
          className="text-lg md:text-xl text-[#666666] max-w-xl mx-auto mt-8 leading-relaxed opacity-0 animate-slide-up"
          style={{ animationDelay: '350ms', animationFillMode: 'forwards' }}
        >
          Invest in the creators you believe in and profit alongside the culture you shape.
        </p>

        {/* Waitlist form */}
        <div
          id="waitlist"
          className="mt-12 flex justify-center opacity-0 animate-slide-up"
          style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}
        >
          <WaitlistForm />
        </div>

        {/* Solana-powered caption — monospace, subtle */}
        <div
          className="mt-6 opacity-0 animate-slide-up"
          style={{ animationDelay: '650ms', animationFillMode: 'forwards' }}
        >
          <span className="font-mono text-xs text-[#444444] tracking-wider uppercase">
            Solana-powered
          </span>
        </div>

        {/* Scroll indicator */}
        <div
          className="mt-24 flex justify-center opacity-0 animate-slide-up"
          style={{ animationDelay: '800ms', animationFillMode: 'forwards' }}
        >
          <div className="animate-bounce-gentle opacity-30">
            <svg
              className="w-5 h-5 text-white/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
