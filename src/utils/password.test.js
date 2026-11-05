import { describe, it, expect } from 'vitest';
import { validatePassword } from './password';

describe('validatePassword', () => {
  it('recusa menos de 10 caracteres', () => {
    expect(validatePassword('abc12345')).toBe('Use pelo menos 10 caracteres.');
  });

  it('exige letra e número', () => {
    expect(validatePassword('aaaaaaaaaaaa')).toBe('Use letras e números.');
    expect(validatePassword('123456789012')).toBe('Use letras e números.');
  });

  it('aceita senha válida', () => {
    expect(validatePassword('projeta2026ok')).toBeNull();
  });
});
