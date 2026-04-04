'use client';

export default function OwnershipScreen() {
  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h3 className="text-white text-[10px] font-bold font-display">Yours</h3>
        <div className="w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
      </div>

      {/* Central breathing orb + statement */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-4">
        {/* Breathing orb */}
        <div className="relative mb-4">
          <div className="absolute inset-0 w-14 h-14 bg-momento-primary/20 rounded-full blur-xl animate-breathe-glow" />
          <div className="relative w-14 h-14 rounded-full bg-momento-primary/[0.08] border border-momento-primary/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-momento-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>

        <p className="text-white font-display text-sm font-bold text-center leading-tight">
          If you built it,<br />you own it.
        </p>
        <p className="text-white/30 text-[7px] text-center mt-2 max-w-[160px] leading-relaxed">
          Everything you create, earn, and collect on Momento belongs to you.
        </p>
      </div>

      {/* Minimal stats row */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-white text-[6px] font-semibold">Your data</p>
            <p className="text-white/20 text-[5px] mt-0.5">Controlled</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <p className="text-white text-[6px] font-semibold">Portable</p>
            <p className="text-white/20 text-[5px] mt-0.5">Anywhere</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 text-center">
            <svg className="w-3 h-3 text-momento-primary mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-white text-[6px] font-semibold">Secured</p>
            <p className="text-white/20 text-[5px] mt-0.5">By design</p>
          </div>
        </div>

        {/* Subtle blockchain badge */}
        <div className="mt-2 flex items-center justify-center gap-1.5 py-1">
          <div className="w-1 h-1 rounded-full bg-momento-primary/40 animate-pulse" />
          <span className="text-white/15 text-[6px] font-mono uppercase tracking-wider">
            Powered by blockchain
          </span>
        </div>
      </div>
    </div>
  );
}
