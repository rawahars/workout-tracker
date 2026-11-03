import { z } from 'zod';

export const FLOW_COOKIE = '__Host-form_health_oauth';
export const SESSION_COOKIE = '__Host-form_health';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}
export function validCookieKey(value?: string): value is string {
  try { return !!value && decode(value).byteLength === 32; } catch { return false; }
}
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function challenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}
async function key(value: string) {
  return crypto.subtle.importKey('raw', decode(value) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(`form-health-v1:${purpose}`),
  }, await key(secret), encoder.encode(JSON.stringify(value))));
  const result = new Uint8Array(iv.length + encrypted.length);
  result.set(iv); result.set(encrypted, iv.length);
  const token = `v1.${base64url(result)}`;
  if (token.length > 3700) throw new Error('The secure connection cookie is too large.');
  return token;
}
export async function unseal<T>(value: string | undefined, secret: string, purpose: string, schema: z.ZodType<T>): Promise<T | undefined> {
  if (!value?.startsWith('v1.') || value.length > 3800) return;
  try {
    const bytes = decode(value.slice(3));
    if (bytes.length < 29) return;
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(`form-health-v1:${purpose}`),
    }, await key(secret), bytes.slice(12));
    return schema.parse(JSON.parse(decoder.decode(plaintext)));
  } catch { return; }
}
export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get('Cookie')?.split(';') ?? [];
  const matches = cookies.map(cookie => cookie.trim()).filter(cookie => cookie.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
}
export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}; Secure; HttpOnly; SameSite=Lax`;
}
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
