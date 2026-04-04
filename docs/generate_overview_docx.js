const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, PageOrientation,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageBreak, PageNumber, TabStopType, TabStopPosition,
} = require("docx");

const OUTPUT = "/Users/sangeet/Desktop/momento/docs/MOMENTO_TECHNICAL_OVERVIEW.docx";
const ROADMAP_PNG = "/Users/sangeet/Desktop/momento/docs/momento_roadmap.png";

// Colors
const DARK = "1E1E1E";
const BLUE = "1971C2";
const GREEN = "2B8A3E";
const ORANGE = "E8590C";
const PURPLE = "7048E8";
const GRAY = "495057";
const SUBTLE = "868E96";
const LIGHT_GRAY = "F1F3F5";
const WHITE = "FFFFFF";

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "DEE2E6" };
const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// Page dimensions: US Letter landscape with tight margins
// Letter = 12240 x 15840 DXA; landscape swaps internally
const PAGE_W = 15840; // long edge (landscape width)
const PAGE_H = 12240; // short edge (landscape height)
const MARGIN_LR = 720; // 0.5 inch
const MARGIN_TB = 540; // ~0.375 inch
const CONTENT_W = PAGE_W - 2 * MARGIN_LR; // 14400

// Tech table columns
const COL1 = 1800;  // Layer
const COL2 = 6600;  // Technology
const COL3 = 6000;  // Advantage
// Sum = 14400

const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "E9ECEF", type: ShadingType.CLEAR },
    borders: thinBorders,
    margins: cellMargins,
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, bold: true, size: 16, font: "Calibri", color: GRAY })],
    })],
  });
}

function techRow(color, layer, tech, advantage, isEven) {
  const bgFill = isEven ? "FAFAFA" : WHITE;
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL1, type: WidthType.DXA },
        shading: { fill: bgFill, type: ShadingType.CLEAR },
        borders: thinBorders,
        margins: cellMargins,
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: layer, bold: true, size: 17, font: "Calibri", color })],
        })],
      }),
      new TableCell({
        width: { size: COL2, type: WidthType.DXA },
        shading: { fill: bgFill, type: ShadingType.CLEAR },
        borders: thinBorders,
        margins: cellMargins,
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: tech, size: 17, font: "Calibri", color: DARK })],
        })],
      }),
      new TableCell({
        width: { size: COL3, type: WidthType.DXA },
        shading: { fill: bgFill, type: ShadingType.CLEAR },
        borders: thinBorders,
        margins: cellMargins,
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: advantage, italics: true, size: 16, font: "Calibri", color: SUBTLE })],
        })],
      }),
    ],
  });
}

function architectureHighlight(color, title, description) {
  return new Paragraph({
    spacing: { before: 100, after: 40 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color, space: 8 } },
    indent: { left: 200 },
    children: [
      new TextRun({ text: title, bold: true, size: 18, font: "Calibri", color }),
      new TextRun({ text: "  " }),
      new TextRun({ text: description, size: 16, font: "Calibri", color: GRAY }),
    ],
  });
}

