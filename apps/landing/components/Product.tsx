'use client';

import { useEffect, useRef } from 'react';

const features = [
  {
    word: 'Discover',
    description: 'Find creators in your city. Your feed is powered by location.',
  },
  {
    word: 'Trade',
    description: 'Buy and sell creator tokens in real time. Prices move with real momentum.',
  },
  {
    word: 'Build',
    description: 'Track your portfolio. Creators and fans grow together.',
  },
];

const steps = ['Launch', 'Buy In', 'Markets Move', 'Everyone Profits'];

export default function Product() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      const trigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 100px',
      });

      // Section label
      animate(sectionRef.current.querySelector('.anim-label'), {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      // Feature words — stagger with varied timing
      animate(sectionRef.current.querySelectorAll('.anim-feature'), {
        opacity: [0, 1],
        translateX: [-30, 0],
        delay: (_: unknown, i: number) => 100 + i * 120,
        duration: 900,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      // Phone mockup — scale in
      animate(sectionRef.current.querySelector('.anim-phone'), {
        opacity: [0, 1],
        scale: [0.9, 1],
        delay: 200,
        duration: 1000,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      // Steps row
      animate(sectionRef.current.querySelectorAll('.anim-step'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: (_: unknown, i: number) => 400 + i * 80,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      // Token loop
      animate(sectionRef.current.querySelector('.anim-loop'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: 600,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });
    };

    init();
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section label */}
        <p
          className="anim-label font-mono text-xs text-momento-primary uppercase tracking-[4px] mb-16 text-center"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          The Product
        </p>

        {/* Two-column: Features left, Phone right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Stacked feature words */}
          <div className="space-y-12">
            {features.map((feature) => (
              <div
                key={feature.word}
                className="anim-feature group"
                style={{ opacity: 0, transform: 'translateX(-30px)' }}
              >
                <h3 className="font-display text-5xl md:text-7xl font-bold text-white/90 tracking-tight group-hover:text-momento-primary transition-colors duration-300">
                  {feature.word}
                </h3>
                <p className="text-[#666666] text-base mt-2 max-w-md leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Right: Single phone mockup */}
          <div
            className="anim-phone flex justify-center lg:justify-end"
            style={{ opacity: 0, transform: 'scale(0.9)' }}
          >
            <div className="w-72 md:w-80 rounded-[2.5rem] border border-white/[0.08] bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-black/50">
              {/* Notch */}
              <div className="flex justify-center pt-4 pb-3">
                <div className="w-24 h-1 bg-white/[0.06] rounded-full" />
              </div>
              {/* Screen content */}
              <div className="px-5 pb-5 space-y-4">
                {/* Token header */}
                <div className="text-center space-y-1">
                  <p className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Creator Token</p>
                  <p className="text-white text-3xl font-black font-mono">$NASH</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-white text-xl font-bold font-mono">$2.47</span>
                    <span className="text-momento-primary text-xs font-mono font-bold bg-momento-primary/10 px-2 py-0.5 rounded-full">
                      +12.4%
                    </span>
                  </div>
                </div>
                {/* Chart */}
                <div className="h-28 relative rounded-xl overflow-hidden bg-white/[0.02]">
                  <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00FF88" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,60 Q20,55 40,50 T80,35 T120,40 T160,20 T200,15 L200,80 L0,80 Z"
                      fill="url(#chartGrad)"
                    />
                    <path
                      d="M0,60 Q20,55 40,50 T80,35 T120,40 T160,20 T200,15"
                      fill="none"
                      stroke="#00FF88"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                    <p className="text-white/30">24h Vol</p>
                    <p className="text-white font-mono font-semibold mt-0.5">$12.4K</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                    <p className="text-white/30">Holders</p>
                    <p className="text-white font-mono font-semibold mt-0.5">847</p>
                  </div>
                </div>
                {/* Buttons */}
                <div className="flex gap-2">
                  <button className="flex-1 bg-momento-primary text-black font-bold text-sm py-3 rounded-xl">
                    Buy
                  </button>
                  <button className="flex-1 bg-white/[0.04] border border-white/[0.08] text-white font-bold text-sm py-3 rounded-xl">
                    Sell
                  </button>
                </div>
              </div>
              {/* Bottom bar */}
              <div className="flex justify-center pb-4 pt-2">
                <div className="w-28 h-1 bg-white/[0.06] rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* How it works — 4 steps as clean horizontal row */}
        <div className="mt-32">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div
                key={step}
                className="anim-step text-center"
                style={{ opacity: 0, transform: 'translateY(20px)' }}
              >
                <span className="font-mono text-xs text-momento-primary/40 block mb-2">
                  0{i + 1}
                </span>
                <h4 className="font-display text-lg md:text-xl font-bold text-white">
                  {step}
                </h4>
              </div>
            ))}
          </div>
        </div>

        {/* Compressed token loop */}
        <div
          className="anim-loop mt-16 flex items-center justify-center gap-4 md:gap-8"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <span className="font-mono text-sm text-white/60">Creator</span>
          <svg className="w-5 h-5 text-momento-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="font-mono text-sm text-momento-primary font-semibold">$TOKEN</span>
          <svg className="w-5 h-5 text-momento-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="font-mono text-sm text-white/60">Community</span>
          <svg className="w-5 h-5 text-momento-primary/40 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="font-mono text-sm text-white/60 hidden md:block">Value</span>
        </div>
      </div>
    </section>
  );
}
