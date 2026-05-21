'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import BetaJoinCTA from './BetaJoinCTA';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'backdrop-blur-xl bg-black/70 border-b border-white/[0.04]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3 group"
        >
          <Image
            src="/logo-white.svg"
            alt="Momento"
            width={28}
            height={28}
            className="transition-transform duration-300 group-hover:scale-110"
          />
          <span className="text-white text-[11px] font-mono tracking-[0.3em] uppercase">
            Momento
          </span>
        </button>

        {/* CTA — Join Beta opens TestFlight install modal */}
        <BetaJoinCTA variant="compact" />
      </div>
    </nav>
  );
}
