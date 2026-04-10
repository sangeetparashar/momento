'use client';

export default function OwnershipScreen() {
  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
        <span className="text-white/50 text-[8px] font-mono">7:05</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 border border-white/40 rounded-[2px] relative">
            <div className="absolute inset-[1px] right-[2px] bg-momento-primary rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-1 pb-1">
        <h3 className="text-white text-[10px] font-mono font-bold uppercase tracking-[0.15em]">Yours</h3>
        <div className="w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
      </div>

      {/* Central orb + statement */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-2">
        <div className="relative mb-4">
          <div className="absolute inset-0 w-14 h-14 bg-momento-primary/20 rounded-full blur-xl animate-breathe-glow" />
          <div className="relative w-14 h-14 rounded-full bg-momento-primary/[0.08] border border-momento-primary/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>

        <p className="text-white font-mono text-sm font-bold text-center leading-tight uppercase tracking-wider">
          If you built it,<br />you own it.
        </p>
        <p className="text-[#666666] text-[7px] font-mono text-center mt-2 max-w-[160px] leading-relaxed">
          Everything you create, earn, and collect on Momento belongs to you.
        </p>
      </div>

      {/* Stats row */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-white text-[6px] font-mono font-bold uppercase">Your data</p>
            <p className="text-[#555555] text-[5px] font-mono mt-0.5">Controlled</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <p className="text-white text-[6px] font-mono font-bold uppercase">Portable</p>
            <p className="text-[#555555] text-[5px] font-mono mt-0.5">Anywhere</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-white text-[6px] font-mono font-bold uppercase">Secured</p>
            <p className="text-[#555555] text-[5px] font-mono mt-0.5">By design</p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 py-1">
          <div className="w-1 h-1 rounded-full bg-momento-primary/40 animate-pulse" />
          <span className="text-[#333333] text-[5px] font-mono uppercase tracking-wider">
            Powered by Solana
          </span>
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
