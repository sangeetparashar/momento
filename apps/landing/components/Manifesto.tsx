'use client';

import { useEffect, useRef } from 'react';

export default function Manifesto() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      const trigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 100px',
      });

      // Main statement — fade + slide
      animate(sectionRef.current.querySelector('.anim-statement'), {
        opacity: [0, 1],
        translateY: [40, 0],
        duration: 1000,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      // Flip line
      animate(sectionRef.current.querySelector('.anim-flip'), {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        delay: 300,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });
    };

    init();
  }, []);

  return (
    <section ref={sectionRef} className="py-32 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Single massive typographic statement */}
        <div
          className="anim-statement"
          style={{ opacity: 0, transform: 'translateY(40px)' }}
        >
          <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
            Creators earn pennies.
          </h2>
          <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-[#333333] leading-[1.1] tracking-tight mt-2">
            Fans get likes. Not equity.
          </h2>
        </div>

        {/* The flip */}
        <div
          className="anim-flip mt-12"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <div className="section-divider mb-8" />
          <p className="font-display text-2xl md:text-3xl font-semibold text-momento-primary">
            Momento flips this.
          </p>
        </div>
      </div>
    </section>
  );
}