async function main() {
  const roadmapImg = fs.readFileSync(ROADMAP_PNG);

  const techTableRows = [
    [BLUE, "Mobile", "Expo 54, React Native 0.81, Expo Router, React Query", "Single codebase iOS + Android; OTA updates; offline-first"],
    [GREEN, "Backend", "Next.js 14 on Vercel (serverless), Prisma ORM", "Auto-scaling; type-safe DB; 26 endpoints with auth + caching"],
    [GREEN, "Database", "PostgreSQL + PostGIS on Supabase (8 models)", "Sub-100ms geo-lookups; spatial feed with auto-expanding radius"],
    [ORANGE, "Caching", "Upstash Redis (serverless, location-quantized)", "~1km grid keys; 60s feed / 30s wallet / 300s profile TTLs"],
    [PURPLE, "Auth", "Privy (Google OAuth + Solana wallets) + Veriff KYC", "Zero-friction wallet on signup; regulatory-ready verification"],
    [ORANGE, "Blockchain", "Solana via Helius RPC + DAS; Jupiter v6; Meteora", "Sub-second finality; best-price routing; dynamic LP pools"],
    [GRAY, "Storage", "Supabase Storage + Expo Push (7 event types)", "Presigned uploads; fire-and-forget batched notifications"],
    [PURPLE, "AI (Planned)", "pgvector embeddings, cross-platform agents", "Semantic search; auto-distribute to IG/TikTok/X/YouTube"],
    [ORANGE, "DeFi (Planned)", "Kamino, Marinade (Solana) / Aave, Lido (ETH)", "Idle stablecoins earn yield; one-tap deposit/withdraw"],
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20 } },
      },
    },
    sections: [
      // ═══════════════ PAGE 1: TECHNICAL OVERVIEW ═══════════════
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
            margin: { top: MARGIN_TB, bottom: MARGIN_TB, left: MARGIN_LR, right: MARGIN_LR },
          },
        },
        headers: {
          default: new Header({
            children: [
              // Dark banner
              new Paragraph({
                spacing: { before: 0, after: 0 },
                shading: { fill: DARK, type: ShadingType.CLEAR },
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: " ", size: 8 })],
              }),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                shading: { fill: DARK, type: ShadingType.CLEAR },
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "MOMENTO \u2014 TECHNICAL OVERVIEW", bold: true, size: 44, font: "Calibri", color: WHITE })],
              }),
              new Paragraph({
                spacing: { before: 0, after: 80 },
                shading: { fill: DARK, type: ShadingType.CLEAR },
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "Creator Ecosystem  |  Blockchain Monetization  |  AI-Powered Distribution", size: 20, font: "Calibri", color: "ADB5BD" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { before: 60, after: 0 },
                border: { top: { style: BorderStyle.SINGLE, size: 1, color: "DEE2E6", space: 4 } },
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                  new TextRun({ text: "Solana: Jupiter v6 | Meteora | Raydium | Kamino | Metaplex | Helius | Birdeye", size: 13, font: "Calibri", color: SUBTLE }),
                  new TextRun({ text: "\tEthereum: Aave v3 | Lido | Polymarket | Maker DSR", size: 13, font: "Calibri", color: SUBTLE }),
                ],
              }),
              new Paragraph({
                spacing: { before: 20, after: 0 },
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                  new TextRun({ text: "Infra: Vercel | Supabase | Upstash Redis | Privy | Veriff | Expo EAS", size: 13, font: "Calibri", color: SUBTLE }),
                  new TextRun({ text: "\tmomento | 2026", size: 13, font: "Calibri", color: SUBTLE }),
                ],
              }),
            ],
          }),
        },
        children: [
          // PLATFORM OVERVIEW
          new Paragraph({
            spacing: { before: 60, after: 80 },
            children: [new TextRun({ text: "PLATFORM OVERVIEW", bold: true, size: 24, font: "Calibri", color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 160 },
            children: [
              new TextRun({
                text: "Momento is a location-based social platform where creators monetize through blockchain technology \u2014 from token launches and prediction markets to yield-bearing stablecoins. Built as a Turbo monorepo with shared types across a React Native mobile app, Next.js API, and marketing site.",
                size: 18, font: "Calibri", color: GRAY,
              }),
            ],
          }),

          // TECHNOLOGY STACK
          new Paragraph({
            spacing: { before: 0, after: 80 },
            children: [new TextRun({ text: "TECHNOLOGY STACK", bold: true, size: 24, font: "Calibri", color: DARK })],
          }),
          new Table({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [COL1, COL2, COL3],
            rows: [
              new TableRow({
                children: [
                  headerCell("LAYER", COL1),
                  headerCell("TECHNOLOGY", COL2),
                  headerCell("ADVANTAGE", COL3),
                ],
              }),
              ...techTableRows.map(([color, layer, tech, adv], i) => techRow(color, layer, tech, adv, i % 2 === 0)),
            ],
          }),

          // ARCHITECTURE HIGHLIGHTS
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: "ARCHITECTURE HIGHLIGHTS", bold: true, size: 24, font: "Calibri", color: DARK })],
          }),
          architectureHighlight(BLUE, "Smart Feed Ranking",
            "5 configurable sort modes with weighted scoring (recency, engagement, proximity, following). Algorithm transparency modal shows users exactly how their feed is ranked \u2014 building trust through openness."),
          architectureHighlight(GREEN, "Location-First Discovery",
            "PostGIS geography columns power spatial queries with auto-expanding radius. Location quantized to ~1km for cache efficiency. Users discover nearby creators organically \u2014 proximity is a first-class signal, not an afterthought."),
          architectureHighlight(PURPLE, "Blockchain-Native Wallets",
            "Every user has a real Solana wallet from first login via Privy \u2014 no seed phrases, no extensions. Balances update in real-time via Helius DAS. Portfolio snapshots enable historical charts. Ready for swaps and DeFi on day one."),
          architectureHighlight(ORANGE, "AI-Ready Architecture",
            "Feed ranking already uses configurable weight presets \u2014 the same pattern extends to ML personalization. Schema supports pgvector for semantic search. Modular hooks enable plug-in AI agents for cross-platform content distribution."),
        ],
      },

      // ═══════════════ PAGE 2: ROADMAP DIAGRAM ═══════════════
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 360, bottom: 360, left: 360, right: 360 },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 120 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "FEATURE-FOCUSED TECHNICAL ROADMAP", bold: true, size: 28, font: "Calibri", color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: "png",
                data: roadmapImg,
                transformation: { width: 960, height: 443 },
                altText: {
                  title: "Momento Technical Roadmap",
                  description: "5-phase roadmap: Done, Now, Next, Future, Horizon",
                  name: "roadmap",
                },
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUTPUT, buffer);
  console.log(`Word document created: ${OUTPUT}`);
}

main().catch(console.error);
