import { describe, it, expect } from 'vitest';
import {
  isChineseCharacter,
  isCjkPunctuation,
  toPinyinFromToneSuffix,
  toIndexesFromToneSuffix,
  stripTone,
  getToneNumber,
  toZhuyinFromToneSuffix,
} from '../lib/parse-chinese';

describe('isChineseCharacter', () => {
  it('should detect common Chinese characters', () => {
    expect(isChineseCharacter('你'.codePointAt(0)!)).toBe(true);
    expect(isChineseCharacter('好'.codePointAt(0)!)).toBe(true);
    expect(isChineseCharacter('中'.codePointAt(0)!)).toBe(true);
  });

  it('should reject Latin characters', () => {
    expect(isChineseCharacter('a'.codePointAt(0)!)).toBe(false);
    expect(isChineseCharacter('Z'.codePointAt(0)!)).toBe(false);
    expect(isChineseCharacter('1'.codePointAt(0)!)).toBe(false);
  });

  it('should reject NaN', () => {
    expect(isChineseCharacter(NaN)).toBe(false);
  });
});

describe('isCjkPunctuation', () => {
  it('should detect CJK punctuation', () => {
    expect(isCjkPunctuation('。'.codePointAt(0)!)).toBe(true);
    expect(isCjkPunctuation('，'.codePointAt(0)!)).toBe(true);
  });

  it('should detect spaces', () => {
    expect(isCjkPunctuation(' '.codePointAt(0)!)).toBe(true);
  });
});

describe('toPinyinFromToneSuffix', () => {
  it('should convert tone numbers to diacritics', () => {
    expect(toPinyinFromToneSuffix('ni3 hao3')).toBe('nǐ hǎo');
    expect(toPinyinFromToneSuffix('zhong1 guo2')).toBe('zhōng guó');
  });

  it('should handle 5th tone (quiet)', () => {
    expect(toPinyinFromToneSuffix('de5')).toBe('de');
  });

  it('should handle uppercase pinyin', () => {
    expect(toPinyinFromToneSuffix('Bei3 jing1')).toBe('Běi jīng');
  });
});

describe('stripTone', () => {
  it('should strip tone diacritics', () => {
    expect(stripTone('nǐ')).toBe('ni');
    expect(stripTone('hǎo')).toBe('hao');
  });

  it('should strip tone numbers', () => {
    expect(stripTone('ni3')).toBe('ni');
    expect(stripTone('hao3')).toBe('hao');
  });
});

describe('getToneNumber', () => {
  it('should extract tone from number notation', () => {
    expect(getToneNumber('ni3')).toBe(3);
    expect(getToneNumber('hao3')).toBe(3);
  });

  it('should extract tone from diacritics', () => {
    expect(getToneNumber('nǐ')).toBe(3);
    expect(getToneNumber('zhōng')).toBe(1);
  });

  it('should return 5 for toneless', () => {
    expect(getToneNumber('de')).toBe(5);
  });
});

describe('toIndexesFromToneSuffix', () => {
  it('should extract tone indexes', () => {
    const indexes = toIndexesFromToneSuffix('ni3 hao3');
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes[0]).toBe(2); // tone 3 = index 2
    expect(indexes[1]).toBe(2);
  });

  it('should return empty for non-pinyin text', () => {
    expect(toIndexesFromToneSuffix('hello world')).toEqual([]);
  });
});

describe('toZhuyinFromToneSuffix', () => {
  it('should convert pinyin to zhuyin', () => {
    const result = toZhuyinFromToneSuffix('ni3');
    expect(result).toBe('ㄋㄧˇ');
  });

  it('should handle multiple syllables', () => {
    const result = toZhuyinFromToneSuffix('ni3 hao3');
    expect(result).toBe('ㄋㄧˇ ㄏㄠˇ');
  });
});
