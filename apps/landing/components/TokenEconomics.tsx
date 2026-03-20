'use client';

import { useEffect, useRef } from 'react';

const flowCards = [
  {
    title: 'Creator Launches',
    content: (
      <>
        {/* Avatar placeholder */}
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-momento-primary/30 to-momento-primary/10 border border-momento-primary/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <p className="text-momento-primary font-mono text-sm font-semibold">$CREATOR</p>
        <p className="text-momento-text-secondary text-xs mt-1">Initial price: $0.10</p>
      </>
    ),
  },
  {
    title: 'Community Buys',
    content: (
      <>
        {/* Multiple avatar circles */}
        <div className="flex items-center justify-center -space-x-2 mb-3">
          {[0.4, 0.3, 0.5, 0.2, 0.35].map((opacity, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] flex items-center justify-center"
              style={{ background: `rgba(0,255,136,${opacity})` }}
            >
              <svg className="w-3.5 h-3.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
            </div>
          ))}
        </div>
        <p className="text-white text-sm font-medium">Price rises with demand</p>
        {/* Mini CSS-only upward chart */}
        <div className="mt-3 h-8 w-full flex items-end justify-center gap-0.5">
          <div className="w-full h-full rounded overflow-hidden relative">
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top right, transparent 45%, rgba(0,255,136,0.3) 50%, rgba(0,255,136,0.1) 55%, transparent 60%)',
              }}
            />
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: '100%',
                background: 'linear-gradient(to top right, transparent 44%, rgba(0,255,136,0.8) 49%, rgba(0,255,136,0.8) 51%, transparent 56%)',
              }}
            />
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Value Grows',
    content: (
      <>
        {/* Dollar icon */}
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-momento-primary/30 to-momento-primary/10 border border-momento-primary/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-white text-xs leading-relaxed">Creator earns from token activity</p>
        <p className="text-momento-text-secondary text-xs mt-1">Fans profit from price appreciation</p>
      </>
    ),
  },
];

const pills = [
  {
    label: 'Solana-powered',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    label: 'KYC-verified creators',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    label: 'Real-time trading',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function TokenEconomics() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      // Animate section label + heading — slide up
      animate(sectionRef.current.querySelector('.anim-heading'), {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });

      // Animate flow cards — slide up with stagger
      animate(sectionRef.current.querySelectorAll('.anim-card'), {
        opacity: [0, 1],
        translateY: [40, 0],
        delay: (_, i) => i * 100,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });

      // Animate arrow connectors — fade in
      animate(sectionRef.current.querySelectorAll('.anim-arrow'), {
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });

      // Animate pills — slide up with stagger
      animate(sectionRef.current.querySelectorAll('.anim-pill'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: (_, i) => i * 100,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });
    };

    init();
  }, []);

  return (
    <section id="token-economics" ref={sectionRef} className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section label + Heading */}
        <div className="anim-heading" style={{ opacity: 0, transform: 'translateY(30px)' }}>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px w-12 bg-momento-primary/30" />
            <p className="text-momento-primary text-xs font-medium uppercase tracking-[3px]">
              Token Economics
            </p>
            <div className="h-px w-12 bg-momento-primary/30" />
          </div>

          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 tracking-tight">
            How creator tokens work
          </h2>
        </div>

        {/* Flow diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 items-stretch">
          {flowCards.map((card, i) => (
            <div key={card.title} className="flex items-center">
              {/* Card */}
              <div
                className="anim-card flex-1 backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center"
                style={{ opacity: 0, transform: 'translateY(40px)' }}
              >
                <h3 className="text-lg font-bold text-white mb-4">{card.title}</h3>
                {card.content}
              </div>

              {/* Arrow connector (not after last card) */}
              {i < flowCards.length - 1 && (
                <div
                  className="anim-arrow hidden md:flex items-center justify-center w-10 shrink-0"
                  style={{ opacity: 0 }}
                >
                  <svg className="w-6 h-6 text-momento-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              )}

              {/* Mobile arrow (down) */}
              {i < flowCards.length - 1 && (
                <div
                  className="anim-arrow flex md:hidden items-center justify-center py-2"
                  style={{ opacity: 0 }}
                >
                  <svg className="w-6 h-6 text-momento-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Key metrics pills */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-16">
          {pills.map((pill) => (
            <div
              key={pill.label}
              className="anim-pill flex items-center gap-2 rounded-full backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] px-6 py-3 text-sm text-momento-text-secondary"
              style={{ opacity: 0, transform: 'translateY(20px)' }}
            >
              <span className="text-momento-primary">{pill.icon}</span>
              <span>{pill.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
