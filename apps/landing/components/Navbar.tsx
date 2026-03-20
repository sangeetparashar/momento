'use client';

import { useEffect, useState } from 'react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const navLinks = [
    { label: 'How It Works', id: 'how-it-works' },
    { label: 'Features', id: 'features' },
    { label: 'Team', id: 'team' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'backdrop-blur-xl bg-black/40 border-b border-white/5 shadow-lg shadow-black/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + wordmark */}
        <div className="flex items-center gap-3">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-300 hover:scale-110"
          >
            <circle cx="16" cy="16" r="14" stroke="#00FF88" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="6" fill="#00FF88" />
          </svg>
          <span className="text-white text-sm font-medium tracking-[0.3em] uppercase">
            MOMENTO
          </span>
        </div>

        {/* Center: Nav links (desktop) */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollTo(link.id)}
              className="text-sm text-white/60 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right: CTA (desktop) + hamburger (mobile) */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => scrollTo('waitlist')}
            className="hidden md:block px-6 py-2.5 rounded-full bg-[#00FF88] text-black font-semibold text-sm
                       hover:scale-105 hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]
                       active:scale-[0.98] transition-all duration-200"
          >
            Join Waitlist
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex flex-col gap-1.5 p-2"
            aria-label="Toggle menu"
          >
            <span
              className={`block w-5 h-[2px] bg-white transition-all duration-300 ${
                mobileOpen ? 'rotate-45 translate-y-[5px]' : ''
              }`}
            />
            <span
              className={`block w-5 h-[2px] bg-white transition-all duration-300 ${
                mobileOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`block w-5 h-[2px] bg-white transition-all duration-300 ${
                mobileOpen ? '-rotate-45 -translate-y-[5px]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile slide-down panel */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="backdrop-blur-xl bg-black/60 border-t border-white/5 px-6 py-6 flex flex-col gap-4">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollTo(link.id)}
              className="text-sm text-white/70 hover:text-white transition-colors duration-200 text-left py-2"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => scrollTo('waitlist')}
            className="mt-2 px-6 py-2.5 rounded-full bg-[#00FF88] text-black font-semibold text-sm
                       hover:scale-105 hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]
                       transition-all duration-200 w-full"
          >
            Join Waitlist
          </button>
        </div>
      </div>
    </nav>
  );
}
