import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Toronto Neighborhoods & Landmarks ──────────────────────────────────────

const TORONTO_CENTER = { lat: 43.6532, lng: -79.3832 };

const TORONTO_LOCATIONS = [
  { lat: 43.6426, lng: -79.3871, name: 'King West' },
  { lat: 43.6547, lng: -79.3623, name: 'Distillery District' },
  { lat: 43.6677, lng: -79.3948, name: 'Kensington Market' },
  { lat: 43.6709, lng: -79.3857, name: 'Yorkville' },
  { lat: 43.6544, lng: -79.4055, name: 'Queen West' },
  { lat: 43.6435, lng: -79.3792, name: 'St. Lawrence Market' },
  { lat: 43.6629, lng: -79.3957, name: 'Chinatown' },
  { lat: 43.6792, lng: -79.3466, name: 'Leslieville' },
  { lat: 43.6597, lng: -79.4625, name: 'High Park' },
  { lat: 43.6389, lng: -79.3815, name: 'Harbourfront' },
  { lat: 43.6455, lng: -79.3960, name: 'Liberty Village' },
  { lat: 43.6763, lng: -79.4113, name: 'Little Italy' },
  { lat: 43.6526, lng: -79.3727, name: 'The Esplanade' },
  { lat: 43.6704, lng: -79.3930, name: 'University of Toronto' },
  { lat: 43.6319, lng: -79.3592, name: 'Cherry Beach' },
];

function jitter(value: number, range: number = 0.005): number {
  return value + (Math.random() - 0.5) * range;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Open-Source Avatar & Image URLs ────────────────────────────────────────
// Using DiceBear API (open source, no auth needed) for avatars
// Using picsum.photos for post images and banners

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${seed}&size=200`;
}

function bannerUrl(seed: string): string {
  return `https://picsum.photos/seed/${seed}-banner/800/300`;
}

function postImageUrl(seed: string): string {
  return `https://picsum.photos/seed/${seed}/600/800`;
}

// Using free sample video URLs from public domain sources
const SAMPLE_VIDEO_URLS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
];

// ─── 15 Toronto Creators ────────────────────────────────────────────────────

interface CreatorData {
  privyUserId: string;
  walletAddress: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  tokenSymbol: string;
  socialLinks: Record<string, string>;
  locationIndex: number;
  followerCount: number;
  followingCount: number;
  textPosts: string[];
  imageCaptions: string[];
  videoCaptions: string[];
}

