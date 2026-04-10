export default function TickerBanner() {
  const tokens = [
    { symbol: 'DEEL', change: '17X', positive: true },
    { symbol: 'EMMA', change: '8X', positive: true },
    { symbol: 'RICK', change: '2X', positive: true },
    { symbol: 'NASH', change: '23X', positive: true },
    { symbol: 'BELLE', change: '5X', positive: true },
    { symbol: 'AURA', change: '2X', positive: true },
    { symbol: 'NAAN', change: '0.3X', positive: false },
    { symbol: 'TASH', change: '7X', positive: true },
    { symbol: 'SEAM', change: '267X', positive: true },
    { symbol: 'MIRA', change: '12X', positive: true },
    { symbol: 'ZARA', change: '31X', positive: true },
    { symbol: 'KAI', change: '6X', positive: true },
  ];

  const tickerContent = tokens.map((token, i) => (
    <span key={i} className="inline-flex items-center gap-2 mx-6 md:mx-10">
      <span
        className={`font-mono font-bold text-lg md:text-xl uppercase tracking-wider ${
          token.positive ? 'text-momento-primary' : 'text-momento-error'
        }`}
      >
        {token.symbol}
      </span>
      <span
        className={`font-mono font-bold text-lg md:text-xl ${
          token.positive ? 'text-momento-primary' : 'text-momento-error'
        }`}
      >
        {token.change}
      </span>
    </span>
  ));

  return (
    <div className="w-full border-y border-white/[0.04] py-5 overflow-hidden">
      <div className="animate-ticker-scroll whitespace-nowrap">
        {tickerContent}
        {tickerContent}
      </div>
    </div>
  );
}
