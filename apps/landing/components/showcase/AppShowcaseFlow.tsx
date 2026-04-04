'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import PhoneFrame from './PhoneFrame';
import HomeFeedScreen from './HomeFeedScreen';
import ExploreScreen from './ExploreScreen';
import CreatorProfileScreen from './CreatorProfileScreen';
import OwnershipScreen from './OwnershipScreen';
import WaitlistForm from '../WaitlistForm';

const sections = [
  {
    label: 'Feed',
    title: 'Your feed. Your rules.',
    subtitle:
      'No algorithms deciding for you. Discover creators based on where you are — your city, your neighborhood, your culture.',
    screen: <HomeFeedScreen />,
  },
  {
    label: 'Explore',
    title: 'Find creators around you.',
    subtitle:
      'Location-powered discovery. Search by distance, browse by category, and find the talent thriving in your community.',
    screen: <ExploreScreen />,
  },
  {
    label: 'Profile',
    title: 'Support the creators you believe in.',
    subtitle:
      'Follow their journey, access exclusive content, and back them directly. Every interaction is real. Every supporter matters.',
    screen: <CreatorProfileScreen />,
  },
  {
    label: 'Yours',
    title: 'You own everything.',
    subtitle:
      'Your holdings. Your data. Your identity. Everything you earn, buy, or build on Momento belongs to you — secured by blockchain.',
    screen: <OwnershipScreen />,
  },
];

