# Momento — Claude Instructions

## Design System

**All UI work must reference the design system before implementation.**

- **Design reference**: `docs/design/DESIGN_REFERENCE.md` — screen-by-screen specs, colors, typography, spacing, gap analysis
- **Figma screenshots**: `docs/design/screens/` — 20 annotated screen exports from Figma
- **Design tokens (landing)**: `docs/DESIGN_SYSTEM.md` — landing page design system

### Quick Reference

- **Background**: `#000000` (pure black)
- **Surface**: `#1A1A1A`
- **Primary accent**: `#00FF88` (green)
- **Text primary**: `#FFFFFF`
- **Text secondary**: `#888888`
- **Text tertiary**: `#555555`
- **Border**: `#2A2A2A`
- **Typography**: All-caps monospaced throughout, wide letter-spacing
- **Tab bar**: 3 tabs (Home/Explore/Profile), icons only, no labels
- **Verified badge**: Solid green `#00FF88` circle, 8px, inline with name

### When modifying mobile UI:

1. Open the relevant screen image in `docs/design/screens/`
2. Compare current implementation against the Figma screenshot
3. Match layout, spacing, typography, and colors as closely as possible
4. Refer to `docs/design/DESIGN_REFERENCE.md` for the gap analysis between current implementation and design
