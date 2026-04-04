'use client';

const categories = ['All', 'Music', 'Art', 'Food', 'Fashion', 'Film'];

const creators = [
  {
    name: 'Nash Bryant',
    type: 'Musician',
    distance: '0.5 km',
    followers: '2.4K',
    color: 'from-blue-500/30 to-cyan-500/20',
  },
  {
    name: 'Aria Chen',
    type: 'Visual Artist',
    distance: '1.1 km',
    followers: '1.8K',
    color: 'from-pink-500/30 to-rose-500/20',
  },
  {
    name: 'Kai Torres',
    type: 'Chef',
    distance: '2.3 km',
    followers: '3.1K',
    color: 'from-amber-500/30 to-yellow-500/20',
  },
  {
    name: 'Zara Osei',
    type: 'Fashion Designer',
    distance: '3.7 km',
    followers: '5.2K',
    color: 'from-violet-500/30 to-purple-500/20',
  },
];

export default function ExploreScreen() {
  return (
    <div className="h-full bg-black p-3 space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-white text-sm font-bold font-display">Explore</h3>
        <div className="flex items-center gap-1 bg-momento-primary/10 px-2 py-0.5 rounded-full">
          <svg className="w-2.5 h-2.5 text-momento-primary" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-momento-primary text-[8px] font-mono">5 km</span>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2 flex items-center gap-2">
        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-white/20 text-[9px]">Search creators near you...</span>
      </div>

      {/* Category pills */}
      <div className="flex gap-1.5 overflow-hidden">
        {categories.map((cat, i) => (
          <span
            key={cat}
            className={`text-[8px] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
              i === 0
                ? 'bg-momento-primary text-black font-bold'
                : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
            }`}
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Map hint */}
      <div className="relative h-20 bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
        {/* Fake map grid */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="absolute border-white/[0.06]" style={{
              left: `${20 * (i + 1)}%`,
              top: 0,
              bottom: 0,
              borderLeft: '1px solid rgba(255,255,255,0.04)',
            }} />
          ))}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="absolute border-white/[0.06]" style={{
              top: `${25 * (i + 1)}%`,
              left: 0,
              right: 0,
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }} />
          ))}
        </div>
        {/* Pin dots */}
        <div className="absolute top-[30%] left-[25%] w-2 h-2 rounded-full bg-momento-primary shadow-[0_0_8px_rgba(0,255,136,0.4)]" />
        <div className="absolute top-[50%] left-[60%] w-2 h-2 rounded-full bg-momento-primary/70 shadow-[0_0_6px_rgba(0,255,136,0.3)]" />
        <div className="absolute top-[40%] left-[45%] w-2 h-2 rounded-full bg-momento-primary/50 shadow-[0_0_6px_rgba(0,255,136,0.2)]" />
        <div className="absolute top-[65%] left-[75%] w-1.5 h-1.5 rounded-full bg-momento-primary/40" />
        {/* You are here */}
        <div className="absolute top-[45%] left-[40%] w-3 h-3 rounded-full border-2 border-white bg-momento-primary/80 shadow-[0_0_12px_rgba(0,255,136,0.5)]" />
        <span className="absolute bottom-1.5 right-2 text-[7px] text-white/30 font-mono">MAP VIEW</span>
      </div>

      {/* Creator list */}
      <div className="space-y-2">
        <p className="text-white/30 text-[8px] uppercase tracking-wider font-mono">Nearby Creators</p>
        {creators.map((c, i) => (
          <div key={i} className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.05] rounded-xl p-2">
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-[10px] font-semibold truncate">{c.name}</p>
              <p className="text-white/30 text-[8px]">{c.type}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-momento-primary text-[8px] font-mono">{c.distance}</p>
              <p className="text-white/20 text-[7px]">{c.followers} fans</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