const CREATORS: CreatorData[] = [
  {
    privyUserId: 'privy-toronto-001',
    walletAddress: 'TOR1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1',
    email: 'nadia@momento.test',
    username: 'nadiasounds',
    displayName: 'Nadia Hassan',
    bio: 'R&B vocalist and songwriter from Scarborough. Signed to a Toronto indie label. My music is about love, loss, and late-night drives on the DVP.',
    tokenSymbol: 'NDIA',
    socialLinks: { instagram: 'nadiasounds', spotify: 'artist/nadiasounds', twitter: 'nadiasoundsTO', youtube: '@nadiasounds', tiktok: 'nadiasounds' },
    locationIndex: 0,
    followerCount: 14200,
    followingCount: 312,
    textPosts: [
      'Late night studio session with @marcusbeats. Something special is cooking.',
      'Toronto raised me. Every song I write has this city in its DNA.',
      'Writing new lyrics at my fav cafe on Queen West. Iced oat latte in hand.',
      'Reminder: your voice matters. Literally and figuratively.',
      'Sold out the Velvet Underground last night. Thank you Toronto!',
      'Who else can hear the city when it rains? That sound is my muse.',
      'New single drops Friday. This one is different. This one is personal.',
      'Vocal warmups at 6am because discipline is the other side of talent.',
      'Grateful for every DM that says my music helped someone through a hard night.',
      'Started making music in my mom\'s basement in Scarborough. Look at us now.',
    ],
    imageCaptions: [
      'Behind the scenes of the new music video shoot in the Distillery District',
      'Golden hour on the Toronto Islands. Pure magic.',
      'Soundcheck at The Opera House before tonight\'s show',
      'New merch just dropped! Link in bio',
      'This city skyline never gets old. CN Tower at sunset.',
      'Backstage vibes before we go on. Nerves and excitement.',
      'Album art preview. Can you feel the energy?',
      'My writing corner. Where the magic starts.',
      'Caught a vibe at Kensington Market today',
      'Toronto at night from my studio window',
    ],
    videoCaptions: [
      'Acoustic version of "Midnight on Bloor" recorded live in the studio',
      'Behind the scenes: making the music video on Cherry Beach',
      'Vocal warmup routine — this is how I start every session',
      'Crowd singing my lyrics back to me at the Horseshoe Tavern. Chills.',
      'Studio session recap — we made 3 songs in one night',
      'Late night freestyle over a beat from @marcusbeats',
      'Tour bus diaries: Driving down the 401 after a Hamilton show',
      'Reacting to fan covers of my songs. Yall are SO talented.',
      'Cooking jollof rice while listening to my unreleased album',
      'A day in my life as a Toronto R&B artist',
    ],
  },
  {
    privyUserId: 'privy-toronto-002',
    walletAddress: 'TOR2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2',
    email: 'marcus@momento.test',
    username: 'marcusbeats',
    displayName: 'Marcus Chen',
    bio: 'Producer. Beat maker. Half-Chinese, half-Jamaican, fully Toronto. Credits include Drake, PartyNextDoor, and your next favorite artist.',
    tokenSymbol: 'MARC',
    socialLinks: { instagram: 'marcusbeats', twitter: 'marcusbeatsTO', soundcloud: 'marcusbeats', youtube: '@marcusbeats' },
    locationIndex: 1,
    followerCount: 22800,
    followingCount: 189,
    textPosts: [
      'New pack of beats dropping this week. 10 instrumentals, all vibes.',
      'The 808 is not just a drum machine. It\'s a language.',
      'Spent 6 hours on one hi-hat pattern today. Perfectionism is a disease.',
      'Toronto has the best music scene in North America. I said what I said.',
      'Collab with @nadiasounds just hit 1M streams. We built that from scratch.',
      'Mixing is 80% of the song and nobody wants to hear that.',
      'Early mornings in the studio before the city wakes up > everything.',
      'My parents thought making beats was a phase. 15 years later...',
      'If your kick doesn\'t hit in the car, it doesn\'t hit at all.',
      'Mentoring young producers at the community center every Saturday. Give back.',
    ],
    imageCaptions: [
      'The setup. MPC, monitors, and bad posture. Home studio tour.',
      'Vinyl digging at Rotate This on Queen West. Found some gems.',
      'Session with a new artist. Can\'t say who yet but trust me.',
      'View from the studio in the Distillery. Best workspace in the city.',
      'Gear collection growing. New synth just arrived.',
      'Coffee and compression. The two Cs of music production.',
      'Late night mixing session. Red lights, loud speakers.',
      'Old school meets new school. Sampling a 1970s record.',
      'Grammy consideration certificate on my wall. One day the real thing.',
      'Teaching the next generation at the youth music workshop',
    ],
    videoCaptions: [
      'Making a beat from scratch in 10 minutes. Watch the process.',
      'How I made the beat for "Midnight on Bloor" — full breakdown',
      'Studio vlog: A full day of sessions with three different artists',
      'Sampling a Bollywood record and turning it into a trap beat',
      'My top 5 VST plugins for R&B production in 2026',
      'Reaction to hearing my beat on the radio for the first time',
      'Mixing tutorial: how to get that Toronto OVO sound',
      'Unboxing the new Ableton Push 3. First impressions.',
      'Cooking dumplings with my mom while playing my latest beats',
      'Jam session at a warehouse in Liberty Village. Pure spontaneity.',
    ],
  },
  {
    privyUserId: 'privy-toronto-003',
    walletAddress: 'TOR3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3',
    email: 'priya@momento.test',
    username: 'priyalens',
    displayName: 'Priya Sharma',
    bio: 'Street photographer capturing Toronto\'s hidden stories. Featured in Toronto Star, BlogTO, and National Geographic. Brampton to downtown, one frame at a time.',
    tokenSymbol: 'PRYA',
    socialLinks: { instagram: 'priyalens', twitter: 'priyalensTO', website: 'https://priyasharma.photo', youtube: '@priyalens' },
    locationIndex: 2,
    followerCount: 31500,
    followingCount: 445,
    textPosts: [
      'Every stranger on the TTC has a story. I just try to capture a single frame of it.',
      'Woke up at 4am to shoot the sunrise over the Don Valley. Worth every lost minute of sleep.',
      'Photography is not about the camera. It\'s about the eye behind it.',
      'Kensington Market has infinite compositions. I could shoot here every day for a year.',
      'Got stopped by a stranger who said my photo of them changed their life. That\'s why I do this.',
      'Rain in Toronto is a gift. The reflections turn the city into a painting.',
      'Street photography ethics: always ask, always respect, always share.',
      'Applied for a Canada Council grant for my "Faces of the TTC" project.',
      'The best photos happen when you stop looking for them.',
      'Brampton kid with a camera. That\'s the whole origin story.',
    ],
    imageCaptions: [
      'Morning light cutting through the fog at Cherry Beach',
      'A stranger\'s umbrella on Queen Street. Sometimes the simple moments say the most.',
      'The Kensington Market fish vendor I\'ve been photographing for 3 years. He finally smiled.',
      'Toronto skyline from the Polson Pier at blue hour',
      'Graffiti Alley in all its chaotic glory',
      'Rush hour at Union Station. 50,000 stories in one frame.',
      'The last bookshop on Queen West. Film vibes.',
      'Reflections in a puddle on Dundas Street after the rain',
      'My favorite alley in Chinatown. Neon and steam.',
      'A quiet moment at Trinity Bellwoods on a Sunday morning',
    ],
    videoCaptions: [
      'How I approach street photography in Toronto — full walk-through',
      'Editing a raw street photo from start to finish in Lightroom',
      'Day in the life of a Toronto street photographer',
      'I asked 10 strangers on the TTC if I could take their portrait',
      'Golden hour photo walk from Yonge-Dundas to Harbourfront',
      'My camera bag: everything I carry on a Toronto shoot',
      'Shooting film in 2026: loading and developing a roll of Kodak Portra',
      'Behind the scenes of my Toronto Star photo essay',
      'Rainy day photography tips for urban shooters',
      'Best photography spots in Toronto that tourists never find',
    ],
  },
  {
    privyUserId: 'privy-toronto-004',
    walletAddress: 'TOR4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4',
    email: 'dj.kim@momento.test',
    username: 'djkimchi',
    displayName: 'DJ Kimchi',
    bio: 'Korean-Canadian DJ spinning everything from K-pop remixes to deep house. Resident at CODA and Rebel. Koreatown\'s finest export.',
    tokenSymbol: 'KIMX',
    socialLinks: { instagram: 'djkimchi', twitter: 'djkimchiTO', soundcloud: 'djkimchi', tiktok: 'djkimchi' },
    locationIndex: 3,
    followerCount: 18700,
    followingCount: 276,
    textPosts: [
      'Tonight at CODA: Deep house till 4am. Doors at 10. See you on the dance floor.',
      'K-pop x House music is a genre that doesn\'t exist yet. I\'m building it.',
      'My parents wanted me to be a doctor. I heal people with 128 BPM instead.',
      'The transition from "One More Time" into a Korean folk sample. Chef\'s kiss.',
      'Toronto nightlife is the most underrated in the world. Fight me.',
      'Flew back from Seoul yesterday. Time to bring those sounds to Yorkville.',
      'Every DJ set is a conversation with the crowd. You just have to listen.',
      'Broke a personal record: 6 hour set at Rebel. My back is destroyed but my soul is full.',
      'Working on a remix EP. 5 K-pop tracks reimagined for the club.',
      'Shoutout to the person who requested "Gangnam Style" ironically. I played it unironically.',
    ],
    imageCaptions: [
      'Setup at CODA tonight. CDJ-3000s and good vibes only.',
      'Crowd shot from Saturday night. This energy is unreal.',
      'Vinyl collection tour. 2000+ records and counting.',
      'Sunset set on a rooftop in Yorkville. Summer in Toronto.',
      'New merch: Korean-inspired DJ Kimchi tees. Limited run.',
      'Flight to Seoul for a guest set at Octagon Club',
      'The booth at Rebel nightclub. My second home.',
      'Korean street food + DJ gear. My two loves in one photo.',
      'Production setup at home. Making remixes at 2am.',
      'After party vibes at a warehouse in the Junction',
    ],
    videoCaptions: [
      'Full DJ set from CODA last Saturday — 2 hours of deep house',
      'How I create K-pop remixes for the club — tutorial',
      'A night in my life as a Toronto club DJ',
      'Mixing tutorial: beatmatching by ear vs using sync',
      'Crowd reaction when I dropped the Korean folk house remix',
      'Behind the decks: what DJs actually do during a set',
      'Seoul nightlife vs Toronto nightlife — honest comparison',
      'Unboxing my new Pioneer DDJ-FLX10. First mix test.',
      'Making a remix of a BTS track live on stream',
      'Documentary: how Koreatown shaped Toronto\'s music scene',
    ],
  },
  {
    privyUserId: 'privy-toronto-005',
    walletAddress: 'TOR5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx5',
    email: 'elena@momento.test',
    username: 'elenacooks',
    displayName: 'Elena Petrova',
    bio: 'Chef and food content creator. Ukrainian-Canadian making Toronto eat better. Pop-ups, recipes, and the occasional rant about overpriced brunch.',
    tokenSymbol: 'CHEF',
    socialLinks: { instagram: 'elenacooks', tiktok: 'elenacooks', youtube: '@elenacooks', website: 'https://elenacooks.ca' },
    locationIndex: 4,
    followerCount: 27300,
    followingCount: 510,
    textPosts: [
      '$22 for avocado toast is a crime against breakfast. I\'ll teach you to make it for $3.',
      'Pop-up dinner next Saturday at a secret location in Queen West. DM for tickets.',
      'Unpopular opinion: Toronto has better food than New York. The diversity here is unmatched.',
      'My baba\'s borscht recipe has no measurements. It\'s all vibes and tasting.',
      'Tested a new perogies recipe 14 times this week. Version 14 is the one.',
      'The best meal I had this year was $8 pho from a spot on Spadina. Simple wins.',
      'Working on a cookbook. Ukrainian-Canadian fusion. My baba would be confused but proud.',
      'Food is memory. Every dish I make carries a story from someone I love.',
      'Restaurant prices in Toronto are out of control. Cook at home. I\'ll show you how.',
      'Farmers market haul from St. Lawrence Market. This city feeds my soul.',
    ],
    imageCaptions: [
      'Handmade perogies ready for the pop-up tonight. 200 of them.',
      'The spread at last night\'s supper club. Every dish tells a story.',
      'My baba\'s kitchen vs my kitchen. Different decades, same love.',
      'Farmers market finds at St. Lawrence. Look at these heirloom tomatoes.',
      'Behind the scenes of a recipe video shoot in my tiny Queen West kitchen',
      'Borscht so good it made a grown man cry at the pop-up',
      'New recipe: Korean-Ukrainian fusion tacos. Don\'t knock it till you try it.',
      'Sunday morning bread baking. The apartment smells incredible.',
      'Plating practice. Making simple food look beautiful.',
      'Foraging in High Park for wild garlic and herbs',
    ],
    videoCaptions: [
      'How to make perfect perogies from scratch — full recipe',
      'Eating my way through Kensington Market in one afternoon',
      'Secret supper club: 50 strangers, 7 courses, 1 night',
      'My baba teaches me the family borscht recipe (it\'s chaos)',
      'Toronto food tour: $10 meals that slap harder than $50 ones',
      'Making 500 dumplings for a pop-up dinner — the grind is real',
      'Kitchen essentials: the only 5 tools you actually need',
      'I recreated a $200 Alo restaurant dish for $15 at home',
      'Morning routine of a chef: 5am at the wholesale market',
      'Cooking with strangers: I knocked on doors and made dinner with whoever answered',
    ],
  },
  {
    privyUserId: 'privy-toronto-006',
    walletAddress: 'TOR6xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx6',
    email: 'jaylen@momento.test',
    username: 'jaylenmoves',
    displayName: 'Jaylen Williams',
    bio: 'Dancer and choreographer from Jane and Finch. Afrobeats, hip-hop, contemporary. My body is the instrument, the city is the stage.',
    tokenSymbol: 'JMOV',
    socialLinks: { instagram: 'jaylenmoves', tiktok: 'jaylenmoves', youtube: '@jaylenmoves', twitter: 'jaylenmovesthe' },
    locationIndex: 5,
    followerCount: 45200,
    followingCount: 623,
    textPosts: [
      'Dance is the one language that doesn\'t need translation. Just feel it.',
      'Teaching a free hip-hop class at the community center in Jane and Finch this Saturday.',
      'Choreographed a piece for a Raptors halftime show. Childhood dream unlocked.',
      'My knees are 28 but feel 48. The price of doing what you love.',
      'Flew to Lagos for Afrobeats dance festival. Toronto to Lagos pipeline is real.',
      'Every kid in Jane and Finch deserves access to dance. Working on making that happen.',
      'New choreography to Burna Boy\'s latest. Dropping the video tomorrow.',
      'The cipher at Yonge-Dundas Square last night was electric. Toronto street dance is alive.',
      'Workshop in Montreal next week. Teaching Toronto-style Afrobeats fusion.',
      'Body sore, spirit full. That\'s the dancer\'s daily report.',
    ],
    imageCaptions: [
      'Mid-air at Trinity Bellwoods. My photographer caught the perfect frame.',
      'Teaching the youth class at the community center. These kids are incredible.',
      'Backstage before the Raptors halftime performance. Nerves and excitement.',
      'New dance video coming soon. Shot this on the rooftop of my building.',
      'Dance crew photo at Nathan Phillips Square. We own this city.',
      'In Lagos for the Afrobeats dance festival. Toronto represent.',
      'Workshop with 50 dancers in Montreal. The energy was unmatched.',
      'Studio session. Mirrors, sweat, and repetition.',
      'The cypher. No choreography, just feeling. Downtown Toronto.',
      'My dance journey: from Jane and Finch community center to international stages',
    ],
    videoCaptions: [
      'Full choreography to Burna Boy — shot in one take at Cherry Beach',
      'Dance battle at Yonge-Dundas Square. I went against 12 dancers.',
      'Teaching Afrobeats to beginners — 30 minute class follow-along',
      'Freestyle in the rain on King Street. Sometimes the moment finds you.',
      'How I warm up before every performance — full routine',
      'A day training with the dance crew. 8 hours of rehearsal.',
      'Street dance cipher in Kensington Market. The crowd was wild.',
      'Learning traditional Nigerian dance from my uncle in Lagos',
      'Toronto vs London dance battle — who wins?',
      'My story: from Jane and Finch to dancing for Drake. Full documentary.',
    ],
  },
  {
    privyUserId: 'privy-toronto-007',
    walletAddress: 'TOR7xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx7',
    email: 'sofia@momento.test',
    username: 'sofiaink',
    displayName: 'Sofia Reyes',
    bio: 'Tattoo artist and illustrator. Colombian-Canadian. My shop is in Kensington Market. Every tattoo has a story — I just help you wear it.',
    tokenSymbol: 'SOFA',
    socialLinks: { instagram: 'sofiaink', twitter: 'sofiainktoronto', website: 'https://sofiaink.ca', tiktok: 'sofiaink' },
    locationIndex: 6,
    followerCount: 19400,
    followingCount: 334,
    textPosts: [
      'Tattoos are permanent. So are the stories behind them. Choose both carefully.',
      'Books are open for April. Link in bio to book a consultation.',
      'Spent 8 hours on a full sleeve today. My hand is cramping but the art is beautiful.',
      'Kensington Market is the creative heart of Toronto. Proud to have my shop here.',
      'Drawing flash sheets at 2am. The ideas come when the city sleeps.',
      'A client cried today when they saw their memorial tattoo. That\'s the job.',
      'Colombian patterns meet Toronto street art. That\'s my style in one sentence.',
      'Mentoring a new apprentice at the shop. Teaching is the highest form of art.',
      'Every scar has a story. Every tattoo writes a new chapter over it.',
      'Pop-up tattoo event at a gallery in the Distillery District next weekend.',
    ],
    imageCaptions: [
      'Fresh ink: a Colombian orchid sleeve. 12 hours of work across 3 sessions.',
      'Flash sheet drop. Pick your design, walk-ins welcome this Saturday.',
      'My shop in Kensington Market. Come say hi.',
      'Custom design: a Toronto skyline wrapped around a compass rose',
      'The tools of the trade. Rotary machines and single-use needles.',
      'Mural I painted on the side of a building in Chinatown',
      'A memorial piece for a client who lost their mother. Honor work.',
      'Sketchbook page: ideas for a new series inspired by Toronto wildlife',
      'Before and after: cover-up tattoo transformation',
      'Art show at a gallery on Ossington. My illustrations on canvas for once.',
    ],
    videoCaptions: [
      'Full tattoo session timelapse: from sketch to skin in 6 hours',
      'How I design a custom tattoo from client brief to final art',
      'A day at the shop in Kensington Market. Walk-ins, regulars, and surprises.',
      'Tattoo aftercare 101: how to keep your new ink looking perfect',
      'Drawing a flash sheet from start to finish — real-time art process',
      'Client reactions to seeing their finished tattoos for the first time',
      'Tour of my tattoo shop: every corner has a story',
      'Mural painting timelapse in Chinatown. 3 days condensed into 3 minutes.',
      'Q&A: your tattoo questions answered by a professional artist',
      'My journey from Bogota to Toronto: how I built a tattoo career in Canada',
    ],
  },
  {
    privyUserId: 'privy-toronto-008',
    walletAddress: 'TOR8xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx8',
    email: 'omar@momento.test',
    username: 'omarwrites',
    displayName: 'Omar Farah',
    bio: 'Spoken word poet and author. Somali-Canadian. My words are about identity, diaspora, and finding home in Toronto. Published in Brick Magazine.',
    tokenSymbol: 'OMAR',
    socialLinks: { instagram: 'omarwrites', twitter: 'omarwritesTO', website: 'https://omarfarah.ca', youtube: '@omarwrites' },
    locationIndex: 7,
    followerCount: 8900,
    followingCount: 445,
    textPosts: [
      'A poem is a house you build with breath. Walk in. Stay a while.',
      'Reading at the Aga Khan Museum tonight. Doors at 7. Free admission.',
      'The hyphen in "Somali-Canadian" is the most important punctuation of my life.',
      'Writing about my mother\'s journey from Mogadishu to Dixon Road.',
      'Toronto is the most multilingual city in the world. That\'s poetry in itself.',
      'Finished the first draft of my second collection. 63 poems. Two years of work.',
      'Spoken word is not just performance. It\'s a community gathering.',
      'Had a poem published in Brick Magazine this month. Still doesn\'t feel real.',
      'Teaching a creative writing workshop for newcomer youth in Etobicoke.',
      'The TTC is the best writing desk in the city. Something about the movement.',
    ],
    imageCaptions: [
      'On stage at the Aga Khan Museum. The acoustics in that space are spiritual.',
      'My writing desk at home. Organized chaos.',
      'Book launch for my first poetry collection. Standing room only.',
      'Performing at the Toronto Poetry Slam finals. The energy was everything.',
      'Draft pages of my new collection. Crossed-out words are part of the art.',
      'Teaching creative writing to newcomer youth. Their stories are incredible.',
      'Sunset at Harbourfront while editing my manuscript.',
      'The Toronto Reference Library is my second home.',
      'Arabic calligraphy practice. Connecting to my heritage through letterforms.',
      'Open mic night at the Drake Hotel. Standing ovation.',
    ],
    videoCaptions: [
      'Performing "Letters to Mogadishu" — full spoken word piece',
      'Writing process: how I turn an emotion into a poem',
      'Open mic night at a Toronto cafe. 5 poets, 5 perspectives.',
      'Book launch reading: 3 poems from my debut collection',
      'What it means to be Somali-Canadian in Toronto — a poetic essay',
      'Teaching poetry to teenagers. Watch their first performances.',
      'A walking tour of Toronto through poetry. Each stop is a verse.',
      'My favorite Toronto bookshops and why they matter',
      'Collaboration with @nadiasounds: spoken word over live music',
      'The story behind my most personal poem. Trigger warning: it\'s heavy.',
    ],
  },
  {
    privyUserId: 'privy-toronto-009',
    walletAddress: 'TOR9xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9',
    email: 'alex.t@momento.test',
    username: 'alexthrifts',
    displayName: 'Alex Torres',
    bio: 'Vintage fashion dealer and stylist. Filipino-Canadian. I find the clothes nobody wants and make them the clothes everybody needs. Thrift king of Toronto.',
    tokenSymbol: 'THFT',
    socialLinks: { instagram: 'alexthrifts', tiktok: 'alexthrifts', youtube: '@alexthrifts', twitter: 'alexthriftsTO' },
    locationIndex: 8,
    followerCount: 33100,
    followingCount: 721,
    textPosts: [
      'Found a 1990s leather jacket for $12 at Value Village today. Resale value: $180. The thrift gods blessed me.',
      'Sustainability isn\'t a trend. It\'s the only way forward for fashion.',
      'Pop-up vintage market at Stackt Market next Sunday. Come through.',
      'Styled 3 music video looks this week using only thrifted pieces. Zero new garments.',
      'Toronto has the best thrift stores in Canada. I\'ve been to every single one.',
      'My parents came to Canada with one suitcase. Now I have a warehouse of clothes. Full circle.',
      'Tip: the best thrift store finds are on Wednesday mornings. That\'s when they restock.',
      'Fast fashion is the second biggest polluter on earth. Thrift instead.',
      'Styled a whole wedding party from vintage shops. The photos are incredible.',
      'Vintage Levi\'s from 1985. This is not just clothing, it\'s a time capsule.',
    ],
    imageCaptions: [
      'Today\'s haul: 90s windbreaker, vintage Raptors jersey, and a cashmere sweater. Total: $28.',
      'Pop-up setup at Stackt Market. 200 curated vintage pieces.',
      'Outfit of the day: fully thrifted, head to toe, for under $40',
      'Before and after: how I restore vintage denim to its former glory',
      'The vintage Raptors collection. Every jersey from 1995-2005.',
      'My warehouse studio. Racks on racks on racks.',
      'Styled this look for @jaylenmoves music video shoot',
      'Kensington Market thrift crawl finds. Hit 7 shops in 3 hours.',
      'Rare find: a 1970s YSL blazer at Goodwill for $8',
      'Vintage fashion show at a gallery in the Junction',
    ],
    videoCaptions: [
      'Thrift with me: spending $50 and building 5 complete outfits',
      'How to spot quality vintage clothing — a beginner\'s guide',
      'Restorating a vintage leather jacket from trash to treasure',
      'Toronto thrift store tier list. I ranked every single one.',
      'Styling 3 completely different looks from one thrifted piece',
      'The economics of vintage fashion: how I built a business from $0',
      'Pop-up market vlog: selling 200 pieces in one day',
      'How to thrift for your body type — tips from a professional stylist',
      'Going to the most expensive thrift store in Toronto and the cheapest. Comparison.',
      'A week of outfits made entirely from thrifted clothes',
    ],
  },
  {
    privyUserId: 'privy-toronto-010',
    walletAddress: 'TOR10xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx10',
    email: 'sarah@momento.test',
    username: 'sarahskates',
    displayName: 'Sarah Okafor',
    bio: 'Pro skateboarder and content creator. Nigerian-Canadian. Skating every park and street spot in the GTA. Nike SB team rider.',
    tokenSymbol: 'SKATE',
    socialLinks: { instagram: 'sarahskates', tiktok: 'sarahskates', youtube: '@sarahskates', twitter: 'sarahskatesTO' },
    locationIndex: 9,
    followerCount: 52300,
    followingCount: 398,
    textPosts: [
      'Landed a kickflip down a 10-stair at Harbourfront today. Only took 47 tries.',
      'Skateboarding saved my life. Not being dramatic. It literally gave me community and purpose.',
      'New Nike SB colorway dropping next month. Designed with Toronto in mind.',
      'The best skate spot in Toronto is the Harbourfront wave deck. Change my mind.',
      'Teaching girls to skate every Sunday at Ashbridges Bay park. Free lessons.',
      'Flew to LA for the Street League qualifiers. Toronto girl going global.',
      'My board snapped mid-trick and I ate concrete. Content creation is a contact sport.',
      'Rain day = editing day. Going through footage from this week\'s sessions.',
      'Skating is 90% falling and 10% making it look easy on camera.',
      'The Trinity Bellwoods skate community is the best in the city. Family.',
    ],
    imageCaptions: [
      'Nosegrind on the Harbourfront ledge. Photo by @priyalens',
      'New Nike SB x Sarah Okafor collab. Toronto-inspired colorway.',
      'Teaching the Sunday girls skate class at Ashbridges Bay',
      'Board collection. 47 decks and counting. Yes I have a problem.',
      'Skating the wave deck at Harbourfront at golden hour',
      'Battle scars from today\'s session. Elbows took the worst of it.',
      'Trinity Bellwoods skate crew deep. Saturday session.',
      'Fresh setup: new deck, new trucks, new wheels. Ready to shred.',
      'Skating a spot I\'ve been eyeing for months. Finally committed to the drop.',
      'Competition day at Street League. Focused.',
    ],
    videoCaptions: [
      'Full skate part: every clip filmed in Toronto this year',
      'Teaching a complete beginner to skateboard in one day',
      'Best skate spots in Toronto — the complete guide',
      'How I prepare for a competition: training routine and mindset',
      'Skating the entire waterfront trail from Harbourfront to the Beaches',
      'Trick tips: how to kickflip — broken down step by step',
      'Girls skate day at Trinity Bellwoods. The vibes were immaculate.',
      'Behind the scenes of a Nike SB commercial shoot in Toronto',
      'I tried every skateboard brand for 30 days. Honest review.',
      'A love letter to Toronto skateboarding. Short documentary.',
    ],
  },
  {
    privyUserId: 'privy-toronto-011',
    walletAddress: 'TOR11xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx11',
    email: 'dev@momento.test',
    username: 'devpaints',
    displayName: 'Dev Anand',
    bio: 'Muralist and graffiti artist painting Toronto\'s walls for 12 years. From illegal tags to commissioned murals. My city is my canvas.',
    tokenSymbol: 'MURAL',
    socialLinks: { instagram: 'devpaints', twitter: 'devpaintsTO', website: 'https://devpaints.com', youtube: '@devpaints' },
    locationIndex: 10,
    followerCount: 16800,
    followingCount: 267,
    textPosts: [
      'A blank wall is an invitation. Every surface has potential.',
      'Just got commissioned to paint the entire side of a building in Liberty Village.',
      'Graffiti is not vandalism. It\'s the voice of a neighborhood.',
      'Spent 14 years of my life painting walls. My back is wrecked but the portfolio is pristine.',
      'Toronto has more murals per capita than any other Canadian city. Proud to contribute.',
      'The difference between graffiti and street art is permission and a ladder.',
      'Paint fumes and cold weather. The glamorous life of a winter muralist.',
      'Mentoring street artists through the city\'s mural program. Next generation.',
      'My first tag was on a bridge in Etobicoke when I was 15. We\'ve come a long way.',
      'Art should be free and public. Walls > galleries.',
    ],
    imageCaptions: [
      'New mural in Liberty Village. 40 feet tall, 3 days of work.',
      'Work in progress: a portrait of Terry Fox on a Leslieville building',
      'Graffiti Alley fresh coat. Every year I add a new piece.',
      'The tools: spray cans, brushes, rollers, and a really tall ladder.',
      'Before and after: transforming a parking garage wall in Chinatown',
      'Detail shot of the eyes on my latest portrait mural',
      'Painting in -15°C because the deadline doesn\'t care about weather',
      'Sketch to wall: the design process behind a commissioned mural',
      'My studio. Yes, that is paint on every surface including the ceiling.',
      'Collaboration with @sofiaink: mural meets tattoo design',
    ],
    videoCaptions: [
      'Full mural timelapse: 40-foot piece in Liberty Village from start to finish',
      'How I went from illegal graffiti to getting paid to paint walls',
      'Street art tour of Toronto: every mural worth seeing',
      'The process: designing a mural from client brief to final spray',
      'Painting in the rain. A muralist\'s worst enemy.',
      'Teaching kids to paint their first mural at a community workshop',
      'Graffiti Alley documentary: the artists who made it iconic',
      'My top 10 spray paint colors and when to use each one',
      'Before and after: the most dramatic wall transformation I\'ve ever done',
      'A day painting with @devpaints. Full vlog from dawn to dusk.',
    ],
  },
  {
    privyUserId: 'privy-toronto-012',
    walletAddress: 'TOR12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12',
    email: 'mei@momento.test',
    username: 'meimelody',
    displayName: 'Mei Lin Wong',
    bio: 'Classical pianist turned electronic producer. Mixing Chopin with synth waves. Conservatory-trained at U of T, now making music nobody expected.',
    tokenSymbol: 'MELO',
    socialLinks: { instagram: 'meimelody', spotify: 'artist/meimelody', soundcloud: 'meimelody', youtube: '@meimelody', twitter: 'meimelodyTO' },
    locationIndex: 11,
    followerCount: 11200,
    followingCount: 189,
    textPosts: [
      'Practiced Chopin for 4 hours, then made a house track sampling my own piano recording. Duality.',
      'Classical training gave me technique. Electronic music gave me freedom.',
      'Playing a set at Koerner Hall that transitions from Debussy to deep house. Wish me luck.',
      'The piano has 88 keys. The synth has infinite possibilities. I love both.',
      'My professors at U of T would be horrified. Or maybe secretly impressed.',
      'Music theory is the grammar of emotion. Learn the rules before you break them.',
      'Late night composing at the Faculty of Music. The practice rooms are haunted, I swear.',
      'Classical musicians: we can coexist with electronic producers. I\'m proof.',
      'New EP blending Satie with ambient electronics dropping next month.',
      'The best thing about Toronto is you can play Rachmaninoff at 8pm and DJ at midnight.',
    ],
    imageCaptions: [
      'Koerner Hall stage. The Steinway and I have history.',
      'My dual setup: a 1920s upright piano next to a Moog synthesizer',
      'Recording session at a church in the Annex. The reverb is natural.',
      'Sheet music meets Ableton. My creative process on paper.',
      'Post-recital glow. Classical concert at the Royal Conservatory.',
      'Synth shopping at Moog Audio on Queen West',
      'The practice room at U of T. 10,000 hours happened here.',
      'Album cover shoot for my piano-electronic crossover EP',
      'Handwritten score for my latest composition. 47 pages.',
      'Late night at the electronic music lab. Headphones and neon.',
    ],
    videoCaptions: [
      'Performing Chopin\'s Ballade No. 1, then remixing it live into a house track',
      'How I blend classical piano with electronic production — full tutorial',
      'A day in the life of a classical-electronic musician in Toronto',
      'Recording a piano piece in a church, then chopping it into samples',
      'My top 5 synths for musicians coming from a classical background',
      'Full set from Koerner Hall: classical to electronic in 90 minutes',
      'How music theory makes you a better electronic producer',
      'Piano practice routine: what 4 hours of daily practice looks like',
      'Making an ambient track using only recordings from Toronto streets',
      'The intersection of classical and electronic music — a mini documentary',
    ],
  },
  {
    privyUserId: 'privy-toronto-013',
    walletAddress: 'TOR13xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx13',
    email: 'carlo@momento.test',
    username: 'carlobuilds',
    displayName: 'Carlo Benedetti',
    bio: 'Woodworker and furniture maker in Little Italy. Italian-Canadian. Handmade tables, chairs, and the occasional custom skateboard deck for @sarahskates.',
    tokenSymbol: 'WOOD',
    socialLinks: { instagram: 'carlobuilds', youtube: '@carlobuilds', website: 'https://carlobuilds.ca', tiktok: 'carlobuilds' },
    locationIndex: 12,
    followerCount: 24600,
    followingCount: 156,
    textPosts: [
      'There\'s nothing more satisfying than the sound of a hand plane on walnut.',
      'Custom dining table commission: 8 feet of live-edge black walnut. Starting tomorrow.',
      'My nonno taught me woodworking in his garage in Little Italy. I still use his chisels.',
      'Machines are fast. Hand tools are honest. I use both but respect one more.',
      'Every piece of wood has a story in its grain. My job is to not ruin it.',
      'Shop tour this Saturday for anyone interested in woodworking. DM for details.',
      'Built a custom skateboard deck for @sarahskates. Maple with walnut inlays.',
      'The shop smells like sawdust and espresso. Welcome to Little Italy.',
      'Woodworking is meditation with sharp tools. Focus or bleed.',
      'Delivered a 12-person dining table today. The family was speechless. That\'s the payoff.',
    ],
    imageCaptions: [
      'Live-edge walnut slab before and after finishing. Nature is the designer.',
      'My shop in Little Italy. 800 sq ft of sawdust and dreams.',
      'The joinery on this table took 40 hours. No screws, no nails, just wood.',
      'Hand-carved details on a custom chair back. Renaissance Italian pattern.',
      'Tool wall. Organized by my nonno\'s system. Never changed it.',
      'Custom skateboard deck build for @sarahskates. Maple and walnut.',
      'A stack of reclaimed wood from a demolished house in the Annex.',
      'Finishing a piece with hand-rubbed oil. The grain comes alive.',
      'My nonno\'s chisels. 60 years old and still the sharpest in the shop.',
      'Delivering a dining table to a family in Rosedale. It barely fit through the door.',
    ],
    videoCaptions: [
      'Building a live-edge dining table from start to finish. Full process.',
      'How Japanese joinery works — no nails, no screws, pure precision',
      'Shop tour: everything in my Little Italy woodworking studio',
      'Restoring a 100-year-old chair found in a Toronto dumpster',
      'Making a custom skateboard deck from scratch — for @sarahskates',
      'The difference between $200 and $2000 furniture. Materials and craftsmanship.',
      'Hand tool vs power tool: when to use each one',
      'A commission from start to finish: custom bookshelf for a Toronto home',
      'Wood finishing 101: oils, lacquers, and waxes explained',
      'My nonno taught me everything. This video is for him.',
    ],
  },
  {
    privyUserId: 'privy-toronto-014',
    walletAddress: 'TOR14xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx14',
    email: 'zara@momento.test',
    username: 'zaramixes',
    displayName: 'Zara Ahmed',
    bio: 'Mixologist and bar consultant. Pakistani-Canadian. Crafting cocktails that tell cultural stories. Featured in Toronto Life and Eater.',
    tokenSymbol: 'ZARA',
    socialLinks: { instagram: 'zaramixes', tiktok: 'zaramixes', website: 'https://zaramixes.com', twitter: 'zaramixesTO' },
    locationIndex: 13,
    followerCount: 15600,
    followingCount: 423,
    textPosts: [
      'A cocktail should tell a story. Mine tell stories of diaspora, spice, and home.',
      'Created a cardamom old fashioned for a new bar on King West. The owner cried.',
      'Unpopular opinion: Toronto has a better cocktail scene than New York right now.',
      'Hosting a cocktail masterclass at the Gladstone this Thursday. Tickets on my website.',
      'My ammi\'s chai recipe is the base for my most popular cocktail. She\'s proud but confused.',
      'Bar consulting gig: redesigned the entire drink menu for a Yorkville hotel.',
      'The best cocktails use 3-5 ingredients. Complexity is not about quantity.',
      'Non-alcoholic cocktails deserve the same creativity as boozy ones. No compromises.',
      'Foraging mint and herbs from my balcony garden for tonight\'s recipes.',
      'Toronto Life named my mango lassi martini one of the city\'s best cocktails. Surreal.',
    ],
    imageCaptions: [
      'The cardamom old fashioned that started it all. Simple, complex, unforgettable.',
      'Behind the bar at the Gladstone. My happy place.',
      'Ingredients for tonight: saffron, rose water, rye whiskey. Trust the process.',
      'New cocktail menu I designed for a King West bar. 12 drinks, 12 stories.',
      'Foraging herbs on my balcony. Urban bartender farming.',
      'Cocktail masterclass setup. 20 students, 4 drinks, 2 hours.',
      'The mango lassi martini. Toronto Life\'s cocktail of the year.',
      'My home bar setup. Every bottle has a purpose.',
      'Testing a new drink: turmeric gin sour with black salt rim',
      'Spice cabinet turned cocktail ingredient wall. Pakistani pantry meets bar cart.',
    ],
    videoCaptions: [
      'How to make the perfect cardamom old fashioned at home',
      'Cocktail masterclass: 3 drinks inspired by Pakistani cuisine',
      'A night behind the bar: mixing drinks at Toronto\'s busiest cocktail lounge',
      'Non-alcoholic cocktails that are actually good — 5 recipes',
      'How I consult for bars: redesigning a drink menu from scratch',
      'Making cocktails with my ammi\'s spice collection',
      'Toronto cocktail bar crawl: rating drinks at 5 spots in one night',
      'Foraging in Toronto for cocktail ingredients (yes, in the city)',
      'The science of ice: why your ice matters more than your spirits',
      'How I built a career in cocktails as a Pakistani-Canadian woman',
    ],
  },
  {
    privyUserId: 'privy-toronto-015',
    walletAddress: 'TOR15xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx15',
    email: 'kai@momento.test',
    username: 'kaiframes',
    displayName: 'Kai Nakamura',
    bio: 'Filmmaker and video essayist. Japanese-Canadian. Documenting Toronto\'s subcultures. My short film "The Last Streetcar" won a TIFF emerging artist award.',
    tokenSymbol: 'FILM',
    socialLinks: { instagram: 'kaiframes', youtube: '@kaiframes', twitter: 'kaiframesTO', website: 'https://kaiframes.com', tiktok: 'kaiframes' },
    locationIndex: 14,
    followerCount: 28900,
    followingCount: 312,
    textPosts: [
      'Every film starts with a question. Mine start with "what does Toronto feel like?"',
      'Submitting my latest short to TIFF. Fingers crossed for the second year.',
      'Shooting a documentary about Toronto\'s night shift workers. The city never sleeps.',
      'Cinema is empathy machine. You live inside someone else for 90 minutes.',
      'The 501 Queen streetcar is the most cinematic public transit route in North America.',
      'Editing is where the film is made. Shooting is just collecting ingredients.',
      'Got a Canada Council grant for my next project. About time.',
      'Color grading at 3am because the deadline is tomorrow and the client wants "cinematic."',
      'Toronto\'s film industry is booming but indie filmmakers are still struggling. The irony.',
      'If you want to understand a city, ride its public transit and listen.',
    ],
    imageCaptions: [
      'On set of my new short film. Shooting on the 501 Queen streetcar.',
      'The edit bay. Three monitors, bad posture, and instant noodles.',
      'TIFF red carpet for "The Last Streetcar." Still can\'t believe it.',
      'Storyboard pages for my latest project. Every frame planned.',
      'Camera setup: RED Komodo with vintage Cooke lenses. The dream rig.',
      'Golden hour on the Gardiner Expressway. Toronto is cinematic.',
      'Behind the scenes of a documentary interview. Lighting is everything.',
      'My short film screening at a warehouse in the Junction. Packed house.',
      'Location scouting in the Port Lands. This area is pure visual poetry.',
      'The crew. Small but mighty. 5 people making a feature film.',
    ],
    videoCaptions: [
      'The Last Streetcar — TIFF award-winning short film (full)',
      'How to make a short film in Toronto on a $500 budget',
      'Documentary: Toronto\'s night shift workers. The city after dark.',
      'Color grading tutorial: achieving the "Toronto look" in DaVinci Resolve',
      'A day on set: behind the scenes of an indie film shoot',
      'My favorite films set in Toronto and why they matter',
      'Cinematography breakdown: how I shot the streetcar sequence',
      'Video essay: why Toronto is the best city for emerging filmmakers',
      'Making a music video for @nadiasounds — full behind the scenes',
      'The gear I use to make films. Camera, lenses, audio, lighting.',
    ],
  },
];

