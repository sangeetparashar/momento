'use client';

import { useEffect, useState } from 'react';
import WaitlistForm from './WaitlistForm';

export default function Hero() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Ambient gradient orbs */}
      <div className="absolute top-[15%] left-[20%] w-[500px] h-[500px] bg-[#00FF88]/[0.07] rounded-full blur-[180px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[20%] right-[15%] w-[400px] h-[400px] bg-teal-500/[0.08] rounded-full blur-[160px] pointer-events-none animate-float-delayed" />
      <div className="absolute top-[50%] left-[60%] w-[350px] h-[350px] bg-emerald-400/[0.06] rounded-full blur-[140px] pointer-events-none animate-float" />

      {/* Subtle radial gradient from center */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,136,0.04)_0%,transparent_70%)] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Logo mark */}
        <div
          className="flex justify-center mb-6 opacity-0 animate-slide-up"
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

        {/* Label */}
        <div
          className="flex items-center justify-center gap-2 mb-8 opacity-0 animate-slide-up"
          style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-momento-primary inline-block" />
          <span className="text-momento-primary text-xs font-medium tracking-[0.25em] uppercase">
            The Stock Market for Culture
          </span>
        </div>

        {/* Main headline with word-by-word reveal + sweeping highlight */}
        <h1
          className="text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black text-white leading-[1.1] tracking-tight opacity-0 animate-slide-up"
          style={{ animationDelay: '250ms', animationFillMode: 'forwards' }}
        >
          <span className="block mb-2 md:mb-3">
            <span
              className="inline-block transition-all duration-700 ease-out mr-[0.3em]"
              style={{
                transform: revealed ? 'translateY(0)' : 'translateY(100%)',
                opacity: revealed ? 1 : 0,
                transitionDelay: '400ms',
              }}
            >
              Own
            </span>
            <span
              className="inline-block transition-all duration-700 ease-out"
              style={{
                transform: revealed ? 'translateY(0)' : 'translateY(100%)',
                opacity: revealed ? 1 : 0,
                transitionDelay: '520ms',
              }}
            >
              the
            </span>
          </span>
          <span className="inline-block relative">
            <span
              className="inline-block bg-gradient-to-r from-[#00FF88] via-[#00DDAA] to-[#00FF88] bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-shift transition-all duration-700 ease-out"
              style={{
                transform: revealed ? 'translateY(0) scale(1)' : 'translateY(100%) scale(0.9)',
                opacity: revealed ? 1 : 0,
                transitionDelay: '640ms',
              }}
            >
              Culture
            </span>
            {/* Sweeping light effect across "Culture" */}
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:50%_100%] pointer-events-none"
              style={{
                animation: revealed ? 'sweep 2s ease-in-out 1.2s forwards' : 'none',
                opacity: 0,
              }}
            />
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg md:text-xl text-momento-text-secondary max-w-2xl mx-auto mt-6 leading-relaxed opacity-0 animate-slide-up"
          style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
        >
          Invest in the creators you believe in. Trade tokens in real time.
          Profit alongside the culture you helped shape.
        </p>

        {/* Waitlist form */}
        <div
          id="waitlist"
          className="mt-10 flex justify-center opacity-0 animate-slide-up"
          style={{ animationDelay: '450ms', animationFillMode: 'forwards' }}
        >
          <WaitlistForm />
        </div>

        {/* Trust line */}
        <div
          className="mt-4 flex items-center justify-center gap-3 flex-wrap opacity-0 animate-slide-up"
          style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}
        >
          <span className="text-sm text-momento-text-tertiary">Free early access</span>
          <span className="w-1 h-1 rounded-full bg-momento-text-tertiary" />
          <span className="text-sm text-momento-text-tertiary">No crypto knowledge needed</span>
          <span className="w-1 h-1 rounded-full bg-momento-text-tertiary" />
          <span className="text-sm text-momento-text-tertiary">Solana-powered</span>
        </div>

        {/* Scroll indicator */}
        <div
          className="mt-20 flex justify-center opacity-0 animate-slide-up"
          style={{ animationDelay: '750ms', animationFillMode: 'forwards' }}
        >
          <div className="animate-bounce-gentle opacity-50">
            <svg
              className="w-6 h-6 text-white/40"
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
