import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// On Vercel, the project directory is read-only. Use /tmp for ephemeral storage.
// Locally, use the project's data/ directory for persistence across restarts.
const IS_VERCEL = !!process.env.VERCEL;
const DATA_FILE = IS_VERCEL
  ? path.join(os.tmpdir(), 'momento-waitlist.json')
  : path.join(process.cwd(), 'data', 'waitlist.json');

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Read existing entries (best-effort — /tmp is ephemeral on Vercel)
    let entries: Array<{ email: string; timestamp: string }> = [];
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      entries = JSON.parse(data);
    } catch {
      // File doesn't exist yet — that's fine
    }

    // Check for duplicates (within current warm instance on Vercel)
    if (entries.some((e) => e.email === normalizedEmail)) {
      return NextResponse.json({
        success: true,
        message: "You're already on the list!",
      });
    }

    // Append new entry
    entries.push({
      email: normalizedEmail,
      timestamp: new Date().toISOString(),
    });

    // Write to storage
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2));

    // Always log — Vercel captures function logs in the dashboard,
    // so this serves as the durable record until a proper DB is wired up.
    console.log(
      `[WAITLIST] New signup: ${normalizedEmail} at ${new Date().toISOString()} | Total: ${entries.length}`
    );

    return NextResponse.json({
      success: true,
      message: "You're on the list!",
    });
  } catch (err) {
    console.error('[WAITLIST] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
