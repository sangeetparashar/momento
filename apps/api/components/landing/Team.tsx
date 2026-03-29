'use client';

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (!sectionRef.current) return;

      const scrollTrigger = onScroll({
        target: sectionRef.current,
        enter: 'bottom -= 100px',
      });

      // Section label
      animate(sectionRef.current.querySelector('.anim-label')!, {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: scrollTrigger,
      });

      // Heading
      animate(sectionRef.current.querySelector('.anim-heading')!, {
        opacity: [0, 1],
        translateY: [30, 0],
        delay: 100,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: scrollTrigger,
      });

      // Subtitle
      animate(sectionRef.current.querySelector('.anim-subtitle')!, {
        opacity: [0, 1],
        translateY: [30, 0],
        delay: 200,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: scrollTrigger,
      });

      // Team cards with stagger + scale
      animate(sectionRef.current.querySelectorAll('.anim-card'), {
        opacity: [0, 1],
        translateY: [40, 0],
        scale: [0.95, 1],
        delay: (_, i) => 300 + i * 100,
        duration: 800,
        easing: 'easeOutCubic',
        autoplay: scrollTrigger,
      });
    };

    init();
  }, []);

  return (
    <section id="team" ref={sectionRef} className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p
            className="anim-label text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-4"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            THE TEAM
          </p>
          <h2
            className="anim-heading text-4xl md:text-5xl font-bold text-center text-white"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            Built by operators
          </h2>
          <p
            className="anim-subtitle text-momento-text-secondary text-center text-lg mt-4"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            From the creator economy, fintech, and Web3.
          </p>
        </div>

        {/* Team cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {team.map((member) => (
            <div
              key={member.name}
              className="anim-card backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center
                         hover:border-white/[0.16] hover:-translate-y-0.5 transition-all duration-300"
              style={{ opacity: 0, transform: 'translateY(40px) scale(0.95)' }}
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
