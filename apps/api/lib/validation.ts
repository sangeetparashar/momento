import { z } from 'zod';

export const createPostSchema = z.object({
  postType: z.enum(['TEXT', 'IMAGE', 'VIDEO']),
  content: z.string().max(5000).optional().nullable(),
  caption: z.string().max(2200).optional().nullable(),
  mediaUrl: z.string().url().optional().nullable(),
  mediaUrls: z.array(z.string().url()).max(10).optional().nullable(),
  latitude: z.number().min(-90).max(90).default(0),
  longitude: z.number().min(-180).max(180).default(0),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

// Transform empty strings to undefined so optional fields pass validation
const emptyToUndefined = (val: string | undefined) => (val === '' ? undefined : val);

export const updateProfileSchema = z.object({
  username: z.preprocess(emptyToUndefined, z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional()),
  displayName: z.preprocess(emptyToUndefined, z.string().min(1).max(50).optional()),
  bio: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  avatarUrl: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  bannerUrl: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  tokenSymbol: z.preprocess(emptyToUndefined, z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Token symbol must be uppercase letters and numbers').optional()),
  socialLinks: z.object({
    instagram: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    twitter: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    youtube: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    spotify: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    soundcloud: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    tiktok: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    website: z.preprocess(emptyToUndefined, z.string().url().max(200).optional()),
  }).optional().nullable(),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const pushTokenSchema = z.object({
  pushToken: z.string().min(1),
});

export const uploadPresignSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  folder: z.string().max(255).regex(/^[a-zA-Z0-9_\/-]*$/, 'Invalid folder characters').optional(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE'),
});

// Helper to validate and return parsed data or error response
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return {
      success: false,
      response: new Response(
        JSON.stringify({ success: false, error: `Validation error: ${errors}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { success: true, data: result.data };
}
