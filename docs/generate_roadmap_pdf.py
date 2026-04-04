#!/usr/bin/env python3
"""Generate Momento Technical Roadmap PDF — 2-page investor document."""

from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas

OUTPUT = "/Users/sangeet/Desktop/momento/docs/MOMENTO_TECHNICAL_ROADMAP.pdf"

# Colors
BLUE = HexColor("#1971c2")
GREEN = HexColor("#2b8a3e")
ORANGE = HexColor("#e8590c")
PURPLE = HexColor("#7048e8")
GRAY = HexColor("#495057")
DARK = HexColor("#1e1e1e")
SUBTLE = HexColor("#868e96")
TEXT = HexColor("#343a40")


def draw_tech_table(c, x, y, w, rows):
    """Draw a formatted table with colored label column, tech column, and advantage column."""
    row_h = 28
    col1_w = 100  # label
    col2_w = (w - col1_w) * 0.52  # tech
    col3_w = (w - col1_w) * 0.48  # advantage

    # Header row
    c.setFillColor(HexColor("#f1f3f5"))
    c.rect(x, y - 16, w, 16, fill=1, stroke=0)
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 8, y - 12, "LAYER")
    c.drawString(x + col1_w + 8, y - 12, "TECHNOLOGY")
    c.drawString(x + col1_w + col2_w + 8, y - 12, "ADVANTAGE")
    y -= 16

    # Divider
    c.setStrokeColor(HexColor("#dee2e6"))
    c.setLineWidth(0.5)
    c.line(x, y, x + w, y)

    for i, (color, label, tech, advantage) in enumerate(rows):
        # Alternating row bg
        if i % 2 == 0:
            c.setFillColor(HexColor("#fafafa"))
            c.rect(x, y - row_h, w, row_h, fill=1, stroke=0)

        # Colored accent dot
        c.setFillColor(color)
        c.circle(x + 12, y - row_h / 2, 3.5, fill=1, stroke=0)

        # Label
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(color)
        c.drawString(x + 22, y - 11, label)

        # Tech
        c.setFont("Helvetica", 8)
        c.setFillColor(DARK)
        c.drawString(x + col1_w + 8, y - 11, tech)

        # Advantage
        c.setFont("Helvetica-Oblique", 7.5)
        c.setFillColor(SUBTLE)
        c.drawString(x + col1_w + col2_w + 8, y - 11, advantage)

        # Second line of advantage if needed (check for \n)
        # Bottom divider
        c.setStrokeColor(HexColor("#e9ecef"))
        c.setLineWidth(0.3)
        c.line(x, y - row_h, x + w, y - row_h)

        y -= row_h

    # Bottom border
    c.setStrokeColor(HexColor("#dee2e6"))
    c.setLineWidth(0.5)
    c.line(x, y, x + w, y)

    return y


