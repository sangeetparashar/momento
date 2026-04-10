'use client';

import { useEffect, useRef } from 'react';
import WaitlistForm from './WaitlistForm';

export default function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate } = await import('animejs');
      if (!sectionRef.current) return;

      const elements = sectionRef.current.querySelectorAll('.anim-hero');
      animate(elements, {
        opacity: [0, 1],
        translateY: [30, 0],
        delay: (_: unknown, i: number) => 200 + i * 200,
        duration: 1000,
        easing: 'easeOutCubic',
      });
    };

    setTimeout(init, 200);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-black to-black" />

      {/* Breathing orb — very subtle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-momento-primary/[0.03] rounded-full blur-[200px] animate-breathe-glow pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 text-center px-6 flex flex-col items-center">
        {/* Logo wordmark — thin elegant serif */}
        <h1
          className="anim-hero font-serif font-light text-5xl md:text-7xl lg:text-8xl text-white tracking-[0.3em] md:tracking-[0.4em] uppercase"
          style={{ opacity: 0 }}
        >
          Momento
        </h1>

        {/* Tagline */}
        <p
          className="anim-hero font-mono text-[10px] md:text-xs text-[#888888] tracking-[0.3em] md:tracking-[0.4em] uppercase mt-6 md:mt-8"
          style={{ opacity: 0 }}
        >
          The Stock Market for Culture
        </p>

        {/* Divider line */}
        <div
          className="anim-hero w-12 h-px bg-gradient-to-r from-transparent via-momento-primary/40 to-transparent mt-10 md:mt-12"
          style={{ opacity: 0 }}
        />

        {/* Waitlist CTA */}
        <div
          id="waitlist"
          className="anim-hero mt-10 md:mt-12"
          style={{ opacity: 0 }}
        >
          <WaitlistForm />
        </div>

        {/* Solana badge */}
        <p
          className="anim-hero font-mono text-[9px] text-[#333333] tracking-[0.2em] uppercase mt-8"
          style={{ opacity: 0 }}
        >
          Solana-powered
        </p>

        {/* Scroll indicator */}
        <div
          className="anim-hero mt-16 md:mt-24"
          style={{ opacity: 0 }}
        >
          <svg
            className="w-4 h-4 text-white/20 animate-bounce-gentle"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
          </svg>
        </div>
      </div>
    </section>
  );
}
