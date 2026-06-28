'use client';

import { useEffect, useRef, useState } from 'react';

function useCountUp(target: number, duration: number, start: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;

    let startTime: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, start]);

  return value;
}

const stats = [
  { value: 1000, suffix: '+', label: 'Early Access Signups' },
  { value: 50, suffix: '+', label: 'Creator Applications' },
  { value: 1, suffix: '', label: 'Blockchain: Solana' },
];

function StatCard({
  stat,
  started,
}: {
  stat: (typeof stats)[number];
  started: boolean;
}) {
  const count = useCountUp(stat.value, 1500, started);
  const display = `${count.toLocaleString()}${stat.suffix}`;

  return (
    <div className="text-center">
      <p className="text-3xl md:text-5xl font-bold text-white font-mono">{display}</p>
      <p className="text-[10px] text-[#666666] mt-2 font-mono uppercase tracking-[0.15em]">{stat.label}</p>
    </div>
  );
}

export default function Proof() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 }
    );

    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, []);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');
      if (!sectionRef.current) return;

      const trigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 100px',
      });

      animate(sectionRef.current.querySelector('.anim-stats'), {
        opacity: [0, 1],
        translateY: [40, 0],
        duration: 1000,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      animate(sectionRef.current.querySelector('.anim-believers'), {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: 300,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });

      animate(sectionRef.current.querySelector('.anim-credits'), {
        opacity: [0, 1],
        delay: 500,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: trigger,
      });
    };

    init();
  }, []);

  return (
    <section id="team" ref={sectionRef} className="py-16 md:py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Stats */}
        <div
          className="anim-stats grid grid-cols-3 gap-8 md:gap-16"
          style={{ opacity: 0, transform: 'translateY(40px)' }}
        >
          {stats.map((stat, i) => (
            <StatCard key={i} stat={stat} started={statsVisible} />
          ))}
        </div>

        {/* Early Believers */}
        <div
          className="anim-believers mt-20 text-center"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <p className="font-mono text-[10px] text-momento-primary uppercase tracking-[0.3em] mb-6">
            Early Believers
          </p>
          <p className="text-[#666666] text-sm font-mono leading-relaxed">
            Backed by operators from the creator economy, fintech, and Web3
          </p>
        </div>

        {/* Team credits */}
        <div
          className="anim-credits mt-16 text-center"
          style={{ opacity: 0 }}
        >
          <div className="section-divider mb-8" />
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-center">
              <p className="text-white text-sm font-mono font-bold uppercase">JV</p>
              <p className="text-[#444444] text-[10px] font-mono uppercase tracking-wider">Co-Founder</p>
            </div>
            <span className="text-[#222222] font-mono">/</span>
            <div className="text-center">
              <p className="text-white text-sm font-mono font-bold uppercase">SP</p>
              <p className="text-[#444444] text-[10px] font-mono uppercase tracking-wider">Co-Founder</p>
            </div>
            <span className="text-[#222222] font-mono">/</span>
            <div className="text-center">
              <p className="text-white text-sm font-mono font-bold uppercase">JT</p>
              <p className="text-[#444444] text-[10px] font-mono uppercase tracking-wider">Advisor</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
