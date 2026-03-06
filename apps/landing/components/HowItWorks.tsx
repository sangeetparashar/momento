'use client';

import { useEffect, useRef, useState } from 'react';

const steps = [
  {
    number: '01',
    title: 'Creators Launch',
    description:
      'Your favorite creators mint their own token. No crypto knowledge needed.',
  },
  {
    number: '02',
    title: 'Fans Buy In',
    description:
      'Buy tokens like stocks. Back creators before they break through.',
  },
  {
    number: '03',
    title: 'Markets Move',
    description:
      'Tokens trade live, driven by cultural momentum.',
  },
  {
    number: '04',
    title: 'Everyone Profits',
    description:
      'Creators, fans, and platform all grow together.',
  },
];

export default function HowItWorks() {
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
      { threshold: 0.2 }
    );

    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-3 text-center">
          How It Works
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 tracking-tight">
          Four steps to owning culture
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`group p-6 rounded-2xl bg-momento-bg-secondary border border-momento-border
                         hover:border-momento-primary/30 hover:shadow-[0_0_30px_rgba(0,255,136,0.08)]
                         transition-all duration-700 ease-out
                         ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <div className="w-12 h-12 rounded-full border-2 border-momento-primary flex items-center justify-center mb-5">
                <span className="text-momento-primary font-mono font-bold text-sm">
                  {step.number}
                </span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
              <p className="text-momento-text-secondary text-[15px] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
