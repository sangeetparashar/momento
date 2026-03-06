import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'waitlist.json');

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

    // Read existing entries
    let entries: Array<{ email: string; timestamp: string }> = [];
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      entries = JSON.parse(data);
    } catch {
      // File doesn't exist yet — that's fine
    }

    // Check for duplicates
    if (entries.some((e) => e.email === email.toLowerCase())) {
      return NextResponse.json({
        success: true,
        message: "You're already on the list!",
      });
    }

    // Append new entry
    entries.push({
      email: email.toLowerCase(),
      timestamp: new Date().toISOString(),
    });

    // Ensure data directory exists and write
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2));

    return NextResponse.json({
      success: true,
      message: "You're on the list!",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
