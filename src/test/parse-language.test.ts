import { describe, it, expect } from 'vitest';
import { hasTargetLanguage, parseNewLines, getScript } from '../lib/parse-language';

describe('hasTargetLanguage', () => {
  it('should detect Chinese characters in text', () => {
    expect(hasTargetLanguage('zh', '你好 hello')).toBe(true);
    expect(hasTargetLanguage('zh', 'hello world')).toBe(false);
  });

  it('should detect Korean characters in text', () => {
    expect(hasTargetLanguage('ko', '안녕하세요')).toBe(true);
    expect(hasTargetLanguage('ko', 'hello world')).toBe(false);
  });

  it('should return false for null/empty', () => {
    expect(hasTargetLanguage('zh', null)).toBe(false);
    expect(hasTargetLanguage('zh', '')).toBe(false);
  });
});

describe('parseNewLines', () => {
  it('should create tokens for Chinese text', () => {
    const tokens = parseNewLines('hello', 'zh');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].word).toHaveProperty('traditional', 'hello');
    expect(tokens[0].word).toHaveProperty('simplified', 'hello');
  });

  it('should create tokens for Korean text', () => {
    const tokens = parseNewLines('hello', 'ko');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].word).toHaveProperty('hangul', 'hello');
  });

  it('should split on newlines', () => {
    const tokens = parseNewLines('line1\nline2', 'zh');
    expect(tokens.length).toBeGreaterThan(1);
  });
});

describe('getScript', () => {
  it('should return hangul for Korean', () => {
    expect(getScript('ko')).toBe('hangul');
  });

  it('should return traditional by default for Chinese', () => {
    expect(getScript('zh')).toBe('traditional');
  });

  it('should respect configWriting for Chinese', () => {
    expect(getScript('zh', 'simplified')).toBe('simplified');
    expect(getScript('zh', 'traditional')).toBe('traditional');
    expect(getScript('zh', 'simplified_traditional')).toBe('simplified');
    expect(getScript('zh', 'traditional_simplified')).toBe('traditional');
  });
});
