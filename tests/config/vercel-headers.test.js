import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

function headerMap() {
  const rule = (vercel.headers || []).find((h) => h.source === '/(.*)');
  expect(rule).toBeDefined();
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

describe('vercel.json security headers', () => {
  it('sets a strict CSP', () => {
    const csp = headerMap()['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(csp).toContain("script-src 'self'");
  });

  it('sets the remaining hardening headers', () => {
    const h = headerMap();
    expect(h['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
});

describe('index.html', () => {
  it('does not load fonts from Google', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });
});