def draw_page1(c, w, h):
    """Page 1: Technical overview — no prices, clean layout."""
    c.setFillColor(white)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Header
    c.setFillColor(DARK)
    c.rect(0, h - 70, w, 70, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(w / 2, h - 42, "MOMENTO — TECHNICAL OVERVIEW")
    c.setFont("Helvetica", 11)
    c.setFillColor(HexColor("#adb5bd"))
    c.drawCentredString(w / 2, h - 60, "Creator Ecosystem  |  Blockchain Monetization  |  AI-Powered Distribution")

    y = h - 92

    # ── OVERVIEW ──
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(45, y, "PLATFORM OVERVIEW")
    y -= 15
    c.setFont("Helvetica", 8.5)
    c.setFillColor(TEXT)
    for line in [
        "Momento is a location-based social platform where creators monetize through blockchain technology. Users discover creators",
        "nearby, follow their journey, and invest in their growth through creator tokens, prediction markets, and yield-bearing strategies.",
        "The platform uses AI to help creators distribute content across all social platforms and predict post performance before publishing.",
        "Built as a Turbo monorepo with a shared type system across a mobile app, API backend, and marketing site.",
    ]:
        c.drawString(45, y, line)
        y -= 11
    y -= 6

    # ── TECH STACK ──
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(45, y, "TECHNOLOGY STACK")
    y -= 6

    tech_rows = [
        (BLUE, "Mobile", "Expo 54, React Native 0.81, Expo Router, React Query", "Single codebase iOS + Android; OTA updates; offline-first"),
        (GREEN, "Backend", "Next.js 14 on Vercel (serverless), Prisma ORM", "Auto-scaling; type-safe DB; 26 endpoints with auth + caching"),
        (GREEN, "Database", "PostgreSQL + PostGIS on Supabase (8 models)", "Sub-100ms geo-lookups; spatial feed with auto-expanding radius"),
        (ORANGE, "Caching", "Upstash Redis (serverless, location-quantized)", "~1km grid keys; 60s feed / 30s wallet / 300s profile TTLs"),
        (PURPLE, "Auth", "Privy (Google OAuth + Solana wallets) + Veriff KYC", "Zero-friction wallet on signup; regulatory-ready verification"),
        (ORANGE, "Blockchain", "Solana via Helius RPC + DAS; Jupiter v6; Meteora", "Sub-second finality; best-price routing; dynamic LP pools"),
        (GRAY, "Storage", "Supabase Storage + Expo Push (7 event types)", "Presigned uploads; fire-and-forget batched notifications"),
        (PURPLE, "AI (Planned)", "pgvector embeddings, cross-platform agents", "Semantic search; auto-distribute to IG/TikTok/X/YouTube"),
        (ORANGE, "DeFi (Planned)", "Kamino, Marinade (Solana) / Aave, Lido (ETH)", "Idle stablecoins earn yield; one-tap deposit/withdraw"),
    ]
    y = draw_tech_table(c, 45, y, w - 90, tech_rows)
    y -= 8

    # ── ARCHITECTURE HIGHLIGHTS ──
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(45, y, "ARCHITECTURE HIGHLIGHTS")
    y -= 4

    highlights = [
        (BLUE, "Smart Feed Ranking",
         "5 configurable sort modes with weighted scoring (recency, engagement, proximity, following). Algorithm transparency",
         "modal shows users exactly how their feed is ranked — building trust through openness."),
        (GREEN, "Location-First Discovery",
         "PostGIS geography columns power spatial queries with auto-expanding radius. Location quantized to ~1km for cache",
         "efficiency. Users discover nearby creators organically — proximity is a first-class signal, not an afterthought."),
        (PURPLE, "Blockchain-Native Wallets",
         "Every user has a real Solana wallet from first login via Privy — no seed phrases, no extensions. Balances update in",
         "real-time via Helius DAS. Portfolio snapshots enable historical charts. Ready for swaps and DeFi on day one."),
        (ORANGE, "AI-Ready Architecture",
         "Feed ranking already uses configurable weight presets — the same pattern extends to ML personalization. Schema supports",
         "pgvector for semantic search. Modular hooks enable plug-in AI agents for cross-platform content distribution."),
    ]

    for color, title, l1, l2 in highlights:
        y -= 14
        c.setFillColor(color)
        c.rect(55, y + 1, 3, 10, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(64, y + 1, title)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(TEXT)
        c.drawString(64, y - 9, l1)
        c.drawString(64, y - 18, l2)
        y -= 22

    y -= 6

    # ── FOOTER ──
    c.setFillColor(HexColor("#dee2e6"))
    c.line(45, y, w - 45, y)
    y -= 11
    c.setFont("Helvetica", 7)
    c.setFillColor(SUBTLE)
    c.drawString(45, y, "Solana: Jupiter v6 | Meteora | Raydium | Kamino | Metaplex | Helius | Birdeye")
    c.drawRightString(w - 45, y, "Ethereum: Aave v3 | Lido | Polymarket | Maker DSR")
    y -= 10
    c.drawString(45, y, "Infra: Vercel | Supabase | Upstash Redis | Privy | Veriff | Expo EAS")
    c.drawRightString(w - 45, y, "momento | 2026")


def draw_page2(c, w, h):
    """Page 2: Embed the SVG roadmap diagram."""
    import cairosvg
    from reportlab.lib.utils import ImageReader
    import io

    c.setFillColor(white)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    svg_path = "/Users/sangeet/Desktop/momento/docs/moment_roadmap.svg"
    png_data = cairosvg.svg2png(url=svg_path, output_width=3200, output_height=1478)
    img = ImageReader(io.BytesIO(png_data))

    margin = 20
    avail_w = w - 2 * margin
    avail_h = h - 2 * margin
    scale = min(avail_w / 3200, avail_h / 1478)
    draw_w = 3200 * scale
    draw_h = 1478 * scale
    x = (w - draw_w) / 2
    y = (h - draw_h) / 2

    c.drawImage(img, x, y, draw_w, draw_h, preserveAspectRatio=True)


def main():
    w, h = landscape(letter)
    c = canvas.Canvas(OUTPUT, pagesize=landscape(letter))
    draw_page1(c, w, h)
    c.showPage()
    draw_page2(c, w, h)
    c.showPage()
    c.save()
    print(f"PDF created: {OUTPUT}")


if __name__ == "__main__":
    main()
