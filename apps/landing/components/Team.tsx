'use client';

import { useEffect, useRef, useState } from 'react';

const team = [
  {
    name: 'J V',
    role: 'Co-Founder',
    bio: 'Web3 builder. Previously founded two crypto startups.',
    initials: 'JV',
    accent: '#00FF88',
  },
  {
    name: 'S P',
    role: 'Co-Founder',
    bio: 'AI engineer and systems architect. Built scalable platforms at enterprise scale.',
    initials: 'SP',
    accent: '#4488FF',
  },
  {
    name: 'J T',
    role: 'Advisor',
    bio: 'Creator economy veteran. Deep expertise in talent monetization.',
    initials: 'JT',
    accent: '#AA66FF',
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
    <section id="team" ref={sectionRef} className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-4">
            THE TEAM
          </p>
          <h2
            className={`text-4xl md:text-5xl font-bold text-center text-white transition-all duration-700 ease-out
                        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            Built by operators
          </h2>
          <p
            className={`text-momento-text-secondary text-center text-lg mt-4 transition-all duration-700 ease-out delay-100
                        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            From the creator economy, fintech, and Web3.
          </p>
        </div>

        {/* Team cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {team.map((member, i) => (
            <div
              key={member.name}
              className={`backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center
                         hover:border-white/[0.16] hover:-translate-y-0.5
                         transition-all duration-700 ease-out
                         ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${(i + 1) * 100}ms` }}
            >
              {/* Avatar */}
              <div
                className="w-20 h-20 rounded-full mx-auto flex items-center justify-center border-2"
                style={{
                  borderColor: member.accent,
                  backgroundColor: `${member.accent}1A`,
                }}
              >
                <span
                  className="font-bold text-xl"
                  style={{ color: member.accent }}
                >
                  {member.initials}
                </span>
              </div>

              {/* Name */}
              <h3 className="text-xl font-bold text-white mt-4">
                {member.name}
              </h3>

              {/* Role */}
              <p
                className="text-sm font-medium mt-1"
                style={{ color: member.accent }}
              >
                {member.role}
              </p>

              {/* Bio */}
              <p className="text-sm text-momento-text-secondary mt-2">
                {member.bio}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
