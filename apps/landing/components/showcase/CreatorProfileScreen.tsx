'use client';

import Image from 'next/image';

export default function CreatorProfileScreen() {
  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      <Image
        src="/screens/creator.png"
        alt="Momento creator profile"
        fill
        className="object-cover object-top"
        sizes="280px"
      />
    </div>
  );
}
