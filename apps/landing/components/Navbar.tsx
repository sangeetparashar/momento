'use client';

import { useEffect, useState } from 'react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'backdrop-blur-xl bg-black/60 border-b border-white/[0.04]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <svg
            width="32"
            height="32"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-300 hover:scale-110"
          >
            <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
          </svg>
          <span className="text-white text-sm font-medium tracking-[0.3em] uppercase">
            MOMENTO
          </span>
        </div>

        {/* Single CTA */}
        <button
          onClick={() => scrollTo('waitlist')}
          className="px-6 py-2.5 rounded-full bg-[#00FF88] text-black font-semibold text-sm
                     hover:scale-105 hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]
                     active:scale-[0.98] transition-all duration-200 breathe-green"
        >
          Join Waitlist
        </button>
      </div>
    </nav>
  );
}
