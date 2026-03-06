'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import WaitlistForm from './WaitlistForm';

export default function Hero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center noise-overlay overflow-hidden">
      {/* Animated green radial glow behind heading */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-momento-primary/5 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      <div className="relative z-10 text-center px-6 pt-20 pb-16 max-w-3xl mx-auto">
        {/* Logo mark */}
        <div
          className={`flex justify-center mb-8 transition-all duration-[1000ms] ease-out
                      ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        >
          <Image
            src="/logo-white.svg"
            alt="Momento"
            width={48}
            height={48}
            className="animate-float"
          />
        </div>

        {/* MOMENTO wordmark — wide letter-spacing like Figma */}
        <p
          className={`text-momento-primary font-extrabold text-sm tracking-[10px] uppercase mb-6
                      transition-all duration-[800ms] ease-out delay-100
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          MOMENTO
        </p>

        <h1
          className={`text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6
                      transition-all duration-[800ms] ease-out delay-200
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          style={{ letterSpacing: '-1px' }}
        >
          The Stock Market
          <br />
          for{' '}
          <span className="text-momento-primary relative">
            Culture
            <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-momento-primary/40 rounded-full" />
          </span>
        </h1>

        <p
          className={`text-lg sm:text-xl text-momento-text-secondary max-w-xl mx-auto mb-10 leading-relaxed
                      transition-all duration-[800ms] ease-out delay-[350ms]
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          Invest in the creators you believe in. Trade in real time. Profit
          alongside the culture you helped create.
        </p>

        <div
          className={`flex justify-center transition-all duration-[800ms] ease-out delay-[500ms]
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          <WaitlistForm />
        </div>

        <p
          className={`mt-6 text-momento-text-tertiary text-sm transition-opacity duration-[600ms] ease-out delay-[700ms]
                      ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          Join 1,000+ fans already waiting
        </p>

        {/* Scroll indicator */}
        <div
          className={`mt-16 flex justify-center transition-all duration-[600ms] ease-out delay-[900ms]
                      ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="animate-bounce-gentle">
            <svg
              className="w-5 h-5 text-momento-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
