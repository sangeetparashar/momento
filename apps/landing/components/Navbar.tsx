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
        <span className="text-white font-extrabold text-xl tracking-tight">
          MOMENTO
        </span>
        <button
          onClick={scrollToTop}
          className="px-5 py-2 rounded-full border border-momento-primary text-momento-primary text-sm font-semibold
                     hover:bg-momento-primary hover:text-momento-bg transition-all duration-200"
        >
          Join Waitlist
        </button>
      </div>
    </nav>
  );
}