// ─── Comment Pool ───────────────────────────────────────────────────────────

const COMMENTS = [
  'This is incredible work! Toronto is lucky to have you.',
  'Absolutely love this. Keep creating!',
  'The talent in this city is unreal.',
  'This made my entire day. Thank you for sharing.',
  'Following your journey is so inspiring.',
  'Toronto needs more of this energy!',
  'Can\'t wait to see what you do next.',
  'This is why I love this city.',
  'Wow, the quality is next level.',
  'You\'re changing the game out here.',
  'Sharing this with everyone I know.',
  'The creativity just keeps flowing!',
  'Been a fan since day one. Still impressed every time.',
  'This is what Toronto culture looks like.',
  'Pure talent. No filter needed.',
  'Bookmarking this for inspiration.',
  'You make it look so effortless but I know the grind is real.',
  'The dedication shows in every piece.',
  'Toronto creator community is the best.',
  'When\'s the next event? I don\'t want to miss it!',
  'The attention to detail here is remarkable.',
  'This hit different. Really resonated with me.',
  'You\'re putting Toronto on the map!',
  'Can we collab? DM me!',
  'This deserves way more views.',
  'Goosebumps. Every single time.',
  'The storytelling here is masterful.',
  'Proud to call Toronto home because of creators like you.',
  'This content is worth more than what any algorithm shows us.',
  'Take my money. Buying your token right now.',
];

