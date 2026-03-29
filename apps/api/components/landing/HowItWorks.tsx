'use client';

import { useEffect, useRef } from 'react';

const steps = [
  {
    number: '01',
    title: 'Creators Launch',
    description:
      'A creator mints their token in minutes. No crypto knowledge needed.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Fans Buy In',
    description:
      'Buy creator tokens like buying stock. Start with as little as $1.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Markets Move',
    description:
      'Tokens trade live. Price reflects real creator momentum.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Everyone Profits',
    description:
      'Creators and fans grow together. Real value, real returns.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      // Animate section label + heading — slide up
      animate(sectionRef.current.querySelector('.anim-heading')!, {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: onScroll({
          target: sectionRef.current,
          enter: 'bottom -= 100px',
        }),
      });

      // Animate step cards — slide up with stagger
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
    };

    init();
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section label */}
        <div className="anim-heading" style={{ opacity: 0, transform: 'translateY(30px)' }}>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px w-12 bg-momento-primary/30" />
            <p className="text-momento-primary text-xs font-medium uppercase tracking-[3px]">
              How It Works
            </p>
            <div className="h-px w-12 bg-momento-primary/30" />
          </div>

          {/* Heading */}
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 tracking-tight">
            Four steps to owning culture
          </h2>
        </div>

        {/* Step cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div
              key={step.number}
              className="anim-card group relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8
                         hover:border-momento-primary/30 hover:-translate-y-0.5
                         transition-colors duration-300"
              style={{ opacity: 0, transform: 'translateY(40px)' }}
            >
              {/* Watermark number */}
              <span className="absolute top-4 right-4 text-6xl font-black text-white/[0.05] select-none leading-none">
                {step.number}
              </span>

              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-momento-primary/10 flex items-center justify-center text-momento-primary">
                {step.icon}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mt-4">{step.title}</h3>

              {/* Description */}
              <p className="text-sm text-momento-text-secondary mt-2 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
