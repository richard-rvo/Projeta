import { describe, expect, it } from 'vitest';
import { assertConfirmedTarget } from './helpers.js';

describe('assertConfirmedTarget', () => {
  it('lança com ref vazio', () => {
    expect(() => assertConfirmedTarget('https://abc.supabase.co', '')).toThrow();
    expect(() => assertConfirmedTarget('https://abc.supabase.co', undefined)).toThrow();
  });
  it('lança quando a URL não contém o ref', () => {
    expect(() => assertConfirmedTarget('https://abc.supabase.co', 'xyz')).toThrow();
  });
  it('passa quando a URL contém o ref', () => {
    expect(() => assertConfirmedTarget('https://abc.supabase.co', 'abc')).not.toThrow();
  });
});
