'use client';

const posts = [
  { color: 'from-emerald-500/20 to-teal-500/10' },
  { color: 'from-blue-500/20 to-indigo-500/10' },
  { color: 'from-amber-500/20 to-orange-500/10' },
  { color: 'from-pink-500/20 to-rose-500/10' },
  { color: 'from-purple-500/20 to-violet-500/10' },
  { color: 'from-cyan-500/20 to-sky-500/10' },
];

export default function CreatorProfileScreen() {
  return (
    <div className="h-full bg-black overflow-hidden">
      {/* Cover */}
      <div className="h-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-momento-primary/20 via-momento-primary/5 to-transparent" />
        <div className="absolute top-1/2 left-1/3 w-16 h-16 bg-momento-primary/10 rounded-full blur-2xl" />
      </div>

      {/* Profile info */}
      <div className="px-2.5 -mt-4 relative z-10">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-momento-primary/30 to-momento-primary/10 border-2 border-black flex items-center justify-center">
          <span className="text-momento-primary text-[9px] font-bold">NB</span>
        </div>

        <div className="mt-1.5">
          <div className="flex items-center gap-1">
            <h3 className="text-white text-[10px] font-bold">Nash Bryant</h3>
            <svg className="w-2.5 h-2.5 text-momento-primary" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-white/30 text-[7px] mt-0.5">Musician & Producer · Toronto</p>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-2">
          <div>
            <p className="text-white text-[9px] font-bold font-mono">2.4K</p>
            <p className="text-white/25 text-[6px]">Supporters</p>
          </div>
          <div>
            <p className="text-white text-[9px] font-bold font-mono">186</p>
            <p className="text-white/25 text-[6px]">Posts</p>
          </div>
          <div>
            <p className="text-momento-primary text-[9px] font-bold font-mono">$1.24</p>
            <p className="text-white/25 text-[6px]">Token Price</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 mt-2">
          <button className="flex-1 bg-momento-primary text-black text-[8px] font-bold py-1 rounded-md">
            Support
          </button>
          <button className="flex-1 bg-white/[0.06] border border-white/[0.08] text-white text-[8px] font-bold py-1 rounded-md">
            Follow
          </button>
        </div>

        {/* Bio */}
        <p className="text-white/40 text-[7px] leading-relaxed mt-2">
          Independent artist pushing boundaries. Every supporter gets exclusive access to unreleased tracks and studio sessions.
        </p>

        {/* Post grid */}
        <div className="mt-2">
          <p className="text-white/25 text-[6px] uppercase tracking-wider font-mono mb-1.5">Posts</p>
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((p, i) => (
              <div
                key={i}
                className={`aspect-square bg-gradient-to-br ${p.color} rounded-md`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
