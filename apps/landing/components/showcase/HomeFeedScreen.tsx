'use client';

const posts = [
  {
    name: 'Maya Rodriguez',
    handle: '@maya',
    location: '0.3 km away',
    caption: 'New mural downtown — who wants to collab?',
    likes: 142,
    comments: 23,
    color: 'from-emerald-500/30 to-teal-500/20',
  },
  {
    name: 'Jordan Ellis',
    handle: '@jordan',
    location: '1.2 km away',
    caption: 'Studio session tonight. Exclusive drop at midnight.',
    likes: 89,
    comments: 11,
    color: 'from-purple-500/30 to-indigo-500/20',
  },
  {
    name: 'Aisha Khan',
    handle: '@aisha',
    location: '2.5 km away',
    caption: 'Pop-up at Queen & Ossington this Saturday!',
    likes: 214,
    comments: 37,
    color: 'from-amber-500/30 to-orange-500/20',
  },
];

export default function HomeFeedScreen() {
  return (
    <div className="h-full bg-black p-3 space-y-3 overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-white/50 text-[9px] font-mono">9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 border border-white/40 rounded-[2px] relative">
            <div className="absolute inset-[1px] right-[2px] bg-momento-primary rounded-[1px]" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-bold font-display">Your Feed</h3>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-momento-primary animate-pulse" />
          <span className="text-momento-primary text-[8px] font-mono">LIVE</span>
        </div>
      </div>

      {/* Location pill */}
      <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-full px-2.5 py-1 w-fit">
        <svg className="w-2.5 h-2.5 text-momento-primary" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <span className="text-white/50 text-[8px]">Toronto, ON</span>
      </div>

      {/* Posts */}
      {posts.map((post, i) => (
        <div key={i} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${post.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-white text-[10px] font-semibold truncate">{post.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-2 h-2 text-momento-primary/60" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="text-white/30 text-[8px]">{post.location}</span>
              </div>
            </div>
          </div>
          {/* Content placeholder */}
          <div className={`h-16 bg-gradient-to-br ${post.color} rounded-lg`} />
          <p className="text-white/70 text-[9px] leading-relaxed">{post.caption}</p>
          <div className="flex items-center gap-3 text-[8px] text-white/30">
            <span className="flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {post.likes}
            </span>
            <span className="flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {post.comments}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
