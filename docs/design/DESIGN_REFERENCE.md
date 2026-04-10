# Momento Design Reference

This document is the single source of truth for UI implementation across the mobile app and landing page. All screen implementations should match the Figma mockups stored in `docs/design/screens/`.

## Screen Assets

| Screen | File | Description |
|--------|------|-------------|
| `home-feed.png` | Home feed — full-bleed image, "FOR YOU" / "CREATORS TO WATCH" tabs, caption + like overlay, next-post peek |
| `home-feed-2.png` | Home feed variant — scrolled state showing next post peek |
| `home-feed-3.png` | Home feed — different creator (Shanti S), editorial photography |
| `explore.png` | Explore — pure masonry image grid, 2 columns, no text overlays, sharp corners |
| `creator-profile.png` | Creator profile — PROFILE tab, full-bleed hero image, name + green verified dot, $DEEL token, bio, masonry post grid |
| `creator-posts.png` | Creator profile — POSTS tab, social feed with avatar + handle + timestamp + caption + image |
| `creator-token.png` | Creator profile — TOKEN tab, $DEEL hero, BUY/SELL pills, price/24h/mcap stats, performance chart |
| `creator-account-1.png` | Creator own account — ACCOUNT tab, stats cards, portfolio chart, token list |
| `creator-account-2.png` | Creator own account — scrolled, token list + wallet swap interface |
| `user-account-1.png` | User account — username, wallet pill, stats, portfolio chart, token list |
| `user-account-2.jpg` | User account — scrolled, token list + wallet swap |
| `edit-profile.png` | Edit profile — gradient upload card, name/$TOKEN/bio fields, social icons |
| `edit-profile-links.png` | Edit profile — social links expanded with dismiss X |
| `edit-portfolio-full.png` | Full creator portfolio — hero image, name + verified dot, bio, masonry grid |
| `market.png` | Market page — search bar, ticker rows, token table with BUY/chevron |
| `market-expanded.png` | Market page — expanded token row showing 1H/7D/Volume/MCap stats |
| `new-post.png` | New post — empty state, ADD TEXT + ADD MEDIA upload zone |
| `new-post-media.png` | New post — with media uploaded, POST button at bottom |
| `settings.png` | Settings overlay — centered dark modal with menu items |
| `splash.png` | Splash/hero — "MOMENTO" thin font, "THE STOCK MARKET FOR CULTURE", SIGN UP pill |

---

## Design System

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#000000` | Primary background (pure black in designs) |
| `surface` | `#1A1A1A` | Cards, inputs, elevated surfaces |
| `surfaceGradientStart` | `#3A3A3C` | Upload cards, gradient cards |
| `surfaceGradientEnd` | `#1C1C1E` | Upload cards, gradient cards |
| `surfaceBorder` | `#2A2A2A` | Borders, dividers, stat card outlines |
| `textPrimary` | `#FFFFFF` | Headings, names, primary labels |
| `textSecondary` | `#888888` | Stat labels, column headers, bio text |
| `textTertiary` | `#555555` | Inactive tabs, chart axis labels, subtle text |
| `primary` | `#00FF88` | Chart lines, verified dot, stat values, accent |
| `negative` | `#FF4444` | Losses, negative % changes |
| `tabBarBg` | `#0A0A0A` | Bottom tab bar background |

### Typography

All text in the Figma designs uses **uppercase** with wide letter-spacing. The font appears to be a **monospaced/terminal** style (Space Mono, IBM Plex Mono, or similar).

| Element | Size | Weight | Transform | Tracking |
|---------|------|--------|-----------|----------|
| Username (ANDREW) | 24-28px | Bold/700 | UPPERCASE | Wide |
| Creator name (deela) | 22-24px | Bold/700 | Mixed case | Normal |
| Section header (PORTFOLIO) | 14-16px | Bold/600 | UPPERCASE | Wide |
| Stat values (0.9%, 12.2K) | 20-24px | Bold/700 | None | Normal |
| Stat labels (24H CHANGE) | 10-11px | Medium/500 | UPPERCASE | Wide |
| Table headers (TOKEN, 24H) | 10px | Medium/500 | UPPERCASE | Wide |
| Token tickers (DEEL) | 13-14px | Bold/600 | UPPERCASE | Normal |
| Body/caption | 12-13px | Regular/400 | Sentence | Normal |
| Tab labels | 11-12px | Bold/600 | UPPERCASE | Wide |
| BUY/SELL actions | 12px | Medium/500 | UPPERCASE | Normal |
| Chart axis labels | 8-9px | Regular/400 | UPPERCASE | Normal |

### Spacing

