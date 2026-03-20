'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  {
    number: '< 1%',
    description: 'of creator revenue goes directly to fans',
  },
  {
    number: '$0',
    description: 'earned by fans who make creators go viral',
  },
  {
    number: '70%',
    description: 'platform cut on most creator earnings',
  },
];

export default function ProblemHook() {
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
      { threshold: 0.15 }
    );

    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <section
      id="problem"
      ref={sectionRef}
      className="relative py-24 px-6 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 20% 40%, rgba(0,255,136,0.04) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 60%, rgba(0,255,136,0.03) 0%, transparent 60%), #0a0a0a',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — bold statement */}
          <div
            className={`transition-all duration-700 ease-out ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              Creators earn pennies from platforms.
            </h2>
            <p className="text-4xl md:text-5xl font-bold text-momento-text-secondary mt-4 leading-tight">
              Fans get likes. Not equity.
            </p>
          </div>

          {/* Right column — stat cards */}
          <div className="flex flex-col gap-4">
            {stats.map((stat, i) => (
              <div
                key={stat.number}
                className={`backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6
                           transition-all duration-700 ease-out
                           ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: `${200 + i * 100}ms` }}
              >
                <p className="text-4xl font-black text-momento-primary">{stat.number}</p>
                <p className="text-momento-text-secondary text-sm mt-1">{stat.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Transition text */}
        <p
          className={`text-center mt-12 text-momento-primary font-semibold text-lg
                     transition-all duration-700 ease-out
                     ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '600ms' }}
        >
          Momento flips this.
        </p>
      </div>
    </section>
  );
}
