'use client';

export default function HomeFeedScreen() {
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

      {/* Feed tabs */}
      <div className="flex items-center justify-center gap-6 px-3 py-2">
        <span className="text-white text-[8px] font-mono font-bold uppercase tracking-[0.15em]">
          For You
        </span>
        <span className="text-[#666666] text-[8px] font-mono uppercase tracking-[0.15em]">
          Creators to Watch
        </span>
      </div>

      {/* Main image — full bleed, edge-to-edge */}
      <div className="flex-1 relative mx-0 overflow-hidden">
        {/* Image placeholder with gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1f1f] via-[#1a1215] to-[#0d0a0e]" />

        {/* Simulated portrait content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-48 rounded-lg bg-gradient-to-br from-[#3d2828] via-[#2a1a2a] to-[#1a1a2a] opacity-80" />
        </div>

        {/* Creator info overlay at top */}
        <div className="absolute top-3 left-3 right-3">
          <p className="text-white/60 text-[7px] font-mono leading-relaxed">
            Museum, fashion, music, literature...
          </p>
        </div>

        {/* Caption + action overlay at bottom */}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white text-[10px] font-mono font-bold uppercase tracking-wide">
            Shanti S
          </p>
          <p className="text-white/60 text-[8px] font-mono mt-0.5">
            divine
          </p>
          <div className="mt-1.5">
            <svg className="w-3.5 h-3.5 text-momento-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Next post peek — rounded top corners */}
      <div className="h-12 mx-1 -mt-1 rounded-t-xl bg-gradient-to-br from-[#1a1a3a] via-[#151530] to-[#0d0d20] border-t border-white/[0.06]" />

      {/* Bottom tab bar */}
      <div className="flex items-center justify-around px-4 py-2 border-t border-white/[0.04]">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    </div>
  );
}
