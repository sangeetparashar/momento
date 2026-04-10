'use client';

import Image from 'next/image';

export default function ExploreScreen() {
  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      <Image
        src="/screens/explore.png"
        alt="Momento explore page"
        fill
        className="object-cover object-top"
        sizes="280px"
      />
    </div>
  );
}
