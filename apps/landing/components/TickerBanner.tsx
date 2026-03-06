export default function TickerBanner() {
  const tokens = [
    { symbol: '$DEEL', change: '+17%', positive: true },
    { symbol: '$EMMA', change: '+8.4%', positive: true },
    { symbol: '$RICK', change: '-2.1%', positive: false },
    { symbol: '$NASH', change: '+23%', positive: true },
    { symbol: '$BELLE', change: '+5.6%', positive: true },
    { symbol: '$CODY', change: '-1.3%', positive: false },
    { symbol: '$MIRA', change: '+12%', positive: true },
    { symbol: '$JACE', change: '+3.8%', positive: true },
    { symbol: '$LUNA', change: '-0.7%', positive: false },
    { symbol: '$ZARA', change: '+31%', positive: true },
    { symbol: '$KAI', change: '+6.2%', positive: true },
    { symbol: '$NICO', change: '-4.5%', positive: false },
  ];

  const tickerContent = tokens.map((token, i) => (
    <span key={i} className="inline-flex items-center gap-1.5 mx-6">
      <span className="text-white font-bold">{token.symbol}</span>
      <span
        className={`font-mono font-bold ${
          token.positive ? 'text-momento-primary' : 'text-momento-error'
        }`}
      >
        {token.change}
      </span>
      <span className="text-momento-text-tertiary mx-2">&middot;</span>
    </span>
  ));

  return (
    <div className="w-full bg-momento-bg-secondary border-y border-momento-border py-4 overflow-hidden">
      <div className="animate-ticker-scroll whitespace-nowrap font-mono text-sm">
        {tickerContent}
        {/* Duplicate for seamless loop */}
        {tickerContent}
      </div>
    </div>
  );
}
