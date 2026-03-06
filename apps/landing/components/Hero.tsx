'use client';

import { useEffect, useRef, useState } from 'react';
import WaitlistForm from './WaitlistForm';

export default function Hero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay for mount, then trigger CSS transition
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center noise-overlay">
      {/* Subtle green radial glow behind heading */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-momento-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 text-center px-6 pt-20 pb-16 max-w-3xl mx-auto">
        <h1
          className={`text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6
                      transition-all duration-[800ms] ease-out
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          style={{ letterSpacing: '-1px' }}
        >
          The Stock Market
          <br />
          for{' '}
          <span className="text-momento-primary">Culture</span>
        </h1>

        <p
          className={`text-lg sm:text-xl text-momento-text-secondary max-w-xl mx-auto mb-10 leading-relaxed
                      transition-all duration-[800ms] ease-out delay-200
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          Invest in the creators you believe in. Trade in real time. Profit
          alongside the culture you helped create.
        </p>

        <div
          className={`flex justify-center transition-all duration-[800ms] ease-out delay-[400ms]
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          <WaitlistForm />
        </div>

        <p
          className={`mt-6 text-momento-text-tertiary text-sm transition-opacity duration-[600ms] ease-out delay-[600ms]
                      ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          Join 1,000+ fans already waiting
        </p>
      </div>
    </section>
  );
}
