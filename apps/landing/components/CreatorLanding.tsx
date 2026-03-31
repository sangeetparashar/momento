'use client';

import { useState, useEffect, useRef } from 'react';
import WaitlistForm from './WaitlistForm';

type Phase = 'loading' | 'polaroid' | 'profile';

export default function CreatorLanding() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [profileRevealed, setProfileRevealed] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Auto-transition: loading → polaroid
  useEffect(() => {
    const timer = setTimeout(() => setPhase('polaroid'), 2500);
    return () => clearTimeout(timer);
  }, []);

  // When profile phase starts, trigger staggered reveals
  useEffect(() => {
    if (phase === 'profile') {
      setTimeout(() => setProfileRevealed(true), 100);

      // Init anime.js scroll animations for below-the-fold content
      const initAnime = async () => {
        const { animate, onScroll } = await import('animejs');

        if (!profileRef.current) return;

        // Animate post cards on scroll
        const postCards = profileRef.current.querySelectorAll('.anim-post');
        if (postCards.length) {
          animate(postCards, {
            opacity: [0, 1],
            translateY: [30, 0],
            delay: (_: unknown, i: number) => i * 100,
            duration: 800,
            easing: 'easeOutCubic',
            autoplay: onScroll({
              target: profileRef.current.querySelector('.posts-section') as Element,
              enter: 'bottom -= 100px',
            }),
          });
        }

        // Animate credits section
        const credits = profileRef.current.querySelector('.anim-credits');
        if (credits) {
          animate(credits, {
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 800,
            easing: 'easeOutCubic',
            autoplay: onScroll({
              target: credits,
              enter: 'bottom -= 80px',
            }),
          });
        }

        // Animate final CTA
        const finalCta = profileRef.current.querySelector('.anim-final-cta');
        if (finalCta) {
          animate(finalCta, {
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 1000,
            easing: 'easeOutCubic',
            autoplay: onScroll({
              target: finalCta,
              enter: 'bottom -= 100px',
            }),
          });
        }
      };

      setTimeout(initAnime, 800);
    }
  }, [phase]);

  const scrollToWaitlist = () => {
    const el = document.getElementById('waitlist-form');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black">
      {/* ═══ PHASE 1: LOADING ═══ */}
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-700 ${
          phase === 'loading' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-momento-primary animate-pulse-dot" />
          <p className="loading-text text-sm text-[#666666] lowercase">
            loading your momento...
          </p>
        </div>
      </div>

      {/* ═══ PHASE 2: POLAROID ═══ */}
      <div
        className={`fixed inset-0 z-40 flex flex-col items-center justify-center bg-black transition-all duration-700 ${
          phase === 'polaroid' ? 'opacity-100 scale-100' : phase === 'profile' ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <button
          onClick={() => setPhase('profile')}
          className="polaroid animate-polaroid-float focus:outline-none"
          aria-label="Enter Momento"
        >
          {/* Photo area */}
          <div className="w-64 h-64 md:w-72 md:h-72 bg-black rounded-sm overflow-hidden relative">
            {/* Gradient background inside polaroid */}
            <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0a0a0a] to-black" />

            {/* Breathing green glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-[#00FF88]/[0.08] rounded-full blur-[60px] animate-breathe-glow" />

            {/* Logo + text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <svg
                width="48"
                height="48"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
              </svg>
              <span className="font-display text-2xl font-bold text-white tracking-[0.2em] uppercase">
                MOMENTO
              </span>
            </div>
          </div>

          {/* Polaroid caption area */}
          <p className="text-center text-[#999] text-sm mt-1 italic" style={{ fontFamily: 'Georgia, serif' }}>
            own the culture
          </p>
        </button>

        {/* Tap hint */}
        <p className="mt-8 text-[#333] text-xs font-mono animate-pulse-dot">
          tap to enter
        </p>
      </div>

      {/* ═══ PHASE 3: CREATOR PROFILE ═══ */}
      <div
        ref={profileRef}
        className={`transition-opacity duration-700 ${
          phase === 'profile' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ─── Cover Area ─── */}
        <div className="profile-cover h-48 md:h-64 relative overflow-hidden">
          {/* Breathing orbs */}
          <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-[#00FF88]/[0.06] rounded-full blur-[120px] animate-flutter" />
          <div className="absolute bottom-[10%] right-[15%] w-[250px] h-[250px] bg-[#00FF88]/[0.04] rounded-full blur-[100px] animate-breathe-glow" />
        </div>

        {/* ─── Profile Content ─── */}
        <div className="max-w-2xl mx-auto px-6 -mt-12 relative z-10">

          {/* Avatar */}
          <div
            className={`transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '0ms' }}
          >
            <div className="w-24 h-24 rounded-full bg-black border-4 border-black flex items-center justify-center overflow-hidden">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-momento-primary/20 to-momento-primary/5 flex items-center justify-center">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Name + Token */}
          <div
            className={`mt-4 transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white">Momento</h1>
            <p className="text-momento-primary font-mono font-bold text-sm mt-1">$MOMENTO</p>
          </div>

          {/* Location */}
          <div
            className={`flex items-center gap-1.5 mt-2 transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            <svg className="w-3.5 h-3.5 text-momento-primary" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="text-[#666666] text-sm">Toronto · Coming 2026</span>
          </div>

          {/* Bio */}
          <p
            className={`text-[#999999] text-base leading-relaxed mt-4 transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            The stock market for culture. Invest in the creators you believe in and profit alongside the culture you shape.
          </p>

          {/* Stats Card */}
          <div
            className={`profile-stats-card mt-6 grid grid-cols-3 divide-x divide-white/[0.06] transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="text-center py-4">
              <p className="text-2xl font-black text-white font-mono">1K+</p>
              <p className="text-xs text-[#666666] mt-0.5">Waitlist</p>
            </div>
            <div className="text-center py-4">
              <p className="text-2xl font-black text-white font-mono">50+</p>
              <p className="text-xs text-[#666666] mt-0.5">Creators</p>
            </div>
            <div className="text-center py-4">
              <p className="text-2xl font-black text-white font-mono">4</p>
              <p className="text-xs text-[#666666] mt-0.5">Partners</p>
            </div>
          </div>

          {/* Action Buttons — FOLLOW / BUY style */}
          <div
            className={`grid grid-cols-2 gap-3 mt-6 transition-all duration-700 ease-out ${
              profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="profile-btn-outline text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              FOLLOW
            </a>
            <button
              onClick={scrollToWaitlist}
              className="profile-btn-primary text-sm"
            >
              JOIN WAITLIST
            </button>
          </div>

          {/* ─── POSTS Section ─── */}
          <div className="posts-section mt-12">
            <p
              className={`text-momento-primary font-mono text-xs uppercase tracking-[3px] mb-6 transition-all duration-700 ease-out ${
                profileRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: '600ms' }}
            >
              Posts
            </p>

            {/* Post Grid — 2 columns like the app */}
            <div className="grid grid-cols-2 gap-3">
              {/* Post 1: Discover */}
              <div className="anim-post post-card" style={{ opacity: 0 }}>
                <div className="p-4 h-full">
                  <div className="w-10 h-10 rounded-xl bg-momento-primary/10 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">Discover</h3>
                  <p className="text-[#666666] text-xs mt-1 leading-relaxed">Find creators in your city. Your feed is powered by location.</p>
                </div>
              </div>

              {/* Post 2: Trade */}
              <div className="anim-post post-card" style={{ opacity: 0 }}>
                <div className="p-4 h-full">
                  <div className="w-10 h-10 rounded-xl bg-momento-primary/10 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">Trade</h3>
                  <p className="text-[#666666] text-xs mt-1 leading-relaxed">Buy and sell creator tokens. Prices move with real momentum.</p>
                </div>
              </div>

              {/* Post 3: Build */}
              <div className="anim-post post-card" style={{ opacity: 0 }}>
                <div className="p-4 h-full">
                  <div className="w-10 h-10 rounded-xl bg-momento-primary/10 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">Build</h3>
                  <p className="text-[#666666] text-xs mt-1 leading-relaxed">Track your portfolio. Creators and fans grow together.</p>
                </div>
              </div>

              {/* Post 4: The Manifesto (text post style) */}
              <div className="anim-post post-card" style={{ opacity: 0 }}>
                <div className="p-4 h-full flex flex-col justify-center">
                  <p className="text-white/80 text-sm leading-relaxed italic">
                    &ldquo;Creators earn pennies. Fans get likes. Momento flips this.&rdquo;
                  </p>
                  <p className="text-momento-primary text-xs font-mono mt-3">@momento</p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── How It Works (minimal, like app UI) ─── */}
          <div className="mt-12 py-8 border-t border-white/[0.04]">
            <p className="text-momento-primary font-mono text-xs uppercase tracking-[3px] mb-6">
              How It Works
            </p>
            <div className="grid grid-cols-4 gap-2">
              {['Launch', 'Buy In', 'Grow', 'Profit'].map((step, i) => (
                <div key={step} className="text-center">
                  <span className="font-mono text-[10px] text-momento-primary/40 block mb-1">0{i + 1}</span>
                  <p className="text-white text-xs font-semibold">{step}</p>
                </div>
              ))}
            </div>
            {/* Token flow */}
            <div className="flex items-center justify-center gap-3 mt-6 text-xs">
              <span className="font-mono text-white/50">Creator</span>
              <svg className="w-4 h-4 text-momento-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <span className="font-mono text-momento-primary font-semibold">$TOKEN</span>
              <svg className="w-4 h-4 text-momento-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <span className="font-mono text-white/50">Community</span>
            </div>
          </div>

          {/* ─── Credits / Team ─── */}
          <div className="anim-credits py-8 border-t border-white/[0.04]" style={{ opacity: 0 }}>
            <p className="text-momento-primary font-mono text-xs uppercase tracking-[3px] mb-4">
              Built By
            </p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-white text-sm font-medium">JV</p>
                <p className="text-[#444444] text-xs font-mono">Co-Founder</p>
              </div>
              <span className="text-[#222222]">/</span>
              <div>
                <p className="text-white text-sm font-medium">SP</p>
                <p className="text-[#444444] text-xs font-mono">Co-Founder</p>
              </div>
              <span className="text-[#222222]">/</span>
              <div>
                <p className="text-white text-sm font-medium">JT</p>
                <p className="text-[#444444] text-xs font-mono">Advisor</p>
              </div>
            </div>
          </div>

          {/* ─── Final CTA ─── */}
          <div
            className="anim-final-cta py-16 text-center border-t border-white/[0.04]"
            style={{ opacity: 0 }}
          >
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
              Be First.
            </h2>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-shimmer mt-1">
              Own the Culture.
            </h2>
            <div id="waitlist-form" className="mt-8">
              <WaitlistForm />
            </div>
            <p className="mt-4 font-mono text-xs text-[#333333]">Solana-powered</p>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <footer className="border-t border-white/[0.04] mt-8">
          <div className="max-w-2xl mx-auto py-6 px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
                <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
              </svg>
              <span className="text-white text-xs tracking-[0.2em] uppercase">Momento</span>
            </div>
            <p className="text-[#333333] text-xs font-mono">&copy; 2026</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
