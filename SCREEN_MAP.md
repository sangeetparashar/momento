# Momento - Screen Map

Visual reference of all screens from Figma designs.

---

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        BOTTOM TABS                          │
├───────────────────┬───────────────────┬─────────────────────┤
│     🏠 Home       │    🌐 Explore     │     👤 Profile      │
│   (Feed + Tickers)│   (Discovery)     │   (Account/Wallet)  │
└───────────────────┴───────────────────┴─────────────────────┘
```

---

## 1. Login Screen

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│                                     │
│            M O M E N T O            │
│     THE STOCK MARKET FOR CULTURE    │
│                                     │
│                                     │
│         ┌─────────────────┐         │
│         │    SIGN UP      │         │
│         └─────────────────┘         │
│              OR LOGIN               │
│                                     │
└─────────────────────────────────────┘

Flow:
- Tap SIGN UP or LOGIN → Privy OAuth (Google/Apple)
- Privy creates embedded Solana wallet automatically
- On success → Home Screen
```

---

## 2. Home Screen (Tab 1)

```
┌─────────────────────────────────────┐
│ TRENDING                            │
│ ←DEEL +12.5% BELLE -3.2% NAAN +8.7%→│
├─────────────────────────────────────┤
│ CREATORS TO WATCH                   │
│ ←TASH +45.2% TEAH +18.9% TWSH +7.3%→│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │         [POST IMAGE]           │ │
│ │                                 │ │
│ ├─────────────────────────────────┤ │
│ │ Caption text here...           │ │
│ │ CreatorName 🟢    2h ago       │ │
│ │ ♡ 234  💬 12 comments          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │         [POST IMAGE]           │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│    🏠         🌐         👤         │
└─────────────────────────────────────┘

Features:
- Two scrolling ticker banners (tap → Market screen)
- Location-based post feed (no visible location UI)
- Pull to refresh
- Infinite scroll
```

---

## 3. Explore Screen (Tab 2)

```
┌─────────────────────────────────────┐
│   ┌─────────────┬─────────────┐     │
│   │  CREATORS   │    POSTS    │     │
│   └─────────────┴─────────────┘     │
├─────────────────────────────────────┤
│ ┌───────────┐ ┌───────────────────┐ │
│ │           │ │                   │ │
│ │  [IMG]    │ │      [IMG]        │ │
│ │           │ │                   │ │
│ ├───────────┤ │                   │ │
│ │           │ └───────────────────┘ │
│ │  [IMG]    │ ┌───────────────────┐ │
│ │           │ │      [IMG]        │ │
│ │           │ │                   │ │
│ └───────────┘ └───────────────────┘ │
│ ┌───────────┐ ┌───────────────────┐ │
│ │  [IMG]    │ │      [IMG]        │ │
│ └───────────┘ └───────────────────┘ │
├─────────────────────────────────────┤
│    🏠         🌐         👤         │
└─────────────────────────────────────┘

Features:
- Segmented toggle: CREATORS / POSTS
- Masonry grid layout (Pinterest-style)
- Variable height items
- Sorted by distance (closest first)
- Tap item → Creator Profile or Post Detail
```

---

## 4. Profile Screen (Tab 3)

### 4A. User Account View

```
┌─────────────────────────────────────┐
│ DisplayName                    ⚙️   │
├─────────────────────────────────────┤
│           ┌──────────┐              │
│           │  WALLET  │              │
│           └──────────┘              │
├─────────────────────────────────────┤
│ ┌─────────────────┬───────────────┐ │
│ │ 24H CHANGE      │ EARNINGS      │ │
│ │ +12.5%          │ $1,234.56     │ │
│ └─────────────────┴───────────────┘ │
├─────────────────────────────────────┤
│ PORTFOLIO PERFORMANCE               │
│ ┌─────────────────────────────────┐ │
│ │     📈 [CHART AREA]             │ │
│ └─────────────────────────────────┘ │
│ ┌───┬───┬───┬───┬───┐             │
│ │24H│7D │1M │3M │1Y │             │
│ └───┴───┴───┴───┴───┘             │
├─────────────────────────────────────┤
│ PORTFOLIO                           │
│ TOKEN    24HR     MARKET CAP        │
│ $DEEL    +12.5%   $1.2M      [BUY] │
│ $BELLE   -3.2%    $890K      [BUY] │
│ $NAAN    +8.7%    $2.1M      [BUY] │
├─────────────────────────────────────┤
│    🏠         🌐         👤         │
└─────────────────────────────────────┘

Features:
- Settings gear icon → Settings drawer
- WALLET button → Swap modal
- Stats are dummy data (Phase 2)
- Chart is dummy (Phase 2)
- Token list shows real holdings from Helius
- Prices/changes are dummy (Phase 2)
- BUY buttons → Coming Soon modal
```

