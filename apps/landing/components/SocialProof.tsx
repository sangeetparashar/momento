'use client';

import { useEffect, useRef, useState } from 'react';

/* ─── Animated Counter Hook ──────────────────────────────────── */
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
      // Ease-out cubic
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

/* ─── Stats Data ─────────────────────────────────────────────── */
const stats = [
  { value: 1000, suffix: '+', label: 'Early Access Signups' },
  { value: 50, suffix: '+', label: 'Creator Applications' },
  { value: 1, suffix: '', label: 'Blockchain: Solana' },
  { value: 0, suffix: '', prefix: '$', label: 'Platform Fees for Fans' },
];

/* ─── Stat Card ──────────────────────────────────────────────── */
function StatCard({
  stat,
  started,
}: {
  stat: (typeof stats)[number];
  started: boolean;
}) {
  const count = useCountUp(stat.value, 1500, started);
  const display = `${stat.prefix || ''}${count.toLocaleString()}${stat.suffix}`;

  return (
    <div className="text-center py-4">
      <p className="text-5xl md:text-6xl font-black text-white font-mono">{display}</p>
      <p className="text-sm text-momento-text-secondary mt-2">{stat.label}</p>
    </div>
  );
}

/* ─── Testimonial Data ───────────────────────────────────────── */
const testimonials = [
  {
    quote: 'Finally, a way to invest in the creators I actually care about.',
    name: 'Alex R.',
    role: 'Early Supporter',
  },
  {
    quote: 'This is what the creator economy has been missing — real ownership.',
    name: 'Maya K.',
    role: 'Content Creator',
  },
  {
    quote: 'The simplicity is what got me. No crypto knowledge needed.',
    name: 'Jordan T.',
    role: 'Beta Tester',
  },
];

/* ─── Quote Icon ─────────────────────────────────────────────── */
function QuoteIcon() {
  return (
    <svg className="w-8 h-8 text-momento-primary/20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 7H7a4 4 0 00-4 4v1a3 3 0 003 3h1a2 2 0 002-2v-1a2 2 0 00-2-2H6a2 2 0 012-2V7zm10 0h-4a4 4 0 00-4 4v1a3 3 0 003 3h1a2 2 0 002-2v-1a2 2 0 00-2-2h-1a2 2 0 012-2V7z" />
    </svg>
  );
}

/* ─── Main Export ─────────────────────────────────────────────── */
export default function SocialProof() {
  const statsRef = useRef<HTMLDivElement>(null);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  // IntersectionObserver ONLY for triggering the count-up animation
  useEffect(() => {
    const observerStats = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          observerStats.unobserve(entry.target);
        }
      },
      { threshold: 0.2 }
    );

    const statsEl = statsRef.current;
    if (statsEl) observerStats.observe(statsEl);

    return () => {
      if (statsEl) observerStats.unobserve(statsEl);
    };
  }, []);

  // anime.js onScroll for visual slide-in animations
  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      // Stats container slide up
      if (statsRef.current) {
        animate(statsRef.current, {
          opacity: [0, 1],
          translateY: [40, 0],
          duration: 1000,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: statsRef.current,
            enter: 'bottom -= 100px',
          }),
        });
      }

      if (testimonialsRef.current) {
        // Testimonial heading slide up
        animate(testimonialsRef.current.querySelector('.anim-heading'), {
          opacity: [0, 1],
          translateY: [30, 0],
          duration: 800,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: testimonialsRef.current,
            enter: 'bottom -= 100px',
          }),
        });

        // Testimonial cards slide up with stagger
        animate(testimonialsRef.current.querySelectorAll('.anim-card'), {
          opacity: [0, 1],
          translateY: [40, 0],
          delay: (_: unknown, i: number) => i * 150,
          duration: 800,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: testimonialsRef.current,
            enter: 'bottom -= 100px',
          }),
        });
      }
    };

    init();
  }, []);

  return (
    <section
      id="social-proof"
      className="py-24 px-6"
      style={{
        background:
          'linear-gradient(180deg, rgba(13,13,13,1) 0%, rgba(18,18,18,1) 30%, rgba(18,18,18,1) 70%, rgba(13,13,13,1) 100%)',
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* ─── Stats Counter ─────────────────────────────────── */}
        <div
          ref={statsRef}
          className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 md:p-12 backdrop-blur-sm"
          style={{ opacity: 0, transform: 'translateY(40px)' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <StatCard key={i} stat={stat} started={statsVisible} />
            ))}
          </div>
        </div>

        {/* ─── Testimonials ──────────────────────────────────── */}
        <div ref={testimonialsRef} className="mt-20">
          <h3
            className="anim-heading text-2xl font-bold text-center mb-10"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            Backed by believers
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="anim-card bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6"
                style={{ opacity: 0, transform: 'translateY(40px)' }}
              >
                <QuoteIcon />
                <p className="text-sm italic text-white/80 mt-3 leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-sm font-semibold text-white mt-4">{t.name}</p>
                <p className="text-xs text-momento-text-secondary">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
