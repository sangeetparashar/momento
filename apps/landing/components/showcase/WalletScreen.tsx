'use client';

const tokens = [
  { ticker: 'DEEL', pct: '17%', cap: '10,631USD', color: 'bg-momento-primary' },
  { ticker: 'NAAM', pct: '3%', cap: '3,050USD', color: 'bg-momento-primary' },
  { ticker: 'SEAM', pct: '267%', cap: '93,780USD', color: 'bg-pink-500' },
  { ticker: 'CACTS', pct: '0.1%', cap: '103,026USD', color: 'bg-pink-500' },
  { ticker: 'TEAM', pct: '17%', cap: '10,000USD', color: 'bg-momento-primary' },
];

export default function WalletScreen() {
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

      {/* Username */}
      <div className="text-center py-1">
        <h3 className="text-white text-sm font-mono font-bold uppercase tracking-[0.15em]">Andrew</h3>
      </div>

      {/* Wallet pill */}
      <div className="flex justify-center py-1">
        <span className="text-white text-[7px] font-mono uppercase tracking-[0.15em] border border-white/20 rounded-full px-3 py-0.5">
          Wallet
        </span>
      </div>

      {/* Stats row */}
      <div className="flex gap-1.5 px-2.5 py-1.5">
        <div className="flex-1 border border-[#2A2A2A] rounded-lg p-1.5 text-center">
          <p className="text-[#888888] text-[5px] font-mono uppercase tracking-wider">24H Change</p>
          <p className="text-momento-primary text-sm font-mono font-bold mt-0.5">0.9%</p>
        </div>
        <div className="flex-1 border border-[#2A2A2A] rounded-lg p-1.5 text-center">
          <p className="text-[#888888] text-[5px] font-mono uppercase tracking-wider">Earnings</p>
          <p className="text-momento-primary text-sm font-mono font-bold mt-0.5">12.2K</p>
        </div>
      </div>

      {/* Portfolio chart */}
      <div className="px-2.5 py-1">
        <p className="text-[#888888] text-[5px] font-mono uppercase tracking-wider mb-1">Portfolio Performance</p>
        <div className="h-12 relative">
          <svg viewBox="0 0 200 40" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M0,30 Q15,28 30,25 T60,20 T90,30 T120,15 T150,25 T180,10 T200,12"
              fill="none"
              stroke="#00FF88"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        {/* Time range */}
        <div className="flex items-center justify-center gap-3 mt-1">
          {['24H', '7D', '1M', '3M', '1Y'].map((t, i) => (
            <span
              key={t}
              className={`text-[5px] font-mono uppercase ${
                i === 4 ? 'text-white' : 'text-[#555555]'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Portfolio list */}
      <div className="px-2.5 py-1 flex-1 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[#888888] text-[5px] font-mono uppercase tracking-wider">Portfolio</p>
          <div className="flex items-center gap-3">
            <span className="text-[#555555] text-[4px] font-mono uppercase">Token</span>
            <span className="text-[#555555] text-[4px] font-mono uppercase">24H</span>
            <span className="text-[#555555] text-[4px] font-mono uppercase">MCap</span>
          </div>
        </div>
        <div className="space-y-0.5">
          {tokens.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <div className={`w-3 h-3 rounded-full ${t.color} opacity-60`} />
              <span className="text-white text-[6px] font-mono font-bold uppercase flex-shrink-0 w-8">{t.ticker}</span>
              <span className="text-momento-primary text-[6px] font-mono flex-shrink-0 w-6">{t.pct}</span>
              <span className="text-momento-primary text-[6px] font-mono flex-1 text-right">{t.cap}</span>
              <span className="text-white text-[5px] font-mono uppercase">Buy</span>
              <span className="text-white text-[5px] font-mono uppercase">Sell</span>
            </div>
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
