'use client';

import { useEffect, useRef } from 'react';
import PhoneFrame from './PhoneFrame';

interface ShowcaseSectionProps {
  screen: React.ReactNode;
  label: string;
  title: string;
  subtitle: string;
  index: number;
  side: 'left' | 'right';
}

export default function ShowcaseSection({
  screen,
  label,
  title,
  subtitle,
  index,
  side,
}: ShowcaseSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');
      if (!sectionRef.current) return;

      const textEl = sectionRef.current.querySelector('.showcase-text');
      const phoneEl = sectionRef.current.querySelector('.showcase-phone');
      const mobileCard = sectionRef.current.querySelector('.showcase-mobile-card');

      const scrollTrigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 150px',
      });

      // Animate text from the side
      if (textEl) {
        animate(textEl, {
          opacity: [0, 1],
          translateX: [side === 'left' ? -40 : 40, 0],
          duration: 900,
          easing: 'easeOutCubic',
          autoplay: scrollTrigger,
        });
      }

      // Animate phone from below
      if (phoneEl) {
        animate(phoneEl, {
          opacity: [0, 1],
          translateY: [50, 0],
          duration: 1000,
          delay: 200,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: sectionRef.current,
            enter: 'bottom -= 150px',
          }),
        });
      }

      // Mobile card animation
      if (mobileCard) {
        animate(mobileCard, {
          opacity: [0, 1],
          translateY: [40, 0],
          duration: 800,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: sectionRef.current,
            enter: 'bottom -= 100px',
          }),
        });
      }
    };

    init();
  }, [side]);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center py-16 md:py-0 px-6"
    >
      <div className="max-w-6xl w-full mx-auto">
        {/* ─── Desktop Layout ─── */}
        <div className="hidden md:grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text side */}
          <div
            className={`showcase-text space-y-5 ${side === 'right' ? 'md:order-2' : 'md:order-1'}`}
            style={{ opacity: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-momento-primary font-mono text-xs font-bold">
                0{index + 1}
              </span>
              <div className="w-8 h-px bg-momento-primary/30" />
              <span className="text-momento-primary/60 text-xs uppercase tracking-[2px] font-mono">
                {label}
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl xl:text-5xl font-bold text-white leading-tight">
              {title}
            </h2>
            <p className="text-white/50 text-base lg:text-lg leading-relaxed max-w-md">
              {subtitle}
            </p>
          </div>

          {/* Phone side */}
          <div
            className={`showcase-phone flex justify-center ${side === 'right' ? 'md:order-1' : 'md:order-2'}`}
            style={{ opacity: 0 }}
          >
            <PhoneFrame>{screen}</PhoneFrame>
          </div>
        </div>

        {/* ─── Mobile Layout ─── */}
        <div
          className="md:hidden showcase-mobile-card space-y-6"
          style={{ opacity: 0 }}
        >
          {/* Text above */}
          <div className="space-y-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-momento-primary font-mono text-xs font-bold">
                0{index + 1}
              </span>
              <div className="w-6 h-px bg-momento-primary/30" />
              <span className="text-momento-primary/60 text-[10px] uppercase tracking-[2px] font-mono">
                {label}
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              {title}
            </h2>
            <p className="text-white/50 text-sm leading-relaxed max-w-sm mx-auto">
              {subtitle}
            </p>
          </div>

          {/* Screen as card (no phone frame) */}
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden bg-[#0a0a0a] mx-auto max-w-[320px]"
            style={{ aspectRatio: '9 / 16' }}
          >
            {screen}
          </div>
        </div>
      </div>
    </section>
  );
}
