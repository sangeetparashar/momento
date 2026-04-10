'use client';

import Image from 'next/image';

export default function WalletScreen() {
  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      <Image
        src="/screens/wallet.png"
        alt="Momento wallet and portfolio"
        fill
        className="object-cover object-top"
        sizes="280px"
      />
    </div>
  );
}
