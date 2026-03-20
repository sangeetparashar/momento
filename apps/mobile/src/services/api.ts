import { ENV } from '@/config/env';

/**
 * Standardised API error with status code and parsed body.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
    const message =
      b?.message ? String(b.message)
        : b?.error ? String(b.error)
        : `Request failed with status ${status}`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type TokenGetter = () => Promise<string | null>;

/**
 * Central API service for all network requests.
 *
 * Usage:
 *   import { apiService } from '@/services/api';
 *   apiService.setTokenGetter(() => getAccessToken());
 *   const data = await apiService.get<User>('/users/me');
 */
class ApiService {
  private baseUrl: string;
  private tokenGetter: TokenGetter | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Register a lazy token getter so the auth header is injected automatically.
   * This avoids circular dependency issues with the auth provider.
   */
  setTokenGetter(getter: TokenGetter): void {
    this.tokenGetter = getter;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.tokenGetter) return {};

    const token = await this.tokenGetter();
    if (!token) return {};

    return { Authorization: `Bearer ${token}` };
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean | undefined>;
    } = {},
  ): Promise<T> {
    const { body, headers: extraHeaders, params } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const authHeaders = await this.getAuthHeaders();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders,
      ...extraHeaders,
    };

    const fetchOptions: RequestInit = { method, headers };
    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeoutId);

      // No-content responses
      if (response.status === 204) {
        return undefined as T;
      }

      let parsed: unknown;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        parsed = await response.json();
      } else {
        parsed = await response.text();
      }

      if (!response.ok) {
        console.error(`[API] ${method} ${path} → ${response.status}`, parsed);
        throw new ApiError(response.status, parsed);
      }

      // Unwrap the { success, data } envelope used by all API routes
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'success' in (parsed as Record<string, unknown>) &&
        'data' in (parsed as Record<string, unknown>)
      ) {
        return (parsed as Record<string, unknown>).data as T;
      }
      return parsed as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out. Please check your connection and try again.');
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Public HTTP methods
  // ---------------------------------------------------------------------------

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ---------------------------------------------------------------------------
  // File upload via presigned URL
  // ---------------------------------------------------------------------------

  /**
   * Upload a file to a presigned URL.
   *
   * @param presignedUrl - The presigned PUT URL (e.g. from S3 / R2).
   * @param fileUri      - Local file URI (e.g. from expo-image-picker).
   * @param contentType  - MIME type of the file.
   */
  async uploadFile(
    presignedUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new ApiError(
        uploadResponse.status,
        `Upload failed with status ${uploadResponse.status}`,
      );
    }
  }

  /**
   * Request a presigned upload URL from the API, upload the file, and return
   * the final public URL.
   */
  async uploadWithPresignedUrl(
    fileUri: string,
    contentType: string,
  ): Promise<{ url: string }> {
    // Generate a unique filename
    const ext = contentType.split('/')[1] || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Step 1: Get upload URL from the API
    const { uploadUrl, publicUrl } = await this.post<{
      uploadUrl: string;
      publicUrl: string;
      path: string;
    }>('/uploads/presign', { fileName, contentType });

    // Step 2: Upload the file
    await this.uploadFile(uploadUrl, fileUri, contentType);

    // Step 3: Return the public URL
    return { url: publicUrl };
  }
}

/** Singleton API service instance */
export const apiService = new ApiService(ENV.API_URL);
