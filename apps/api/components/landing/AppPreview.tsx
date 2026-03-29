'use client';

import { useEffect, useRef, useState } from 'react';

const screens = [
  {
    label: 'Live Feed',
    icon: (
      <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-momento-primary/20" />
          <div className="flex-1">
            <div className="h-2.5 bg-white/20 rounded w-24" />
            <div className="h-2 bg-white/10 rounded w-16 mt-1" />
          </div>
          <span className="text-momento-primary font-mono text-xs font-bold">+12%</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500/20" />
          <div className="flex-1">
            <div className="h-2.5 bg-white/20 rounded w-20" />
            <div className="h-2 bg-white/10 rounded w-14 mt-1" />
          </div>
          <span className="text-momento-primary font-mono text-xs font-bold">+8%</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20" />
          <div className="flex-1">
            <div className="h-2.5 bg-white/20 rounded w-28" />
            <div className="h-2 bg-white/10 rounded w-12 mt-1" />
          </div>
          <span className="text-momento-error font-mono text-xs font-bold">-2%</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Creator Tokens',
    icon: (
      <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <div className="h-16 bg-gradient-to-r from-momento-primary/20 to-transparent rounded-lg flex items-end p-2">
          <div className="flex items-end gap-[3px] h-full">
            {[40, 55, 45, 60, 50, 70, 65, 80, 75, 90, 85, 95].map((h, i) => (
              <div
                key={i}
                className="w-1.5 bg-momento-primary/60 rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-white/50">$NASH</span>
          <span className="text-momento-primary font-mono font-bold">+23.4%</span>
        </div>
        <div className="h-px bg-momento-border" />
        <div className="flex justify-between text-xs">
          <span className="text-white/40">Market Cap</span>
          <span className="text-white/60 font-mono">--</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Portfolio',
    icon: (
      <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <div className="text-center">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Your Balance</p>
          <p className="text-white font-bold text-xl font-mono">---</p>
          <p className="text-momento-primary text-xs font-mono mt-0.5">Coming Soon</p>
        </div>
        <div className="h-px bg-momento-border" />
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-white/60 text-xs">Holdings</span>
            <span className="text-white/40 text-xs font-mono">--</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/60 text-xs">Watchlist</span>
            <span className="text-white/40 text-xs font-mono">--</span>
          </div>
        </div>
      </div>
    ),
  },
];

export default function AppPreview() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-3 text-center">
          The App
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 tracking-tight">
          Built for the Culture
        </h2>

        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8 max-w-4xl mx-auto"
          style={{ perspective: '1000px' }}
        >
          {screens.map((screen, i) => (
            <div
              key={i}
              className={`transition-all duration-1000 ease-out
                         ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
              style={{
                transitionDelay: `${i * 200}ms`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="bg-momento-bg-secondary border border-momento-border rounded-3xl p-5 pt-6">
                {/* Phone notch */}
                <div className="w-20 h-1 bg-momento-bg-tertiary rounded-full mx-auto mb-5" />

                {/* Screen header */}
                <div className="flex items-center gap-2 mb-4">
                  {screen.icon}
                  <span className="text-white font-semibold text-sm">{screen.label}</span>
                </div>

                {/* Screen content */}
                <div className="min-h-[140px]">{screen.content}</div>

                {/* Bottom bar */}
                <div className="mt-5 flex justify-center gap-6 pt-3 border-t border-momento-border">
                  <div className="w-4 h-4 rounded-full bg-momento-bg-tertiary" />
                  <div className="w-4 h-4 rounded-full bg-momento-bg-tertiary" />
                  <div className="w-4 h-4 rounded-full bg-momento-bg-tertiary" />
                </div>
              </div>

              <p className="text-momento-text-tertiary text-sm text-center mt-4">
                {screen.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
