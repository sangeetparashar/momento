'use client';

import { useEffect, useRef } from 'react';

const stats = [
  {
    number: '< 1%',
    description: 'of creator revenue goes directly to fans',
  },
  {
    number: '$0',
    description: 'earned by fans who make creators go viral',
  },
  {
    number: '70%',
    description: 'platform cut on most creator earnings',
  },
];

export default function ProblemHook() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      // Animate left column text — slide up
      animate(sectionRef.current.querySelector('.anim-text'), {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });

      // Animate stat cards — slide up with stagger
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

      // Animate "Momento flips this" text — fade in
      animate(sectionRef.current.querySelector('.anim-flip'), {
        opacity: [0, 1],
        translateY: [20, 0],
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
    <section
      id="problem"
      ref={sectionRef}
      className="relative py-24 px-6 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 20% 40%, rgba(0,255,136,0.04) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 60%, rgba(0,255,136,0.03) 0%, transparent 60%), #0a0a0a',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — bold statement */}
          <div className="anim-text" style={{ opacity: 0, transform: 'translateY(30px)' }}>
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              Creators earn pennies from platforms.
            </h2>
            <p className="text-4xl md:text-5xl font-bold text-momento-text-secondary mt-4 leading-tight">
              Fans get likes. Not equity.
            </p>
          </div>

          {/* Right column — stat cards */}
          <div className="flex flex-col gap-4">
            {stats.map((stat) => (
              <div
                key={stat.number}
                className="anim-card backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6"
                style={{ opacity: 0, transform: 'translateY(40px)' }}
              >
                <p className="text-4xl font-black text-momento-primary">{stat.number}</p>
                <p className="text-momento-text-secondary text-sm mt-1">{stat.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Transition text */}
        <p
          className="anim-flip text-center mt-12 text-momento-primary font-semibold text-lg"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          Momento flips this.
        </p>
      </div>
    </section>
  );
}
