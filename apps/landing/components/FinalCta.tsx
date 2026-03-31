'use client';

import { useEffect, useRef } from 'react';
import WaitlistForm from '@/components/WaitlistForm';

export default function FinalCta() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      const trigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 100px',
      });

      animate(sectionRef.current.querySelectorAll('.anim-heading'), {
        opacity: [0, 1],
        translateY: [30, 0],
        delay: (_: unknown, i: number) => i * 120,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      animate(sectionRef.current.querySelector('.anim-form'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: 300,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      animate(sectionRef.current.querySelector('.anim-social'), {
        opacity: [0, 1],
        delay: 400,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });
    };

    init();
  }, []);

  return (
    <section
      id="waitlist-final"
      ref={sectionRef}
      className="min-h-[80vh] flex items-center justify-center relative overflow-hidden px-6"
    >
      {/* Breathing gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[200px] animate-breathe-glow bg-[#00FF88]/[0.08]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[180px] animate-flutter bg-[#00FF88]/[0.05]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-[220px] animate-float-slow bg-[#00FFAA]/[0.04]" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Headline */}
        <h2 className="font-display text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight">
          <span
            className="anim-heading text-white block"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            Be First.
          </span>
          <span
            className="anim-heading text-shimmer block"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            Own the Culture.
          </span>
        </h2>

        {/* Waitlist */}
        <div
          className="anim-form mt-12 flex justify-center"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <WaitlistForm />
        </div>

        {/* Social links */}
        <div
          className="anim-social flex items-center justify-center gap-6 mt-8"
          style={{ opacity: 0 }}
        >
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#444444] hover:text-white transition-colors duration-200"
            aria-label="Follow on X"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#444444] hover:text-white transition-colors duration-200"
            aria-label="Follow on Instagram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
