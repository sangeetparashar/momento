'use client';

import { useEffect, useRef, useState } from 'react';

const valueProps = [
  {
    title: 'Fans Want Ownership',
    description:
      'A generation raised on social media wants more than likes and follows. They want a stake in the culture they help build.',
    direction: 'left' as const,
  },
  {
    title: 'Creators Deserve More',
    description:
      'Creators are tired of building audiences that make platforms rich. Momento gives them a direct line to fan investment.',
    direction: 'right' as const,
  },
  {
    title: 'The Infrastructure Is Ready',
    description:
      'The technology to power real consumer-grade financial products has matured. Momento is the product built on top of it.',
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
      className={`flex items-start gap-6 p-8 rounded-2xl bg-momento-bg-secondary border border-momento-border
                  max-w-2xl transition-all duration-[800ms] ease-out
                  ${index % 2 === 1 ? 'ml-auto' : ''}
                  ${visible
                    ? 'opacity-100 translate-x-0'
                    : `opacity-0 ${direction === 'left' ? '-translate-x-12' : 'translate-x-12'}`
                  }`}
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-momento-primary/10 flex items-center justify-center mt-1">
        <div className="w-2.5 h-2.5 rounded-full bg-momento-primary" />
      </div>
      <div>
        <h3 className="text-white font-bold text-xl mb-2">{title}</h3>
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
