'use client';

const posts = [
  { color: 'from-[#3d2828] to-[#1a1215]' },
  { color: 'from-[#282a3d] to-[#12151a]' },
  { color: 'from-[#3d3528] to-[#1a1512]' },
  { color: 'from-[#28383d] to-[#121a1a]' },
];

export default function CreatorProfileScreen() {
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

      {/* Top tabs */}
      <div className="flex items-center gap-4 px-3 py-1.5">
        <svg className="w-3 h-3 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-white text-[7px] font-mono uppercase tracking-[0.1em] font-bold">Profile</span>
          <span className="text-[#555555] text-[7px] font-mono uppercase tracking-[0.1em]">Posts</span>
          <span className="text-[#555555] text-[7px] font-mono uppercase tracking-[0.1em]">Token</span>
        </div>
      </div>

      {/* Hero image area */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1f1f] via-[#1a1215] to-black" />

        {/* Creator name + verified dot overlay at bottom of hero */}
        <div className="absolute bottom-12 left-3">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-base font-mono font-bold">deela</span>
            <div className="w-2 h-2 rounded-full bg-momento-primary" />
          </div>
          <span className="text-[#888888] text-[7px] font-mono uppercase tracking-wider">$DEEL</span>
          <p className="text-[#888888] text-[7px] font-mono mt-1 max-w-[140px] leading-relaxed">
            Musician, Producer, and Savant from NYC...
          </p>
        </div>
      </div>

      {/* Post grid preview at bottom */}
      <div className="px-1 pb-1">
        <div className="grid grid-cols-2 gap-[2px]">
          {posts.map((p, i) => (
            <div
              key={i}
              className={`aspect-square bg-gradient-to-br ${p.color}`}
            />
          ))}
        </div>
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center justify-around px-4 py-2 border-t border-white/[0.04]">
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <svg className="w-4 h-4 text-[#666666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    </div>
  );
}
