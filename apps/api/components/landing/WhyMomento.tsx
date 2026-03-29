'use client';

import { useEffect, useRef, useState } from 'react';

const valueProps = [
  {
    title: 'Bringing Control to the People',
    description:
      'The current system is too centralized, too out of your control. Momento decentralizes income in the arts, allowing everyone to play in the space. The people dictate value, not algorithms.',
    direction: 'left' as const,
  },
  {
    title: 'Creators Deserve More',
    description:
      'Creators build audiences that make platforms rich while seeing little in return. Momento gives them a direct line to fan investment and a new path to financial independence.',
    direction: 'right' as const,
  },
  {
    title: 'Internet Capital Markets',
    description:
      'The infrastructure for real consumer-grade financial products has matured. Momento is the product built on top of it \u2014 with stringent KYC and compliance from day one.',
    direction: 'left' as const,
  },
];

function ValueCard({
  title,
  description,
  direction,
  index,
}: {
  title: string;
  description: string;
  direction: 'left' | 'right';
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
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

    const el = cardRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group flex items-start gap-6 p-8 rounded-2xl bg-momento-bg-secondary border border-momento-border
                  hover:border-momento-primary/20 hover:shadow-[0_0_40px_rgba(0,255,136,0.06)]
                  max-w-2xl transition-all duration-[800ms] ease-out
                  ${index % 2 === 1 ? 'ml-auto' : ''}
                  ${visible
                    ? 'opacity-100 translate-x-0'
                    : `opacity-0 ${direction === 'left' ? '-translate-x-12' : 'translate-x-12'}`
                  }`}
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-momento-primary/10 group-hover:bg-momento-primary/20
                      flex items-center justify-center mt-1 transition-colors duration-300">
        <div className="w-2.5 h-2.5 rounded-full bg-momento-primary" />
      </div>
      <div>
        <h3 className="text-white font-bold text-xl mb-2 group-hover:text-momento-primary transition-colors duration-300">
          {title}
        </h3>
        <p className="text-momento-text-secondary leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function WhyMomento() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-3 text-center">
          Why Momento
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 tracking-tight">
          Culture is the new asset class
        </h2>

        <div className="space-y-8">
          {valueProps.map((prop, i) => (
            <ValueCard key={i} index={i} {...prop} />
          ))}
        </div>
      </div>
    </section>
  );
}