export default function AppShowcaseFlow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [inShowcase, setInShowcase] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Scroll to a specific section within the showcase
  const scrollToSection = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.offsetTop;
    const sectionHeight = container.offsetHeight / sections.length;
    const targetScroll = containerTop + sectionHeight * index + sectionHeight * 0.5;

    isScrollingRef.current = true;
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });

    // Release lock after animation completes
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 700);
  }, []);

  // Wheel event handler — one scroll = one section transition
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastWheelTime = 0;
    const COOLDOWN = 800; // ms between transitions

    const handleWheel = (e: WheelEvent) => {
      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const totalHeight = container.offsetHeight;

      // Only intercept when inside the showcase area
      const isInShowcase = scrolled >= -10 && scrolled <= totalHeight - 10;
      if (!isInShowcase) return;

      const now = Date.now();
      if (now - lastWheelTime < COOLDOWN) {
        e.preventDefault();
        return;
      }

      const direction = e.deltaY > 0 ? 1 : -1;
      const sectionHeight = totalHeight / sections.length;
      const currentIndex = Math.min(
        Math.floor(scrolled / sectionHeight),
        sections.length - 1
      );
      const nextIndex = currentIndex + direction;

      // Allow normal scroll out of showcase
      if (nextIndex < 0 || nextIndex >= sections.length) return;

      e.preventDefault();
      lastWheelTime = now;
      scrollToSection(nextIndex);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [scrollToSection]);

  // Touch swipe handler for mobile — one swipe = one section
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let touchStartY = 0;
    let lastSwipeTime = 0;
    const COOLDOWN = 800;
    const SWIPE_THRESHOLD = 30;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const totalHeight = container.offsetHeight;

      const isInShowcase = scrolled >= -10 && scrolled <= totalHeight - 10;
      if (!isInShowcase) return;

      const deltaY = touchStartY - e.touches[0].clientY;
      const now = Date.now();

      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      if (now - lastSwipeTime < COOLDOWN) {
        e.preventDefault();
        return;
      }

      const direction = deltaY > 0 ? 1 : -1;
      const sectionHeight = totalHeight / sections.length;
      const currentIndex = Math.min(
        Math.floor(scrolled / sectionHeight),
        sections.length - 1
      );
      const nextIndex = currentIndex + direction;

      if (nextIndex < 0 || nextIndex >= sections.length) return;

      e.preventDefault();
      lastSwipeTime = now;
      touchStartY = e.touches[0].clientY; // reset for next swipe
      scrollToSection(nextIndex);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [scrollToSection]);

  // Track scroll position to update activeIndex and inShowcase
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const sectionHeight = container.offsetHeight / sections.length;
      const totalHeight = container.offsetHeight;

      const isInArea = scrolled >= -50 && scrolled <= totalHeight + 50;
      setInShowcase(isInArea);

      if (scrolled < 0) {
        setActiveIndex(0);
        return;
      }

      if (scrolled >= totalHeight) {
        setActiveIndex(sections.length - 1);
        return;
      }

      const newIndex = Math.min(
        Math.floor(scrolled / sectionHeight),
        sections.length - 1
      );
      setActiveIndex(newIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Hero + CTA animations
  useEffect(() => {
    const init = async () => {
      const { animate, onScroll } = await import('animejs');

      if (heroRef.current) {
        const heroElements = heroRef.current.querySelectorAll('.anim-hero');
        animate(heroElements, {
          opacity: [0, 1],
          translateY: [30, 0],
          delay: (_: unknown, i: number) => i * 150,
          duration: 900,
          easing: 'easeOutCubic',
        });
      }

      if (ctaRef.current) {
        animate(ctaRef.current, {
          opacity: [0, 1],
          translateY: [40, 0],
          duration: 1000,
          easing: 'easeOutCubic',
          autoplay: onScroll({
            target: ctaRef.current,
            enter: 'bottom -= 100px',
          }),
        });
      }
    };

    setTimeout(init, 300);
  }, []);

  return (
    <div className="relative">
      {/* ─── Hero / Intro Section ─── */}
      <section
        ref={heroRef}
        className="min-h-screen flex flex-col items-center justify-center px-6 relative"
      >
        {/* Background orbs */}
        <div className="absolute top-[20%] left-[15%] w-[400px] h-[400px] bg-momento-primary/[0.04] rounded-full blur-[120px] animate-flutter pointer-events-none" />
        <div className="absolute bottom-[20%] right-[15%] w-[300px] h-[300px] bg-momento-primary/[0.03] rounded-full blur-[100px] animate-breathe-glow pointer-events-none" />

        <div className="text-center max-w-3xl relative z-10 space-y-6">
          <p
            className="anim-hero text-momento-primary font-mono text-xs uppercase tracking-[4px]"
            style={{ opacity: 0 }}
          >
            Introducing Momento
          </p>
          <h1
            className="anim-hero font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1]"
            style={{ opacity: 0 }}
          >
            The creator economy,{' '}
            <span className="text-shimmer">reimagined.</span>
          </h1>
          <p
            className="anim-hero text-white/40 text-base md:text-lg lg:text-xl max-w-xl mx-auto leading-relaxed"
            style={{ opacity: 0 }}
          >
            Discover creators near you. Support them directly. Build together.
          </p>
          <div
            className="anim-hero flex items-center justify-center gap-2 text-white/20 text-xs font-mono"
            style={{ opacity: 0 }}
          >
            <svg className="w-4 h-4 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            scroll to explore
          </div>
        </div>
      </section>

      {/* ─── Sticky Showcase Area (both desktop & mobile) ─── */}
      <div
        ref={scrollContainerRef}
        style={{ height: `${sections.length * 100}vh` }}
        className="relative"
      >
        {/* Sticky inner — stays pinned while scrolling through */}
        <div className="sticky top-0 h-screen flex items-center justify-center px-6 overflow-hidden">
          <div className="max-w-6xl w-full mx-auto">

            {/* ─── Desktop Layout ─── */}
            <div className="hidden md:grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Text side — crossfades */}
              <div className="relative min-h-[280px]">
                {sections.map((section, i) => (
                  <div
                    key={i}
                    className={`absolute inset-0 flex flex-col justify-center space-y-5 transition-all duration-500 ease-out ${
                      activeIndex === i
                        ? 'opacity-100 translate-y-0'
                        : activeIndex > i
                        ? 'opacity-0 -translate-y-6'
                        : 'opacity-0 translate-y-6'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-momento-primary font-mono text-xs font-bold">
                        0{i + 1}
                      </span>
                      <div className="w-8 h-px bg-momento-primary/30" />
                      <span className="text-momento-primary/60 text-xs uppercase tracking-[2px] font-mono">
                        {section.label}
                      </span>
                    </div>
                    <h2 className="font-display text-3xl lg:text-4xl xl:text-5xl font-bold text-white leading-tight">
                      {section.title}
                    </h2>
                    <p className="text-white/50 text-base lg:text-lg leading-relaxed max-w-md">
                      {section.subtitle}
                    </p>
                  </div>
                ))}
              </div>

              {/* Phone side — stays, screen crossfades */}
              <div className="flex justify-center">
                <PhoneFrame>
                  <div className="relative w-full h-full">
                    {sections.map((section, i) => (
                      <div
                        key={i}
                        className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                          activeIndex === i ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        {section.screen}
                      </div>
                    ))}
                  </div>
                </PhoneFrame>
              </div>
            </div>

            {/* ─── Mobile Layout ─── */}
            <div className="md:hidden flex flex-col items-center gap-3">
              {/* Text — crossfades */}
              <div className="relative min-h-[110px] w-full">
                {sections.map((section, i) => (
                  <div
                    key={i}
                    className={`absolute inset-0 flex flex-col justify-center items-center text-center space-y-2 transition-all duration-500 ease-out ${
                      activeIndex === i
                        ? 'opacity-100 translate-y-0'
                        : activeIndex > i
                        ? 'opacity-0 -translate-y-4'
                        : 'opacity-0 translate-y-4'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-momento-primary font-mono text-[10px] font-bold">
                        0{i + 1}
                      </span>
                      <div className="w-5 h-px bg-momento-primary/30" />
                      <span className="text-momento-primary/60 text-[9px] uppercase tracking-[2px] font-mono">
                        {section.label}
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-bold text-white">
                      {section.title}
                    </h2>
                    <p className="text-white/50 text-xs leading-relaxed max-w-xs">
                      {section.subtitle}
                    </p>
                  </div>
                ))}
              </div>

              {/* Screen card — stays centered, content crossfades */}
              <div
                className="rounded-2xl border border-white/[0.08] overflow-hidden bg-[#0a0a0a] w-full max-w-[240px] relative"
                style={{ aspectRatio: '9 / 14' }}
              >
                {sections.map((section, i) => (
                  <div
                    key={i}
                    className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                      activeIndex === i ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {section.screen}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Scroll Navigation (desktop only) ─── */}
          <div
            className={`fixed right-6 md:right-10 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end gap-6 transition-all duration-500 ${
              inShowcase ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
            }`}
          >
            {sections.map((section, i) => (
              <button
                key={i}
                onClick={() => scrollToSection(i)}
                className="group flex items-center gap-3 cursor-pointer"
                aria-label={`Go to ${section.label}`}
              >
                {/* Label — desktop only */}
                <span
                  className={`hidden md:block text-[11px] font-mono uppercase tracking-[2px] transition-all duration-300 whitespace-nowrap ${
                    activeIndex === i
                      ? 'text-momento-primary'
                      : 'text-white/25 group-hover:text-white/50'
                  }`}
                >
                  {section.label}
                </span>
                {/* Dot */}
                <div
                  className={`rounded-full transition-all duration-300 flex-shrink-0 ${
                    activeIndex === i
                      ? 'w-3 h-3 bg-momento-primary shadow-[0_0_12px_rgba(0,255,136,0.5)]'
                      : 'w-2 h-2 bg-white/20 group-hover:bg-white/40'
                  }`}
                />
              </button>
            ))}
            {/* Connecting line */}
            <div className="absolute top-2 bottom-2 right-[5px] w-px bg-white/[0.08] -z-10" />
          </div>

          {/* ─── Scroll Down Hint ─── */}
          <div
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 transition-opacity duration-300 ${
              activeIndex < sections.length - 1 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="text-white/20 text-[10px] font-mono">scroll</span>
            <svg className="w-4 h-4 text-white/20 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── Final CTA ─── */}
      <section className="min-h-screen flex items-center justify-center px-6 py-20">
        <div
          ref={ctaRef}
          className="text-center max-w-2xl space-y-6"
          style={{ opacity: 0 }}
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white">
            Be First.
          </h2>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-shimmer">
            Own the Culture.
          </h2>
          <p className="text-white/40 text-sm md:text-base max-w-md mx-auto">
            Join the waitlist and be the first to experience a new way to discover and support creators.
          </p>
          <div id="waitlist-form">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.04] mt-8">
        <div className="max-w-6xl mx-auto py-8 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
              <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="36" cy="10" r="2.5" fill="#00FF88" />
            </svg>
            <span className="text-white text-xs tracking-[0.2em] uppercase">
              Momento
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <p className="text-white/20 text-xs font-mono">&copy; 2026 Momento</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
