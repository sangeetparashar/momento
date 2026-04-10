'use client';

const tiles = [
  { color: 'from-amber-700/60 to-orange-900/40', h: 'h-20' },
  { color: 'from-slate-600/40 to-gray-800/60', h: 'h-16' },
  { color: 'from-rose-700/40 to-pink-900/30', h: 'h-24' },
  { color: 'from-blue-800/30 to-indigo-900/50', h: 'h-18' },
  { color: 'from-emerald-700/30 to-teal-900/40', h: 'h-20' },
  { color: 'from-violet-700/40 to-purple-900/30', h: 'h-16' },
  { color: 'from-amber-600/30 to-yellow-900/40', h: 'h-24' },
  { color: 'from-gray-600/40 to-slate-800/30', h: 'h-20' },
  { color: 'from-red-800/30 to-rose-900/40', h: 'h-16' },
  { color: 'from-cyan-700/30 to-blue-900/40', h: 'h-22' },
];

export default function ExploreScreen() {
  const leftTiles = tiles.filter((_, i) => i % 2 === 0);
  const rightTiles = tiles.filter((_, i) => i % 2 !== 0);

  return (
    <div className="h-full bg-black flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
        <span className="text-white/50 text-[8px] font-mono">7:05</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 border border-white/40 rounded-[2px] relative">
            <div className="absolute inset-[1px] right-[2px] bg-momento-primary rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Pure masonry grid — no header, no search, just images */}
      <div className="flex-1 overflow-hidden px-[1px]">
        <div className="flex gap-[2px]">
          {/* Left column */}
          <div className="flex-1 flex flex-col gap-[2px]">
            {leftTiles.map((tile, i) => (
              <div
                key={i}
                className={`w-full ${tile.h} bg-gradient-to-br ${tile.color}`}
              />
            ))}
          </div>
          {/* Right column */}
          <div className="flex-1 flex flex-col gap-[2px] mt-3">
            {rightTiles.map((tile, i) => (
              <div
                key={i}
                className={`w-full ${tile.h} bg-gradient-to-br ${tile.color}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center justify-around px-4 py-2 border-t border-white/[0.04]">
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    </div>
  );
}
