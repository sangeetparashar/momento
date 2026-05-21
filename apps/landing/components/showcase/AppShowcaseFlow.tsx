'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import PhoneFrame from './PhoneFrame';
import HomeFeedScreen from './HomeFeedScreen';
import ExploreScreen from './ExploreScreen';
import CreatorProfileScreen from './CreatorProfileScreen';
import WalletScreen from './WalletScreen';
import Navbar from '../Navbar';
import TickerBanner from '../TickerBanner';
import Manifesto from '../Manifesto';
import Footer from '../Footer';
import WaitlistForm from '../WaitlistForm';
import BetaJoinCTA from '../BetaJoinCTA';

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
      'Follow their journey, access exclusive content, and back them directly. Every supporter matters.',
    screen: <CreatorProfileScreen />,
  },
  {
    label: 'Wallet',
    title: 'Your portfolio. Your wealth.',
    subtitle:
      'Track your earnings, trade creator tokens, and watch your portfolio grow — all in one place.',
    screen: <WalletScreen />,
  },
];

export default function AppShowcaseFlow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [inShowcase, setInShowcase] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.offsetTop;
    const scrollableHeight = container.offsetHeight - window.innerHeight;
    const targetScroll = containerTop + (scrollableHeight * index) / sections.length + scrollableHeight / (sections.length * 2);

    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, []);

  // Wheel event handler
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastWheelTime = 0;
    const COOLDOWN = 800;

    const handleWheel = (e: WheelEvent) => {
      // Don't intercept scroll when a modal or other component has locked body scroll
      if (document.body.style.overflow === 'hidden') return;

      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const totalHeight = container.offsetHeight;
      const scrollableHeight = totalHeight - window.innerHeight;

      const isInShowcase = scrolled >= -10 && scrolled <= scrollableHeight + 10;
      if (!isInShowcase) return;

      const now = Date.now();
      if (now - lastWheelTime < COOLDOWN) {
        e.preventDefault();
        return;
      }

      const direction = e.deltaY > 0 ? 1 : -1;
      const progress = Math.max(0, scrolled) / scrollableHeight;
      const currentIndex = Math.min(
        Math.floor(progress * sections.length),
        sections.length - 1
      );
      const nextIndex = currentIndex + direction;

      if (nextIndex < 0 || nextIndex >= sections.length) return;

      e.preventDefault();
      lastWheelTime = now;
      scrollToSection(nextIndex);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [scrollToSection]);

  // Touch swipe handler
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
      // Don't intercept touch-scroll when a modal or other component has locked body scroll
      if (document.body.style.overflow === 'hidden') return;

      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const totalHeight = container.offsetHeight;
      const scrollableHeight = totalHeight - window.innerHeight;

      const isInShowcase = scrolled >= -10 && scrolled <= scrollableHeight + 10;
      if (!isInShowcase) return;

      const deltaY = touchStartY - e.touches[0].clientY;
      const now = Date.now();

      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      if (now - lastSwipeTime < COOLDOWN) {
        e.preventDefault();
        return;
      }

      const direction = deltaY > 0 ? 1 : -1;
      const progress = Math.max(0, scrolled) / scrollableHeight;
      const currentIndex = Math.min(
        Math.floor(progress * sections.length),
        sections.length - 1
      );
      const nextIndex = currentIndex + direction;

      if (nextIndex < 0 || nextIndex >= sections.length) return;

      e.preventDefault();
      lastSwipeTime = now;
      touchStartY = e.touches[0].clientY;
      scrollToSection(nextIndex);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [scrollToSection]);

  // Track scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const scrolled = -rect.top;
      const totalHeight = container.offsetHeight;
      // Reserve one viewport height for the sticky view, distribute rest across sections
      const scrollableHeight = totalHeight - window.innerHeight;

      setInShowcase(scrolled >= -50 && scrolled <= totalHeight + 50);

      if (scrolled <= 0) { setActiveIndex(0); return; }
      if (scrolled >= scrollableHeight) { setActiveIndex(sections.length - 1); return; }

      const progress = scrolled / scrollableHeight;
      setActiveIndex(
        Math.min(Math.floor(progress * sections.length), sections.length - 1)
      );
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
          delay: (_: unknown, i: number) => i * 200,
          duration: 1000,
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
      <Navbar />

      {/* ─── Hero / Intro Section ─── */}
      <section
        ref={heroRef}
        className="min-h-[85vh] md:min-h-screen flex flex-col items-center justify-center px-6 pt-16 relative"
      >
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-black to-black" />

        {/* Breathing orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-momento-primary/[0.03] rounded-full blur-[200px] animate-breathe-glow pointer-events-none" />

        <div className="text-center max-w-3xl relative z-10 space-y-4 md:space-y-6">
          <p
            className="anim-hero font-mono text-[9px] md:text-[10px] text-momento-primary uppercase tracking-[0.3em]"
            style={{ opacity: 0 }}
          >
            Introducing Momento
          </p>
          <h1
            className="anim-hero"
            style={{ opacity: 0 }}
          >
            <span className="block font-serif font-light text-3xl md:text-6xl lg:text-8xl text-white tracking-[0.15em] md:tracking-[0.2em] uppercase leading-[1.1]">
              The Stock Market
            </span>
            <span className="block font-serif font-light text-3xl md:text-6xl lg:text-8xl text-momento-primary tracking-[0.15em] md:tracking-[0.2em] uppercase leading-[1.1] mt-1 md:mt-2">
              for Culture
            </span>
          </h1>
          <p
            className="anim-hero text-[#666666] text-xs md:text-base font-mono max-w-xl mx-auto leading-relaxed"
            style={{ opacity: 0 }}
          >
            Discover creators near you. Support them directly. Build together.
          </p>
          {/* Primary CTA — Join the iOS Beta (TestFlight is live) */}
          <div
            className="anim-hero pt-2 md:pt-4 flex justify-center"
            style={{ opacity: 0 }}
          >
            <BetaJoinCTA variant="primary" />
          </div>

          {/* Secondary — Waitlist for Android / general updates */}
          <div
            id="waitlist"
            className="anim-hero pt-3 md:pt-4 flex flex-col items-center gap-2"
            style={{ opacity: 0 }}
          >
            <p className="text-[#444444] text-[9px] font-mono uppercase tracking-[0.25em]">
              Android coming soon · get notified
            </p>
            <WaitlistForm />
          </div>
          <div
            className="anim-hero flex items-center justify-center gap-2 text-white/15 text-[9px] font-mono uppercase tracking-wider pt-2"
            style={{ opacity: 0 }}
          >
            <svg className="w-3.5 h-3.5 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            scroll to explore
          </div>
        </div>
      </section>

      {/* ─── Ticker ─── */}
      <TickerBanner />

      {/* ─── Manifesto ─── */}
      <Manifesto />

      {/* ─── Sticky Showcase Area ─── */}
      <div
        ref={scrollContainerRef}
        style={{ height: `${sections.length * 80}vh` }}
        className="relative"
      >
        <div className="sticky top-0 h-screen flex items-center justify-center px-6 overflow-hidden">
          <div className="max-w-6xl w-full mx-auto">

            {/* Desktop Layout */}
            <div className="hidden md:grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Text side */}
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
                      <span className="text-momento-primary font-mono text-[10px] font-bold tracking-wider">
                        0{i + 1}
                      </span>
                      <div className="w-8 h-px bg-momento-primary/30" />
                      <span className="text-momento-primary/60 text-[9px] uppercase tracking-[0.2em] font-mono">
                        {section.label}
                      </span>
                    </div>
                    <h2 className="font-mono text-2xl lg:text-3xl xl:text-4xl font-bold text-white leading-tight uppercase">
                      {section.title}
                    </h2>
                    <p className="text-[#666666] text-sm font-mono leading-relaxed max-w-md">
                      {section.subtitle}
                    </p>
                  </div>
                ))}
              </div>

              {/* Phone side */}
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

            {/* Mobile Layout */}
            <div className="md:hidden flex flex-col items-center gap-2">
              <div className="relative min-h-[100px] w-full">
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
                      <span className="text-momento-primary/60 text-[9px] uppercase tracking-[0.2em] font-mono">
                        {section.label}
                      </span>
                    </div>
                    <h2 className="font-mono text-lg font-bold text-white uppercase">
                      {section.title}
                    </h2>
                    <p className="text-[#666666] text-[10px] font-mono leading-relaxed max-w-xs">
                      {section.subtitle}
                    </p>
                  </div>
                ))}
              </div>

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

          {/* Scroll Navigation (desktop) */}
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
                <span
                  className={`hidden md:block text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-300 whitespace-nowrap ${
                    activeIndex === i
                      ? 'text-momento-primary'
                      : 'text-white/25 group-hover:text-white/50'
                  }`}
                >
                  {section.label}
                </span>
                <div
                  className={`rounded-full transition-all duration-300 flex-shrink-0 ${
                    activeIndex === i
                      ? 'w-2.5 h-2.5 bg-momento-primary shadow-[0_0_10px_rgba(0,255,136,0.5)]'
                      : 'w-1.5 h-1.5 bg-white/20 group-hover:bg-white/40'
                  }`}
                />
              </button>
            ))}
            <div className="absolute top-2 bottom-2 right-[4px] w-px bg-white/[0.06] -z-10" />
          </div>

          {/* Scroll hint */}
          <div
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 transition-opacity duration-300 ${
              activeIndex < sections.length - 1 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="text-white/15 text-[9px] font-mono uppercase tracking-wider">Scroll</span>
            <svg className="w-3.5 h-3.5 text-white/15 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <Footer />
    </div>
  );
}