// ─── Main Seed Function ────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding Momento database with 15 Toronto creators...\n');

  // Clean up existing data (order matters for FK constraints)
  console.log('Cleaning existing data...');
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.kycRecord.deleteMany();
  await prisma.user.deleteMany();
  console.log('Database cleaned.\n');

  // ─── Create Creators ──────────────────────────────────────────────────

  const createdUsers: { id: string; username: string }[] = [];

  for (let i = 0; i < CREATORS.length; i++) {
    const c = CREATORS[i];
    const loc = TORONTO_LOCATIONS[c.locationIndex];

    const user = await prisma.user.create({
      data: {
        privyUserId: c.privyUserId,
        walletAddress: c.walletAddress,
        email: c.email,
        username: c.username,
        displayName: c.displayName,
        bio: c.bio,
        avatarUrl: avatarUrl(c.username),
        bannerUrl: bannerUrl(c.username),
        role: 'CREATOR',
        kycStatus: 'VERIFIED',      // SKIP_KYC dev bypass — already verified
        isAdminApproved: true,       // Approved via dev bypass
        tokenSymbol: c.tokenSymbol,
        socialLinks: c.socialLinks,
        locationLat: jitter(loc.lat),
        locationLng: jitter(loc.lng),
        followerCount: c.followerCount,
        followingCount: c.followingCount,
        postCount: 30,  // 10 text + 10 image + 10 video
      },
    });

    createdUsers.push({ id: user.id, username: user.username! });
    console.log(`  ✓ Created creator: ${c.displayName} (@${c.username}) — ${loc.name}`);
  }

  console.log(`\n✅ Created ${createdUsers.length} creators\n`);

  // ─── Create KYC Records (dev bypass) ──────────────────────────────────

  for (let i = 0; i < createdUsers.length; i++) {
    await prisma.kycRecord.create({
      data: {
        userId: createdUsers[i].id,
        veriffSessionId: `skip-kyc-session-${CREATORS[i].username}`,
        status: 'VERIFIED',
        veriffDecision: { status: 'approved', reason: 'SKIP_KYC dev bypass' },
        veriffPerson: {
          firstName: CREATORS[i].displayName.split(' ')[0],
          lastName: CREATORS[i].displayName.split(' ').slice(1).join(' '),
        },
        decidedAt: new Date(),
      },
    });
  }

  console.log(`✅ Created ${createdUsers.length} KYC records (dev bypass)\n`);

  // ─── Create Posts ─────────────────────────────────────────────────────

  let totalPosts = 0;
  const allPostIds: string[] = [];

  for (let i = 0; i < CREATORS.length; i++) {
    const c = CREATORS[i];
    const user = createdUsers[i];
    const loc = TORONTO_LOCATIONS[c.locationIndex];
    let creatorPostCount = 0;

    // --- 10 Text Posts ---
    for (let t = 0; t < 10; t++) {
      const hoursAgo = randomInt(1, 720); // Spread over last 30 days
      const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

      const post = await prisma.post.create({
        data: {
          creatorId: user.id,
          postType: 'TEXT',
          content: c.textPosts[t],
          caption: null,
          mediaUrl: null,
          mediaUrls: undefined,
          latitude: jitter(loc.lat),
          longitude: jitter(loc.lng),
          likeCount: randomInt(5, 500),
          commentCount: 0,
          createdAt,
          updatedAt: createdAt,
        },
      });
      allPostIds.push(post.id);
      creatorPostCount++;
    }

    // --- 10 Image Posts ---
    for (let img = 0; img < 10; img++) {
      const hoursAgo = randomInt(1, 720);
      const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000);
      const imgSeed = `${c.username}-post-img-${img}`;

      const post = await prisma.post.create({
        data: {
          creatorId: user.id,
          postType: 'IMAGE',
          content: null,
          caption: c.imageCaptions[img],
          mediaUrl: postImageUrl(imgSeed),
          mediaUrls: [
            postImageUrl(`${imgSeed}-a`),
            postImageUrl(`${imgSeed}-b`),
          ],
          latitude: jitter(loc.lat),
          longitude: jitter(loc.lng),
          likeCount: randomInt(10, 800),
          commentCount: 0,
          createdAt,
          updatedAt: createdAt,
        },
      });
      allPostIds.push(post.id);
      creatorPostCount++;
    }

    // --- 10 Video Posts ---
    for (let v = 0; v < 10; v++) {
      const hoursAgo = randomInt(1, 720);
      const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

      const post = await prisma.post.create({
        data: {
          creatorId: user.id,
          postType: 'VIDEO',
          content: null,
          caption: c.videoCaptions[v],
          mediaUrl: SAMPLE_VIDEO_URLS[v % SAMPLE_VIDEO_URLS.length],
          mediaUrls: undefined,
          latitude: jitter(loc.lat),
          longitude: jitter(loc.lng),
          likeCount: randomInt(15, 1200),
          commentCount: 0,
          createdAt,
          updatedAt: createdAt,
        },
      });
      allPostIds.push(post.id);
      creatorPostCount++;
    }

    totalPosts += creatorPostCount;
    console.log(`  ✓ Created ${creatorPostCount} posts for @${c.username} (10 text, 10 image, 10 video)`);
  }

  console.log(`\n✅ Created ${totalPosts} total posts\n`);

  // ─── Create Follow Relationships ──────────────────────────────────────

  const followPairs: { followerId: string; followingId: string }[] = [];

  // Each creator follows 4-8 other creators (organic network)
  for (let i = 0; i < createdUsers.length; i++) {
    const numFollows = randomInt(4, 8);
    const others = createdUsers.filter((_, idx) => idx !== i);
    const shuffled = [...others].sort(() => Math.random() - 0.5);

    for (let f = 0; f < numFollows && f < shuffled.length; f++) {
      const pair = { followerId: createdUsers[i].id, followingId: shuffled[f].id };
      // Avoid duplicates
      if (!followPairs.some(p => p.followerId === pair.followerId && p.followingId === pair.followingId)) {
        followPairs.push(pair);
      }
    }
  }

  for (const pair of followPairs) {
    await prisma.follow.create({ data: pair });
  }

  // Update follower/following counts based on actual follows
  for (const user of createdUsers) {
    const followerCount = followPairs.filter(p => p.followingId === user.id).length;
    const followingCount = followPairs.filter(p => p.followerId === user.id).length;
    // Add the seed follower counts to the actual follow graph counts
    const creatorData = CREATORS.find(c => c.username === user.username)!;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        followerCount: creatorData.followerCount + followerCount,
        followingCount: creatorData.followingCount + followingCount,
      },
    });
  }

  console.log(`✅ Created ${followPairs.length} follow relationships\n`);

  // ─── Create Comments ──────────────────────────────────────────────────

  let commentCount = 0;
  const postCommentCounts: Record<string, number> = {};

  // Each creator leaves ~20 comments on other creators' posts
  for (const user of createdUsers) {
    const numComments = randomInt(15, 25);
    for (let c = 0; c < numComments; c++) {
      const postId = pickRandom(allPostIds);

      await prisma.comment.create({
        data: {
          userId: user.id,
          postId,
          content: pickRandom(COMMENTS),
          createdAt: new Date(Date.now() - randomInt(0, 720) * 3600 * 1000),
        },
      });

      postCommentCounts[postId] = (postCommentCounts[postId] || 0) + 1;
      commentCount++;
    }
  }

  // Update comment counts on posts
  for (const [postId, count] of Object.entries(postCommentCounts)) {
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: count },
    });
  }

  console.log(`✅ Created ${commentCount} comments\n`);

  // ─── Create Likes ─────────────────────────────────────────────────────

  let likeCount = 0;
  const postLikeCounts: Record<string, number> = {};

  // Each creator likes ~30 posts from other creators
  for (const user of createdUsers) {
    const numLikes = randomInt(25, 40);
    const shuffledPosts = [...allPostIds].sort(() => Math.random() - 0.5);
    const likedPostIds = new Set<string>();

    for (let l = 0; l < numLikes && l < shuffledPosts.length; l++) {
      const postId = shuffledPosts[l];
      if (likedPostIds.has(postId)) continue;
      likedPostIds.add(postId);

      try {
        await prisma.like.create({
          data: {
            userId: user.id,
            postId,
          },
        });
        postLikeCounts[postId] = (postLikeCounts[postId] || 0) + 1;
        likeCount++;
      } catch {
        // Skip duplicate likes (unique constraint)
      }
    }
  }

  // Add actual inter-creator likes to the seeded like counts
  for (const [postId, count] of Object.entries(postLikeCounts)) {
    await prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: count } },
    });
  }

  console.log(`✅ Created ${likeCount} likes\n`);

  // ─── Create Test Users (Regular Users) ────────────────────────────────

  const testUsers = [];
  for (let i = 1; i <= 10; i++) {
    const loc = TORONTO_LOCATIONS[i % TORONTO_LOCATIONS.length];
    const testUser = await prisma.user.create({
      data: {
        privyUserId: `privy-testuser-${String(i).padStart(3, '0')}`,
        walletAddress: `TUSR${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx${i}`,
        email: `testuser${i}@momento.test`,
        username: `torontofan${i}`,
        displayName: `Toronto Fan ${i}`,
        bio: `Exploring the Toronto creator scene on Momento.`,
        avatarUrl: avatarUrl(`testuser-${i}`),
        role: 'USER',
        kycStatus: 'NONE',
        locationLat: jitter(loc.lat),
        locationLng: jitter(loc.lng),
        followerCount: 0,
        followingCount: randomInt(3, 10),
        postCount: 0,
      },
    });
    testUsers.push(testUser);
  }

  // Test users follow random creators
  for (const testUser of testUsers) {
    const numFollows = randomInt(3, 10);
    const shuffled = [...createdUsers].sort(() => Math.random() - 0.5);
    for (let f = 0; f < numFollows; f++) {
      try {
        await prisma.follow.create({
          data: {
            followerId: testUser.id,
            followingId: shuffled[f].id,
          },
        });
      } catch {
        // Skip duplicates
      }
    }
  }

  console.log(`✅ Created ${testUsers.length} test users\n`);

  // ─── Summary ──────────────────────────────────────────────────────────

  const totalUsers = await prisma.user.count();
  const totalPostsDb = await prisma.post.count();
  const totalFollows = await prisma.follow.count();
  const totalComments = await prisma.comment.count();
  const totalLikes = await prisma.like.count();
  const totalKyc = await prisma.kycRecord.count();

  console.log('═══════════════════════════════════════════════════');
  console.log('           MOMENTO SEED COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Users:      ${totalUsers} (${createdUsers.length} creators + ${testUsers.length} fans)`);
  console.log(`  Posts:      ${totalPostsDb} (${createdUsers.length * 10} text + ${createdUsers.length * 10} image + ${createdUsers.length * 10} video)`);
  console.log(`  Follows:    ${totalFollows}`);
  console.log(`  Comments:   ${totalComments}`);
  console.log(`  Likes:      ${totalLikes}`);
  console.log(`  KYC Records: ${totalKyc} (all SKIP_KYC dev bypass)`);
  console.log(`  Location:   Toronto, Ontario (15 neighborhoods)`);
  console.log('═══════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
