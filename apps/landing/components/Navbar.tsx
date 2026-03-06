'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-momento-bg/80 backdrop-blur-xl border-b border-momento-border'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-white.svg"
            alt="Momento"
            width={28}
            height={28}
            className="transition-transform duration-300 hover:scale-110"
          />
          <span className="text-white font-extrabold text-lg tracking-[6px] uppercase">
            MOMENTO
          </span>
        </div>
        <button
          onClick={scrollToTop}
          className="px-5 py-2 rounded-full border border-momento-primary text-momento-primary text-sm font-semibold
                     hover:bg-momento-primary hover:text-momento-bg hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]
                     transition-all duration-200"
        >
          Join Waitlist
        </button>
      </div>
    </nav>
  );
}
