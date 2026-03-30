import { describe, it, expect } from 'vitest';
import {
  isKoreanLetter,
  romanizeChar,
  toRomanizationFromHangul,
} from '../lib/parse-korean';

describe('isKoreanLetter', () => {
  it('should detect Korean syllables', () => {
    expect(isKoreanLetter('한'.codePointAt(0)!)).toBe(true);
    expect(isKoreanLetter('글'.codePointAt(0)!)).toBe(true);
    expect(isKoreanLetter('가'.codePointAt(0)!)).toBe(true);
  });

  it('should reject Latin characters', () => {
    expect(isKoreanLetter('a'.codePointAt(0)!)).toBe(false);
    expect(isKoreanLetter('Z'.codePointAt(0)!)).toBe(false);
  });

  it('should reject Chinese characters', () => {
    expect(isKoreanLetter('你'.codePointAt(0)!)).toBe(false);
  });
});

describe('romanizeChar', () => {
  it('should romanize Korean syllables', () => {
    expect(romanizeChar('가', true)).toBe('ga');
    expect(romanizeChar('나', true)).toBe('na');
  });

  it('should return non-Hangul chars unchanged', () => {
    expect(romanizeChar('a', true)).toBe('a');
    expect(romanizeChar('1', true)).toBe('1');
  });
});

describe('toRomanizationFromHangul', () => {
  it('should romanize Korean text with hyphens', () => {
    const result = toRomanizationFromHangul('한글');
    expect(result).toBe('han-geul');
  });

  it('should handle single character', () => {
    const result = toRomanizationFromHangul('가');
    expect(result).toBe('ga');
  });
});
