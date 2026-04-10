'use client';

import Image from 'next/image';

export default function HomeFeedScreen() {
  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      <Image
        src="/screens/feed.png"
        alt="Momento home feed"
        fill
        className="object-cover object-top"
        sizes="280px"
        priority
      />
    </div>
  );
}