| Element | Value |
|---------|-------|
| Screen horizontal padding | 16-20px |
| Card internal padding | 16px |
| Gap between stat cards | 8-12px |
| Section vertical spacing | 20-24px |
| List row height | 44-48px |
| Bottom tab bar height | 50-56px + safe area |
| Explore grid gap | 2-3px |
| Post grid gap (profile) | 2-4px |
| Card border radius | 12-16px |
| Button pill radius | 9999 (full) |

### Bottom Tab Bar

- **3 tabs**: Home (house) | Explore (globe/search) | Profile (person)
- **Icons only** — no labels
- **Active**: white `#FFFFFF`
- **Inactive**: gray `#666666`
- **Background**: `#0A0A0A`, subtle top border

### Buttons

- **Outlined pill**: White 1px border, transparent fill, white text, full pill radius
- **Filled pill** (SELL): White background, dark text
- **Text-only action**: No border/background (BUY/SELL in token tables)
- **Primary CTA**: `#00FF88` background, black text

### Charts

- Single green line `#00FF88`, ~2px stroke, no fill underneath
- Black background, no grid lines
- X-axis: month abbreviations in gray
- Time range selector: 24H, 7D, 1M, 3M, 1Y (text tabs)

### Verified Creator Badge

- Solid green circle `#00FF88`, 8px diameter, inline right of creator name

---

## Screen-by-Screen Implementation Guide

### Home Feed (Priority: HIGH)

**Current app**: Horizontal paging, MomentoLogo center + algo button + bell, ticker banners, full action bar (like, comment, share, bookmark, buy)

**Figma design**: 
- Vertical scroll with next-post peek (~60-80px, rounded top corners 12px)
- Header: "FOR YOU" / "CREATORS TO WATCH" segmented text tabs (no logo, no bell)
- Creator info overlaid ON the image (not separate bar)
- Images: edge-to-edge, cover mode
- Minimal action bar: caption + like icon only at bottom
- No ticker banners in feed

**Key changes needed**:
1. Replace horizontal paging → vertical scroll with snap + peek
2. Replace header (logo/algo/bell → "FOR YOU"/"CREATORS TO WATCH" tabs)
3. Remove ticker banners from feed
4. Move creator info overlay onto image
5. Simplify action bar (remove comment/share/bookmark/buy from main view)
6. Add next-post peek with rounded top corners

### Explore Page (Priority: HIGH)

**Current app**: "Discover Nearby Creators" header, search bar, CREATORS/POSTS toggle, masonry grid with text overlays, creator cards with stats

**Figma design**:
- Pure masonry image grid, 2 columns
- No text overlays on tiles
- Sharp corners on tiles (0px radius, not 16px)
- 2-3px gap between tiles (not 8px)
- No header/search visible in grid view
- No category pills

**Key changes needed**:
1. Remove text overlays from masonry grid tiles
2. Reduce tile corner radius from 16px → 0px
3. Reduce grid gap from 8px → 2-3px
4. Hide/minimize header when scrolling
5. Remove category pills

### Creator Profile (Priority: HIGH)

**Current app**: Banner (180px) + avatar (-40px overlap) + social links + name + token + stats row + follow/buy buttons + posts grid

**Figma design**:
- 3 sub-tabs: PROFILE | POSTS | TOKEN (at top, below back button)
- PROFILE tab: Full-bleed hero image (~70% of screen), name + green verified dot overlaid at bottom, $TOKEN ticker, bio, masonry post grid
- POSTS tab: Social feed with avatar + handle + timestamp + caption + image
- TOKEN tab: $TICKER hero, BUY/SELL pills, price/24h/mcap stats, performance chart

**Key changes needed**:
1. Add 3-tab navigation (PROFILE/POSTS/TOKEN) at top
2. Replace banner+avatar with full-bleed hero image
3. Overlay name + verified dot on bottom of hero image
4. Add TOKEN tab with price stats and chart
5. Add POSTS tab with feed-style layout

---

## Current App vs Design Comparison

| Element | Current App | Figma Design | Gap |
|---------|------------|--------------|-----|
| Feed direction | Horizontal paging | Vertical scroll + peek | Major |
| Feed header | Logo + algo + bell | "FOR YOU"/"CREATORS TO WATCH" tabs | Major |
| Feed actions | 5 icons + Buy button | Caption + like only | Major |
| Creator info | Separate header bar | Overlaid on image | Medium |
| Ticker in feed | Yes (2 banners) | No | Medium |
| Explore grid | 16px radius, 8px gap, text overlays | 0px radius, 2px gap, no overlays | Medium |
| Explore header | Title + search + toggle | Minimal/hidden | Medium |
| Creator profile | Banner + avatar + flat layout | Full-bleed hero + 3 tabs | Major |
| Tab bar | 3 tabs with labels hidden | 3 tabs, icons only, no labels | Minor (already close) |
| Typography | System sans-serif | Monospaced, all-caps | Medium |
| Background | #0D0D0D | #000000 | Minor |
