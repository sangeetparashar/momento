'use client';

import { useEffect, useRef, useState } from 'react';

/* ─── Checkmark Icon ─────────────────────────────────────────── */
function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-momento-primary flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Phone Frame Wrapper ────────────────────────────────────── */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-64 md:w-72 rounded-3xl border border-white/10 bg-momento-bg-secondary overflow-hidden shadow-2xl flex-shrink-0">
      {/* Notch */}
      <div className="flex justify-center pt-3 pb-2">
        <div className="w-20 h-1 bg-momento-bg-tertiary rounded-full" />
      </div>
      {/* Content */}
      <div className="px-4 pb-4">{children}</div>
      {/* Bottom bar */}
      <div className="flex justify-center pb-3 pt-2">
        <div className="w-24 h-1 bg-momento-bg-tertiary rounded-full" />
      </div>
    </div>
  );
}

/* ─── Mock: Feed Screen ──────────────────────────────────────── */
function FeedMockup() {
  const posts = [
    { name: 'Nash Bryant', handle: '@nash', price: '$1.24', color: 'bg-momento-primary/20' },
    { name: 'Aria Chen', handle: '@aria', price: '$0.87', color: 'bg-purple-500/20' },
    { name: 'Kai Torres', handle: '@kai', price: '$2.10', color: 'bg-blue-500/20' },
  ];
  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="h-8 bg-momento-bg-tertiary rounded-lg flex items-center px-3">
        <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-white/20 text-[10px] ml-2">Search nearby creators...</span>
      </div>
      {/* Posts */}
      {posts.map((post, i) => (
        <div key={i} className="bg-momento-bg-tertiary/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full ${post.color}`} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{post.name}</p>
              <p className="text-white/40 text-[10px]">{post.handle}</p>
            </div>
            <span className="text-momento-primary font-mono text-[10px] font-bold bg-momento-primary/10 px-2 py-0.5 rounded-full">
              {post.price}
            </span>
          </div>
          {/* Placeholder image */}
          <div className="h-20 bg-white/[0.03] rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/* ─── Mock: Token Detail Screen ──────────────────────────────── */
function TokenMockup() {
  return (
    <div className="space-y-3">
      {/* Token header */}
      <div className="text-center space-y-1">
        <p className="text-white/50 text-[10px] font-mono">Creator Token</p>
        <p className="text-white text-2xl font-black font-mono">$NASH</p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-white text-lg font-bold font-mono">$2.47</span>
          <span className="text-momento-primary text-xs font-mono font-bold bg-momento-primary/10 px-2 py-0.5 rounded-full">
            +12.4%
          </span>
        </div>
      </div>
      {/* Mini chart — CSS-only gradient area */}
      <div className="h-24 relative rounded-lg overflow-hidden">
        <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,60 Q20,55 40,50 T80,35 T120,40 T160,20 T200,15 L200,80 L0,80 Z"
            fill="url(#chartGrad)"
          />
          <path
            d="M0,60 Q20,55 40,50 T80,35 T120,40 T160,20 T200,15"
            fill="none"
            stroke="#00FF88"
            strokeWidth="2"
          />
        </svg>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-momento-bg-tertiary/50 rounded-lg p-2 text-center">
          <p className="text-white/40">24h Vol</p>
          <p className="text-white font-mono font-semibold">$12.4K</p>
        </div>
        <div className="bg-momento-bg-tertiary/50 rounded-lg p-2 text-center">
          <p className="text-white/40">Holders</p>
          <p className="text-white font-mono font-semibold">847</p>
        </div>
      </div>
      {/* Buy/Sell buttons */}
      <div className="flex gap-2">
        <button className="flex-1 bg-momento-primary text-momento-bg font-bold text-xs py-2.5 rounded-xl">
          Buy
        </button>
        <button className="flex-1 bg-white/[0.06] border border-white/10 text-white font-bold text-xs py-2.5 rounded-xl">
          Sell
        </button>
      </div>
    </div>
  );
}

/* ─── Mock: Portfolio Screen ─────────────────────────────────── */
function PortfolioMockup() {
  const holdings = [
    { name: '$NASH', fullName: 'Nash Bryant', pct: '+18.2%', value: '$482.30', positive: true },
    { name: '$ARIA', fullName: 'Aria Chen', pct: '+6.7%', value: '$391.50', positive: true },
    { name: '$KAI', fullName: 'Kai Torres', pct: '-2.1%', value: '$373.70', positive: false },
  ];
  return (
    <div className="space-y-3">
      {/* Balance */}
      <div className="text-center bg-momento-bg-tertiary/50 rounded-xl p-4">
        <p className="text-white/40 text-[10px] uppercase tracking-wider">Total Balance</p>
        <p className="text-white font-black text-2xl font-mono mt-1">$1,247.50</p>
        <p className="text-momento-primary text-xs font-mono mt-0.5">+$124.30 (11.1%)</p>
      </div>
      {/* Holdings list */}
      <div className="space-y-2">
        <p className="text-white/40 text-[10px] uppercase tracking-wider">Your Holdings</p>
        {holdings.map((h, i) => (
          <div key={i} className="flex items-center justify-between bg-momento-bg-tertiary/30 rounded-lg p-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-momento-primary/15 flex items-center justify-center">
                <span className="text-momento-primary text-[8px] font-bold">{h.name.replace('$', '').charAt(0)}</span>
              </div>
              <div>
                <p className="text-white text-[11px] font-semibold">{h.name}</p>
                <p className="text-white/30 text-[9px]">{h.fullName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white text-[11px] font-mono font-semibold">{h.value}</p>
              <p className={`text-[9px] font-mono ${h.positive ? 'text-momento-primary' : 'text-momento-error'}`}>
                {h.pct}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Feature Block Data ─────────────────────────────────────── */
const blocks = [
  {
    title: 'Discover Nearby Creators',
    description:
      'Your feed is powered by location. Find creators in your city, support local talent, and watch your community grow.',
    bullets: ['Location-based feed', 'Real-time content', 'Personalized discovery'],
    mockup: <FeedMockup />,
    imageRight: true,
  },
  {
    title: 'Trade Creator Tokens',
    description:
      'Buy and sell creator tokens in real time. Prices move with real community momentum — not hype.',
    bullets: ['Real-time pricing', 'Instant transactions', 'Solana-powered speed'],
    mockup: <TokenMockup />,
    imageRight: false,
  },
  {
    title: 'Build Your Portfolio',
    description:
      'Track your investments, monitor creator growth, and manage your wallet — all in one place.',
    bullets: ['Portfolio tracking', 'Embedded Solana wallet', 'Full transaction history'],
    mockup: <PortfolioMockup />,
    imageRight: true,
  },
];

/* ─── Showcase Block ─────────────────────────────────────────── */
function ShowcaseBlock({
  block,
  index,
}: {
  block: (typeof blocks)[number];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    const el = ref.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  const slideClass = block.imageRight ? 'translate-x-[-40px]' : 'translate-x-[40px]';

  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ease-out ${
        visible ? 'opacity-100 translate-x-0' : `opacity-0 ${slideClass}`
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8 md:p-12">
        <div
          className={`flex flex-col ${
            block.imageRight ? 'md:flex-row' : 'md:flex-row-reverse'
          } items-center gap-8 md:gap-12`}
        >
          {/* Text side */}
          <div className="flex-1 space-y-5">
            <h3 className="text-2xl md:text-3xl font-bold text-white">{block.title}</h3>
            <p className="text-momento-text-secondary leading-relaxed">{block.description}</p>
            <ul className="space-y-3">
              {block.bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-3">
                  <CheckIcon />
                  <span className="text-white/80 text-sm">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Phone side */}
          <PhoneFrame>{block.mockup}</PhoneFrame>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Export ─────────────────────────────────────────────── */
export default function AppShowcase() {
  return (
    <section id="features" className="py-24 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <p className="text-momento-primary text-xs font-semibold uppercase tracking-[3px] mb-3 text-center">
          THE APP
        </p>
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 tracking-tight">
          Built for the culture
        </h2>
        <p className="text-momento-text-secondary text-center max-w-2xl mx-auto mb-16">
          Discover creators, trade tokens, and build your portfolio — all from your phone.
        </p>

        {/* Feature blocks */}
        <div className="space-y-12">
          {blocks.map((block, i) => (
            <ShowcaseBlock key={i} block={block} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
