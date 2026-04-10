---
name: Momento Design System
description: Complete design system extracted from Figma mockups — colors, typography, spacing, component patterns, screen layouts
type: reference
---

# Momento Design System (from Figma Mockups — April 2026)

Design assets located at `/tmp/momento-design/` (extracted from Momento.zip).
Figma source available for high-fidelity assets if needed.

## Core Design Principles
- **Dark-mode only** — OLED-optimized pure black foundation
- **All-caps typography** throughout the entire app
- **Monospaced / terminal-style font** aesthetic (fintech/crypto vibe)
- **Minimal chrome** — content-first, very few borders/dividers
- **Green accent** (#00FF88) as the single primary color

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#000000` | Primary background (pure black) |
| `surface` | `#1A1A1A` | Cards, inputs, search bar |
| `surfaceGradientStart` | `#3A3A3C` | Upload cards, gradient cards |
| `surfaceGradientEnd` | `#1C1C1E` | Upload cards, gradient cards |
| `surfaceBorder` | `#2A2A2A` to `#333333` | Borders, dividers |
| `textPrimary` | `#FFFFFF` | Headings, names, primary labels |
| `textSecondary` | `#888888` | Column headers, stat labels, placeholders |
| `textTertiary` | `#555555` to `#666666` | Inactive tabs, subtle text, icons |
| `positive` / `primary` | `#00FF88` | Gains, chart lines, verified dot, accent |
| `negative` | `#FF4444` | Losses, negative % changes |
| `tabBar` | `#0A0A0A` | Bottom tab bar background |
| `buttonBorder` | `#AAAAAA` to `#CCCCCC` | Ghost button borders (hero/splash) |
| `modalOverlay` | `rgba(0,0,0,0.7)` | Modal backdrop |

## Typography

| Element | Size | Weight | Transform | Color |
|---------|------|--------|-----------|-------|
| Logo ("MOMENTO") | 36-40px | Thin/100 | UPPERCASE | White |
| Logo tagline | 14-16px | Thin/100 | UPPERCASE | #CCCCCC |
| Username / H1 | 24-28px | Bold/700 | UPPERCASE | White |
| Section header | 14-16px | Bold/600 | UPPERCASE | White |
| Creator name (profile) | 22-24px | Bold/700 | Title case | White |
| Stat values | 20-24px | Bold/700 | None | #00FF88 |
| Token ticker ($DEEL) | 28-32px | Bold/800 | UPPERCASE | White |
| Stat labels | 10-11px | Medium/500 | UPPERCASE | #888888 |
| Table column headers | 10px | Medium/500 | UPPERCASE | #888888 |
| Token list names | 13-14px | Bold/600 | UPPERCASE | #00FF00 |
| Body/caption text | 13-14px | Regular/400 | Sentence | #AAAAAA |
| Tab labels | 11-12px | Bold/600 | UPPERCASE | White/Gray |
| Button labels | 12-14px | Medium/500 | UPPERCASE | White |
| Chart axis labels | 8-9px | Regular/400 | UPPERCASE | #555555 |
| Ticker banner text | 20-22px | Bold/700 | UPPERCASE | Green/Red |

**Font family**: Monospaced/terminal-style (Space Mono, IBM Plex Mono, or similar).
**Display font** (splash): Ultra-thin geometric serif (Didot Light, Bodoni Thin, or similar).
**Letter-spacing**: 1-2px for body, 4-8px for display text.

## Spacing & Layout

| Element | Value |
|---------|-------|
| Screen horizontal padding | 16-20px |
| Card internal padding | 16px |
| Gap between stat cards | 8-12px |
| Section vertical spacing | 20-24px |
| List row height | 44-48px |
| Bottom tab bar height | 50-56px + safe area |
| Explore grid gap | 2-3px |
| Post card image radius | 8-12px |
| Card border radius | 12-16px |
| Button pill radius | 9999 (full) |
| Search bar radius | 20px |
| Avatar size (list) | 20-24px |

## Component Patterns

### Bottom Tab Bar
- 3 tabs: Home (house) | Explore (globe) | Profile (person)
- Icons only, no labels
- Active: white, Inactive: gray #666666
- Background: #0A0A0A, subtle top border

### Buttons
- **Primary pill**: Outlined, white 1px border, transparent fill, white text, full pill radius
- **Filled pill**: White background, dark text (used for SELL state)
- **Text-only action**: No border/background (BUY/SELL in tables)
- **Ghost button** (splash): Light gray border #CCCCCC, transparent, white text

### Cards
- Dark gradient rounded rectangles (#3A3A3C to #1C1C1E)
- 12-16px corner radius
- 1px border #2A2A2A
- Used for: stat boxes, swap inputs, upload areas

### Charts
- Single green line (#00FF88), ~2px stroke
- No fill/gradient underneath
- Black background, no grid lines
- X-axis: month abbreviations in gray
- Time range selector: 24H, 7D, 1M, 3M, 1Y (text tabs)

### Modals
- Centered card on darkened backdrop (rgba(0,0,0,0.7))
- Dark card background #1A1A1E
- Rounded corners 12-16px
- X close button top-right

### Token/Market Rows
- [Star] [Avatar 24px] [Ticker green] [24hr %] [Price USD] [BUY] [Chevron]
- Expandable: chevron rotates, reveals stats grid (1H, 7D, Volume, MCap)
- No visible row dividers

### Ticker Banners
- Horizontally auto-scrolling marquee
- Large monospaced text 20-22px
- Green for positive, red for negative
- Format: "AURA 2X NAAN 0.3X TASH 7X"

## Screen-Specific Design Notes

### Home Feed
- **Vertical scroll** with next-post peek from below (not horizontal paging)
- Header: "FOR YOU" | "CREATORS TO WATCH" segmented text tabs
- Creator info overlaid ON the image (not separate bar)
- Images: edge-to-edge, cover mode
- Minimal action bar: caption + like icon only
- Next post peeks ~60-80px with 12px rounded top corners
- No ticker banners, no logo in header

### User Account
- Username large centered uppercase
- WALLET pill button below name
- Two stat cards: 24H CHANGE + EARNINGS TO DATE
- Portfolio Performance line chart
- Token list with BUY/SELL text actions
- Settings: centered dark modal with text menu items (Transfers, Account Privacy, Block Permissions, Death Account)

### Creator Account (Own View)
- Top tabs: EDIT PROFILE | NEW POST | ACCOUNT
- Same layout as User Account in ACCOUNT tab
- Wallet/Swap interface at bottom of portfolio list

### Creator Profile (Public View)
- 3 sub-tabs: PROFILE | POSTS | TOKEN
- PROFILE: Full-bleed hero image, name + green verified dot, $TOKEN ticker, bio, masonry post grid
- POSTS: Social feed with avatar + handle + timestamp + caption + image
- TOKEN: $TICKER hero, BUY/SELL pills, price/24h/mcap stats, performance chart

### Edit Profile
- Inline editing (tap-to-edit text, no bordered inputs)
- Upload zone: gradient card with cloud icon, "ADD PROFILE PICTURE"
- Social links: vertical icon stack (YouTube, Instagram, X, Spotify, SoundCloud) on right edge
- KYC modal: centered card overlay for identity verification

### Market Page
- Search bar at top with back arrow
- Two ticker marquee rows (Trending + Creators to Watch)
- Tab filter: TRENDING | 24H GAINERS | TOP CREATORS
- Expandable token rows with stats grid on expand

### Explore Page
- Pure masonry image grid, 2 columns
- No text overlays on tiles
- Sharp corners on tiles (0px radius)
- 2-3px gap between tiles
- No header/search in this view

### New Post
- Tab: EDIT PROFILE | NEW POST | ACCOUNT
- "ADD TEXT" placeholder input
- Media upload zone (gradient card, cloud icon, "ADD MEDIA")
- With media: preview fills screen, red gradient header for caption, POST button at bottom

### Splash / Hero
- Minimal: logo + tagline + SIGN UP pill + OR LOGIN text
- Background slightly warmer black (#111111)
- Ultra-thin elegant typography for "MOMENTO"
- Tagline: "THE STOCK MARKET FOR CULTURE"

## Key Differences from Current Implementation

1. **Feed**: Design uses vertical scroll with peek, not horizontal paging
2. **Feed header**: "FOR YOU"/"CREATORS TO WATCH" tabs, not logo + algorithm button + bell
3. **Feed actions**: Minimal (caption + like only), not full action bar
4. **Creator info**: Overlaid on image, not separate header bar
5. **Ticker banners**: Not in feed (only on Market page)
6. **Explore**: Pure image masonry grid, no text/search visible
7. **Profile**: Inline editing style, gradient upload cards
8. **Tab bar**: 3 tabs (Home/Explore/Profile), not 4
9. **Market page**: Dedicated screen with expandable rows
10. **Typography**: All uppercase with wide letter-spacing throughout