### 4B. Creator Account View

```
┌─────────────────────────────────────┐
│ DisplayName                    ⚙️   │
├─────────────────────────────────────┤
│ EDIT PROFILE │ NEW POST │ ACCOUNT  │
├─────────────────────────────────────┤
│           ┌──────────┐              │
│           │  WALLET  │              │
│           └──────────┘              │
│                                     │
│         [Same as User view]         │
│                                     │
└─────────────────────────────────────┘

Additional tabs for creators:
- EDIT PROFILE → Edit Profile screen
- NEW POST → Create Post screen
- ACCOUNT → Portfolio view (same as user)
```

---

## 5. Creator Profile Screen (Public View)

```
┌─────────────────────────────────────┐
│ ←                                   │
├─────────────────────────────────────┤
│ PROFILE    │    POSTS    │   TOKEN  │
├─────────────────────────────────────┤
│                                     │
│   ┌─────────────────────────────┐   │
│   │                             │   │
│   │      [HERO IMAGE]           │   │
│   │                             │   │
│   └─────────────────────────────┘   │
│                                     │
│ [YT] [IG] [X] [SP] [SC] [TK] [WEB] │
│                                     │
│ CreatorName              $SYMBOL    │
│                                     │
│ Bio text here describing the        │
│ creator and their content...        │
│                                     │
│         ┌──────────────────┐        │
│         │       BUY        │        │
│         └──────────────────┘        │
│                                     │
└─────────────────────────────────────┘

Tabs:
- PROFILE: Hero image, social links, bio, buy button
- POSTS: Feed of creator's posts
- TOKEN: Price chart, stats (dummy)

BUY button → Coming Soon modal
```

---

## 6. Edit Profile Screen (Creator)

### 6A. Empty State (Before Verification)

```
┌─────────────────────────────────────┐
│ ←  Edit Profile                     │
├─────────────────────────────────────┤
│                                     │
│         ┌─────────────┐             │
│         │   [AVATAR]  │             │
│         │   + Upload  │             │
│         └─────────────┘             │
│                                     │
│  Add your YouTube                   │
│  Add your Instagram                 │
│  Add your Twitter/X                 │
│  Add your Spotify                   │
│  Add your SoundCloud                │
│  Add your TikTok                    │
│  Add your website                   │
│                                     │
│  Name: ___________________          │
│  Token Symbol: ___________          │
│  Bio: ____________________          │
│       ____________________          │
│                                     │
│  ┌─────────────────────────────┐    │
│  │         GET VERIFIED        │    │
│  │     (Start Veriff KYC)      │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 6B. Filled State (After Verification)

```
┌─────────────────────────────────────┐
│ ←  Edit Profile                     │
├─────────────────────────────────────┤
│                                     │
│         ┌─────────────┐             │
│         │  [AVATAR]   │             │
│         │   Deela     │             │
│         └─────────────┘             │
│                                     │
│  [YT✓] [IG✓] [X✓] [SP] [SC] [TK]   │
│                                     │
│  Recent Posts:                      │
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │     │ │     │ │     │           │
│  └─────┘ └─────┘ └─────┘           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │           SAVE              │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

---

## 7. Create Post Screen (Creator)

```
┌─────────────────────────────────────┐
│ ←  New Post                    POST │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │   Write your caption here...   │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │         [MEDIA PREVIEW]        │ │
│ │                                 │ │
│ │      Tap to add image/video    │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 📍 Location captured automatically  │
│                                     │
└─────────────────────────────────────┘

Features:
- Text input for caption
- Media picker (image or video)
- Location auto-captured from device
- POST button creates post
```

---

## 8. Market Screen

```
┌─────────────────────────────────────┐
│ ←  Market                           │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🔍 Search tokens...             │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ TRENDING                            │
│ ←DEEL +12.5% BELLE -3.2% NAAN +8.7%→│
├─────────────────────────────────────┤
│ CREATORS TO WATCH                   │
│ ←TASH +45.2% TEAH +18.9% TWSH +7.3%→│
├─────────────────────────────────────┤
│ TRENDING  │ 24H GAINERS │ TOP       │
├─────────────────────────────────────┤
│ #  TOKEN   24HR    MCAP             │
│ 1  $DEEL   +12.5%  $1.2M    [▼]    │
│    ├─ Price: $0.42                  │
│    └─ Vol 24h: $89K                 │
│ 2  $BELLE  -3.2%   $890K    [▼]    │
│ 3  $NAAN   +8.7%   $2.1M    [▼]    │
│ 4  $AURA   +24.1%  $450K    [▼]    │
│                                     │
└─────────────────────────────────────┘

Features:
- Search bar (Phase 2)
- Same ticker banners as home
- Tab filters for sorting
- Expandable token rows
- All data is dummy for MVP
```

