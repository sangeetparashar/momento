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

      animate(sectionRef.current.querySelector('.anim-statement'), {
        opacity: [0, 1],
        translateY: [40, 0],
        duration: 1000,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

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
    <section ref={sectionRef} className="py-16 md:py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div
          className="anim-statement"
          style={{ opacity: 0, transform: 'translateY(40px)' }}
        >
          <h2 className="font-mono text-2xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.15] tracking-tight uppercase">
            Creators earn pennies.
          </h2>
          <h2 className="font-mono text-2xl md:text-4xl lg:text-5xl font-bold text-[#333333] leading-[1.15] tracking-tight mt-2 uppercase">
            Fans get likes. Not equity.
          </h2>
        </div>

        <div
          className="anim-flip mt-12"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <div className="section-divider mb-8" />
          <p className="font-mono text-xl md:text-2xl font-bold text-momento-primary uppercase tracking-wider">
            Momento flips this.
          </p>
        </div>
      </div>
    </section>
  );
}
