'use client';

interface PhoneFrameProps {
  children: React.ReactNode;
  className?: string;
}

export default function PhoneFrame({ children, className = '' }: PhoneFrameProps) {
  return (
    <div className={`hidden md:block relative ${className}`}>
      {/* Outer glow */}
      <div className="absolute -inset-4 bg-momento-primary/[0.03] rounded-[3rem] blur-2xl" />

      {/* Phone body */}
      <div
        className="relative w-[280px] bg-[#0a0a0a] rounded-[2.5rem] border border-white/[0.08] overflow-hidden"
        style={{
          aspectRatio: '9 / 19.5',
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.04), 0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Notch / Dynamic Island */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20">
          <div className="w-[90px] h-[28px] bg-black rounded-b-2xl" />
        </div>

        {/* Side buttons (visual only) */}
        <div className="absolute top-[100px] -left-[2px] w-[3px] h-[30px] bg-[#1a1a1a] rounded-l-sm" />
        <div className="absolute top-[140px] -left-[2px] w-[3px] h-[50px] bg-[#1a1a1a] rounded-l-sm" />
        <div className="absolute top-[200px] -left-[2px] w-[3px] h-[50px] bg-[#1a1a1a] rounded-l-sm" />
        <div className="absolute top-[140px] -right-[2px] w-[3px] h-[60px] bg-[#1a1a1a] rounded-r-sm" />

        {/* Screen content */}
        <div className="absolute inset-0 pt-[38px] pb-[20px] px-[2px] overflow-hidden">
          <div className="w-full h-full rounded-b-[2.3rem] overflow-hidden bg-black">
            {children}
          </div>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-white/20 rounded-full z-20" />
      </div>
    </div>
  );
}
