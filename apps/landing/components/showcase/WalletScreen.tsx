'use client';

const holdings = [
  { token: '$NASH', amount: '150', value: '$186.00', change: '+12.4%', positive: true },
  { token: '$ARIA', amount: '80', value: '$69.60', change: '+6.7%', positive: true },
  { token: 'USDC', amount: '62.50', value: '$62.50', change: '', positive: true },
];

const transactions = [
  { label: 'Bought $NASH', amount: '+50 $NASH', time: '2 min ago', positive: true },
  { label: 'Received from @aria', amount: '+12.5 USDC', time: '1 hr ago', positive: true },
];

export default function WalletScreen() {
  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h3 className="text-white text-[10px] font-bold font-display">Wallet</h3>
        <div className="w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>

      {/* Balance card */}
      <div className="mx-2.5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.06] rounded-xl p-2.5 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-momento-primary/[0.06] rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <p className="text-white/40 text-[6px] uppercase tracking-wider font-mono">Total Balance</p>
        <p className="text-white font-black text-base font-mono leading-tight">$318.10</p>
        <p className="text-momento-primary text-[7px] font-mono">+$24.30 today</p>

        <div className="flex gap-1.5 mt-1.5">
          <button className="flex-1 bg-momento-primary text-black text-[6px] font-bold py-0.5 rounded-md">
            Fund
          </button>
          <button className="flex-1 bg-white/[0.06] border border-white/[0.08] text-white text-[6px] font-bold py-0.5 rounded-md">
            Send
          </button>
          <button className="flex-1 bg-white/[0.06] border border-white/[0.08] text-white text-[6px] font-bold py-0.5 rounded-md">
            Swap
          </button>
        </div>
      </div>

      {/* Holdings */}
      <div className="px-2.5 mt-2">
        <p className="text-white/30 text-[6px] uppercase tracking-wider font-mono mb-1">Holdings</p>
        <div className="space-y-0.5">
          {holdings.map((h, i) => (
            <div key={i} className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] rounded p-1">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-momento-primary/10 flex items-center justify-center">
                  <span className="text-momento-primary text-[5px] font-bold">{h.token.replace('$', '').charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white text-[7px] font-semibold leading-none">{h.token}</p>
                  <p className="text-white/20 text-[5px] leading-none mt-0.5">{h.amount}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white text-[7px] font-mono leading-none">{h.value}</p>
                {h.change && (
                  <p className={`text-[5px] font-mono leading-none mt-0.5 ${h.positive ? 'text-momento-primary' : 'text-red-400'}`}>
                    {h.change}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="px-2.5 mt-1.5">
        <p className="text-white/30 text-[6px] uppercase tracking-wider font-mono mb-1">Recent</p>
        {transactions.map((tx, i) => (
          <div key={i} className="flex items-center justify-between py-0.5 border-b border-white/[0.03] last:border-0">
            <div>
              <p className="text-white/70 text-[6px] leading-none">{tx.label}</p>
              <p className="text-white/20 text-[5px] leading-none mt-0.5">{tx.time}</p>
            </div>
            <p className={`text-[6px] font-mono font-semibold ${tx.positive ? 'text-momento-primary' : 'text-red-400'}`}>
              {tx.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
