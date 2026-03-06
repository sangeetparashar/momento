# Momento Landing Page — Agent Build Spec

## Purpose
Build a single-page waitlist landing page for **Momento** — a mobile app where fans invest in creators they believe in. The goal is to capture email signups and build anticipation before launch. This is a PRE-LAUNCH page — the product is not live yet.

## Brand Identity
- **Name**: Momento
- **Tagline**: "The Stock Market for Culture"
- **Domain**: momento.io
- **Tone**: Bold, confident, exclusive. Think Robinhood meets Instagram. Crypto-native but accessible. Not jargon-heavy — speak to fans and creators, not VCs.
- **Audience**: Gen Z / Millennial creator-economy fans who already follow creators obsessively. They want to BE part of the culture, not just watch it.

## Design System

### Colors
```css
--bg:              #0D0D0D;     /* Near-black background */
--bg-secondary:    #1A1A1A;     /* Card/section backgrounds */
--bg-tertiary:     #242424;     /* Elevated surfaces */
--primary:         #00FF88;     /* Neon green accent — used sparingly for CTAs and highlights */
--primary-muted:   rgba(0, 255, 136, 0.15); /* Green glow/tint */
--text-primary:    #FFFFFF;     /* Headings */
--text-secondary:  #8A8A8A;     /* Body copy */
--text-tertiary:   #555555;     /* Captions */
--border:          #2A2A2A;     /* Subtle dividers */
--error:           #FF4444;     /* Market red */
--success:         #00FF88;     /* Market green (same as primary) */
```

### Typography
- **Font**: `Inter` (Google Fonts) for body, system monospace for ticker/numbers
- **Headings**: Bold/Extra-bold (700-800), tight letter-spacing (-0.5 to -1px)
- **Body**: Regular (400), 16-18px, relaxed line-height (1.6)
- **Labels**: Uppercase, 12px, 600 weight, wide letter-spacing (2-4px)
- **Numbers/Stats**: Monospace, bold

### Visual Language
- Dark, immersive backgrounds
- Subtle grid/noise texture overlay on hero (optional)
- Green glow effects (box-shadow with --primary-muted) on CTAs and cards
- Cards with 1px --border borders and subtle background gradient
- Full-bleed imagery — use creator photography aesthetic (fashion, music, art)
- Smooth scroll-triggered animations (anime.js)

## Tech Stack
- **Framework**: Next.js 14 (App Router) in the monorepo at `apps/landing`
- **Styling**: Tailwind CSS 3 with custom theme matching the design tokens above
- **Animations**: `animejs` (anime.js v3) for scroll-triggered reveals, ticker animation, and micro-interactions
- **Deployment**: Vercel (alongside the API)
- **Email Capture**: Simple form that POSTs to an API route (`/api/waitlist`) which stores emails in a JSON file for now (can be swapped to a database later)

## Package.json
```json
{
  "name": "@momento/landing",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.29",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "animejs": "^3.2.2"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.4.0",
    "typescript": "^5"
  }
}
```

## Page Sections (Top to Bottom)

### 1. HERO
Full viewport height. Dark background.

**Layout:**
- Navigation bar: "MOMENTO" logo text (left), "Join Waitlist" button (right, ghost style with green border)
- Center content:
  - Large heading: **"The Stock Market for Culture"** (48-64px, white, extra-bold)
  - Subheading: **"Invest in the creators you believe in. Trade in real time. Profit alongside the culture you helped create."** (18-20px, text-secondary, max-width 600px)
  - CTA: Email input + "Join the Waitlist" button (green background, dark text, rounded-full, side by side on desktop, stacked on mobile)
  - Below CTA: "Join 1,000+ fans already waiting" (or similar social proof line, text-tertiary, small)

**Animations (anime.js):**
- Title fades in + slides up from 30px below (duration: 800ms, easing: 'easeOutExpo')
- Subtitle fades in after 200ms delay
- CTA fades in after 400ms delay
- Optional: subtle green particle/glow effect behind the heading

### 2. TICKER BANNER
A horizontal scrolling ticker that mimics the app's live market feel.

**Content:** Mock token symbols scrolling left infinitely:
```
$DEEL +17% · $EMMA +8.4% · $RICK -2.1% · $NASH +23% · $BELLE +5.6% · $CODY -1.3% ...
```