---

## 9. Post Detail Screen

```
┌─────────────────────────────────────┐
│ ←                                   │
├─────────────────────────────────────┤
│ ┌───────┐ CreatorName               │
│ │AVATAR │ @username                 │
│ └───────┘ 2 hours ago               │
├─────────────────────────────────────┤
│                                     │
│                                     │
│           [POST MEDIA]              │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Caption text here...                │
├─────────────────────────────────────┤
│ ♡ 234 likes                         │
├─────────────────────────────────────┤
│ 💬 Comments (12)                    │
│                                     │
│ User1: Great post!                  │
│ User2: Love this 🔥                 │
│ User3: Amazing content              │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────┐ ➤  │
│ │ Add a comment...            │     │
│ └─────────────────────────────┘     │
└─────────────────────────────────────┘
```

---

## 10. Modals & Drawers

### Swap Modal (Bottom Sheet)

```
┌─────────────────────────────────────┐
│              ────                   │
│             WALLET                  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ SELL  $____    [SELECT TOKEN]  │ │
│ └─────────────────────────────────┘ │
│               🔄                    │
│ ┌─────────────────────────────────┐ │
│ │ BUY         [SELECT TOKEN]     │ │
│ └─────────────────────────────────┘ │
│                                     │
│         ┌──────────────┐            │
│         │     Swap     │            │
│         └──────────────┘            │
└─────────────────────────────────────┘

Swap button → Coming Soon modal
```

### Settings Drawer (Right Slide)

```
┌─────────────────────────────────────┐
│                    ┌───────────────┐│
│                    │ ⭐ FAVOURITES ││
│                    │ 🔒 PRIVACY    ││
│                    │ ⚙️ PERMISSIONS││
│                    │ ℹ️ ABOUT      ││
│                    │ 🗑️ DELETE     ││
│                    │ 🚪 SIGN OUT   ││
│                    └───────────────┘│
└─────────────────────────────────────┘
```

### Coming Soon Modal

```
┌─────────────────────────────────────┐
│                                     │
│               🚀                    │
│                                     │
│         Coming Soon!                │
│                                     │
│   Token Trading will be available   │
│   in a future update. Stay tuned!   │
│                                     │
│            ┌──────┐                 │
│            │  OK  │                 │
│            └──────┘                 │
│                                     │
└─────────────────────────────────────┘
```

---

## Screen Flow Diagram

```
                    ┌──────────┐
                    │  Login   │
                    └────┬─────┘
                         │
              ┌──────────┴──────────┐
              ▼                     │
        ┌──────────┐                │
        │   Home   │◄───────────────┤
        └────┬─────┘                │
             │ tap ticker           │
             ▼                      │
        ┌──────────┐                │
        │  Market  │                │
        └──────────┘                │
                                    │
        ┌──────────┐                │
        │  Explore │◄───────────────┤
        └────┬─────┘                │
             │ tap item             │
             ▼                      │
        ┌──────────┐                │
        │ Creator  │────────────────┤
        │ Profile  │                │
        └──────────┘                │
                                    │
        ┌──────────┐                │
        │ Profile  │◄───────────────┘
        └────┬─────┘
             │ (if creator)
     ┌───────┴───────┐
     ▼               ▼
┌──────────┐   ┌──────────┐
│   Edit   │   │  Create  │
│ Profile  │   │   Post   │
└──────────┘   └──────────┘
```

---

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| background | `#0D0D0D` | Screen backgrounds |
| surface | `#1A1A1A` | Cards, inputs |
| surfaceLight | `#2A2A2A` | Elevated elements |
| primary | `#00FF88` | Buttons, accents, token symbols |
| textPrimary | `#FFFFFF` | Main text |
| textSecondary | `#8A8A8A` | Captions, labels |
| success/green | `#00FF88` | Positive changes |
| error/red | `#FF4444` | Negative changes |
| warning | `#FFB800` | Warnings |

---

## Typography

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| h1 | 28px | Bold | Screen titles |
| h2 | 24px | Bold | Section headers |
| h3 | 18px | SemiBold | Card titles |
| body | 16px | Regular | Main content |
| bodySmall | 14px | Regular | Secondary content |
| caption | 12px | Regular | Timestamps, labels |
| label | 10px | SemiBold | Uppercase labels |
| mono | 14px | SemiBold | Token symbols, prices |
