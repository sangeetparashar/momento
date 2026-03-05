export const SOCIAL_PLATFORMS = {
  youtube: { icon: 'logo-youtube', color: '#FF0000', urlPrefix: 'https://youtube.com/' },
  instagram: { icon: 'logo-instagram', color: '#E4405F', urlPrefix: 'https://instagram.com/' },
  twitter: { icon: 'logo-twitter', color: '#1DA1F2', urlPrefix: 'https://twitter.com/' },
  spotify: { icon: 'musical-notes', color: '#1DB954', urlPrefix: 'https://open.spotify.com/' },
  soundcloud: { icon: 'cloud', color: '#FF5500', urlPrefix: 'https://soundcloud.com/' },
  tiktok: { icon: 'musical-note', color: '#000000', urlPrefix: 'https://tiktok.com/@' },
  website: { icon: 'globe', color: '#8A8A8A', urlPrefix: '' },
} as const;

export const DUMMY_TRENDING_TOKENS = [
  { symbol: 'DEEL', change: 12.5 },
  { symbol: 'BELLE', change: -3.2 },
  { symbol: 'NAAN', change: 8.7 },
  { symbol: 'AURA', change: 24.1 },
  { symbol: 'SEAM', change: -1.5 },
];

export const DUMMY_CREATORS_TO_WATCH = [
  { symbol: 'TASH', change: 45.2 },
  { symbol: 'TEAH', change: 18.9 },
  { symbol: 'TWSH', change: 7.3 },
  { symbol: 'CHCTS', change: -2.1 },
];