**Style:**
- Full-width, dark card background (#1A1A1A)
- Green for positive, red for negative percentages
- CSS animation (infinite scroll) or anime.js timeline
- Monospace font for the ticker text

### 3. HOW IT WORKS
3-step or 4-step horizontal cards.

**Steps:**
1. **Creators Launch** — "Your favorite creators mint their own token. No crypto knowledge needed."
2. **Fans Buy In** — "Buy tokens like stocks. Back creators before they break through."
3. **Markets Move** — "Tokens trade live, driven by cultural momentum."
4. **Everyone Profits** — "Creators, fans, and platform all grow together."

**Layout:** 4 cards in a row (desktop), stacked (mobile). Each card has:
- Step number in a circle (green border, green text)
- Title (white, bold, 20px)
- Description (text-secondary, 15px)
- Subtle green glow border on hover

**Animations:**
- Cards stagger in from below as user scrolls (anime.js `stagger` with `translateY: [40, 0]`, `opacity: [0, 1]`)
- Use `IntersectionObserver` to trigger when section enters viewport

### 4. WHY MOMENTO (Value Props)
Full-width section with alternating layout.

**Content (3 items, each with heading + paragraph):**
1. **"Fans Want Ownership"** — A generation raised on social media wants more than likes and follows. They want a stake in the culture they help build.
2. **"Creators Deserve More"** — Creators are tired of building audiences that make platforms rich. Momento gives them a direct line to fan investment.
3. **"The Infrastructure Is Ready"** — The technology to power real consumer-grade financial products has matured. Momento is the product built on top of it.

**Layout:** Each value prop is a wide card with large heading (left or alternating) and body text. Maybe a subtle icon or illustration placeholder.

**Animations:**
- Each card slides in from left/right alternately on scroll
- Fade + translate: `translateX: [-50, 0]` for left, `[50, 0]` for right

### 5. APP PREVIEW
A centered mockup section showing the app in action.

**Content:**
- Section heading: "Built for the Culture" or "See It In Action"
- Display 2-3 app screenshots in a phone mockup frame (or just the screenshots overlapping with a slight rotation)
- Brief caption below each: "Live Feed", "Creator Tokens", "Portfolio"

**Note:** Use placeholder phone frames. The actual screenshots from Figma can be dropped in later. For now, use styled div placeholders that match the app's dark UI with green accents.

**Animations:**
- Phone mockups float in with a 3D perspective tilt (anime.js `rotateY` from ±15deg to 0)

### 6. SOCIAL PROOF / TEAM (Optional, keep minimal)
- Simple line: "Built by operators from the creator economy, fintech, and Web3."
- Three name cards (minimal): Julian, Andrew, Carly — name + one-line title only
- No photos needed for now

### 7. FINAL CTA
Full-width section, dark with green glow.

**Content:**
- Heading: **"Be First. Own the Culture."**
- Subheading: "Join the waitlist for early access to Momento."
- Same email input + button as hero (reuse the component)
- Below: Links to Twitter/X and Instagram (icon links, text-tertiary)

**Animations:**
- Heading scales up from 0.9 to 1.0 + opacity

### 8. FOOTER
Minimal footer.
- "MOMENTO" logo text (left)
- "The Stock Market for Culture" (text-tertiary)
- Copyright: "2025 Momento Inc. All rights reserved."
- Legal links: Privacy Policy, Terms of Service (can be # placeholder links)

## API Route: `/api/waitlist`

### POST `/api/waitlist`
Accepts `{ email: string }` in the request body. Validates the email format. Stores it in a local JSON file (`data/waitlist.json`) as an array of `{ email, timestamp }` objects. Returns `{ success: true, message: "You're on the list!" }`.

This is intentionally simple — can be swapped to Supabase/database later.

```typescript
// apps/landing/app/api/waitlist/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'waitlist.json');

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 });
  }

  // Read existing
  let entries = [];
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    entries = JSON.parse(data);
  } catch { /* file doesn't exist yet */ }

  // Check duplicate
  if (entries.some((e: any) => e.email === email.toLowerCase())) {
    return NextResponse.json({ success: true, message: "You're already on the list!" });
  }

  // Append
  entries.push({ email: email.toLowerCase(), timestamp: new Date().toISOString() });
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2));

  return NextResponse.json({ success: true, message: "You're on the list!" });
}
```

## Responsive Breakpoints
- **Mobile**: < 768px (single column, stacked layout)
- **Tablet**: 768px - 1024px (2-column for cards)
- **Desktop**: > 1024px (full layout, side-by-side hero elements)

## Performance Requirements
- Lighthouse score > 90
- No layout shift
- Images lazy-loaded
- Fonts preloaded
- anime.js tree-shaken or loaded async

## File Structure
```
apps/landing/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── data/
│   └── waitlist.json          # Created at runtime
├── public/
│   └── (screenshots go here later)
├── app/
│   ├── layout.tsx             # Root layout, Inter font, metadata
│   ├── page.tsx               # Main landing page (all sections)
│   ├── globals.css            # Tailwind imports + custom styles
│   └── api/
│       └── waitlist/
│           └── route.ts       # Email capture endpoint
└── components/
    ├── Navbar.tsx
    ├── Hero.tsx
    ├── TickerBanner.tsx
    ├── HowItWorks.tsx
    ├── WhyMomento.tsx
    ├── AppPreview.tsx
    ├── Team.tsx
    ├── FinalCta.tsx
    ├── Footer.tsx
    └── WaitlistForm.tsx       # Reusable email input + button
```

## Key Reminders for the Building Agent
1. Use `"use client"` directive on components that use anime.js or state (React hooks)
2. anime.js should be dynamically imported: `const anime = (await import('animejs')).default`
3. Use `IntersectionObserver` in a `useEffect` to trigger scroll animations
4. The waitlist form needs `useState` for email input and submission state
5. Add proper `<meta>` tags: title, description, OG image placeholder, Twitter card
6. The ticker banner should use CSS `@keyframes` for infinite scroll (more performant than JS for this)
7. Make sure Tailwind config extends the brand colors
8. All text content should be hardcoded (no CMS needed)
9. DO NOT reference any specific numbers, financial figures, or fundraising details from the exec summary
10. DO NOT mention "Pre-Seed", "SAFE", "$250K", or any investor-facing language
11. The tone is consumer-facing: exciting, aspirational, culture-driven
