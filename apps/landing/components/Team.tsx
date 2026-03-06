'use client';

import { useEffect, useRef, useState } from 'react';

const team = [
  {
    name: 'J V',
    title: 'Web3 Founder',
    initial: 'J',
    accentColor: 'bg-momento-primary/20',
  },
  {
    name: 'S P',
    title: 'AI Engineer/Architect',
    initial: 'S',
    accentColor: 'bg-blue-500/20',
  },
  {
    name: 'J T',
    title: 'Creator Economy Expert',
    initial: 'J',
    accentColor: 'bg-purple-500/20',
  },
];

export default function Team() {
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
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-3">
          The Team
        </p>
        <h2 className="text-xl sm:text-2xl font-bold mb-12 tracking-tight text-momento-text-secondary max-w-xl mx-auto">
          Built by operators from the creator economy, fintech, and Web3.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {team.map((member, i) => (
            <div
              key={member.name}
              className={`group p-6 rounded-2xl bg-momento-bg-secondary border border-momento-border
                         hover:border-momento-primary/30 hover:shadow-[0_0_30px_rgba(0,255,136,0.08)]
                         transition-all duration-700 ease-out cursor-default
                         ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              {/* Avatar with accent ring */}
              <div className={`w-14 h-14 rounded-full ${member.accentColor} border border-momento-border
                              mx-auto mb-4 flex items-center justify-center
                              group-hover:border-momento-primary/40 transition-colors duration-300`}>
                <span className="text-momento-primary font-bold text-lg">
                  {member.initial}
                </span>
              </div>
              <h3 className="text-white font-semibold group-hover:text-momento-primary transition-colors duration-300">
                {member.name}
              </h3>
              <p className="text-momento-text-secondary text-sm mt-1">
                {member.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
