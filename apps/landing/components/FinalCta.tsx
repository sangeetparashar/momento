'use client';

import { useEffect, useRef, useState } from 'react';
import WaitlistForm from '@/components/WaitlistForm';

export default function FinalCta() {
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
      { threshold: 0.1 }
    );

    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <section
      id="waitlist"
      ref={sectionRef}
      className="min-h-[80vh] flex items-center justify-center relative overflow-hidden px-6"
    >
      {/* Ambient gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[180px] opacity-20"
          style={{
            background: 'radial-gradient(circle, #00FF88 0%, transparent 70%)',
            animation: 'floatOrb1 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[160px] opacity-15"
          style={{
            background: 'radial-gradient(circle, #00CC6A 0%, transparent 70%)',
            animation: 'floatOrb2 10s ease-in-out infinite',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-[200px] opacity-10"
          style={{
            background: 'radial-gradient(circle, #00FFAA 0%, transparent 70%)',
            animation: 'floatOrb3 12s ease-in-out infinite',
          }}
        />
      </div>

      {/* Keyframes */}
      <style jsx>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -20px); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-25px, 15px); }
        }
        @keyframes floatOrb3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        {/* Logo mark */}
        <div
          className={`flex justify-center mb-8 transition-all duration-700 ease-out
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="48" height="48" rx="12" fill="#00FF88" fillOpacity="0.15" />
            <text
              x="24"
              y="32"
              textAnchor="middle"
              fill="#00FF88"
              fontSize="24"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              M
            </text>
          </svg>
        </div>

        {/* Headline */}
        <h2
          className={`text-5xl md:text-7xl font-black text-center transition-all duration-700 ease-out delay-100
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <span className="text-white block">Be First.</span>
          <span className="text-shimmer block">Own the Culture.</span>
        </h2>

        {/* Subtitle */}
        <p
          className={`text-lg text-momento-text-secondary text-center max-w-xl mx-auto mt-6
                      transition-all duration-700 ease-out delay-200
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          Join the waitlist for early access to Momento. Be part of the future of the creator economy.
        </p>

        {/* Waitlist form */}
        <div
          className={`mt-10 flex justify-center transition-all duration-700 ease-out delay-300
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <WaitlistForm />
        </div>

        {/* Social links */}
        <div
          className={`flex items-center justify-center gap-6 mt-8 transition-all duration-700 ease-out delay-[400ms]
                      ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-momento-text-secondary hover:text-white transition-colors duration-200"
            aria-label="Follow on X"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-momento-text-secondary hover:text-white transition-colors duration-200"
            aria-label="Follow on Instagram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
