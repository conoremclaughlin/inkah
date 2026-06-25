import { describe, it, expect } from 'vitest';
import {
  toIndexesFromToneSuffix,
  toPinyinFromToneSuffix,
  toZhuyinFromToneSuffix,
} from '../lib/parse-chinese';
import { TonePresets } from '../lib/available-languages';

describe('tone index mapping for character display', () => {
  it('should produce dual-script indexes (simplified + space + traditional)', () => {
    // "han4" has 1 syllable → tone index [3] (4th tone = index 3)
    // Dual format: [3, 0, 3] → simplified char, space, traditional char
    const indexes = toIndexesFromToneSuffix('han4');
    expect(indexes).toEqual([3, 0, 3]);
  });

  it('should handle multi-syllable words', () => {
    // "ni3 hao3" → [2, 2] then [0] then [2, 2]
    const indexes = toIndexesFromToneSuffix('ni3 hao3');
    expect(indexes).toEqual([2, 2, 0, 2, 2]);
  });

  it('should handle first tone', () => {
    const indexes = toIndexesFromToneSuffix('zhong1');
    expect(indexes[0]).toBe(0); // first tone = index 0
  });

  it('should handle fifth/neutral tone', () => {
    const indexes = toIndexesFromToneSuffix('de5');
    expect(indexes[0]).toBe(4); // fifth tone = index 4
  });

  it('should map correctly to single-script character arrays', () => {
    // For simplified-only display, we use just the first half of indexes
    // "zhong1 guo2" → indexes [0, 1, 0, 0, 1]
    // First half (before the 0 separator): [0, 1]
    const indexes = toIndexesFromToneSuffix('zhong1 guo2');
    const simplifiedIndexes = indexes.slice(
      0,
      Math.floor(indexes.length / 2),
    );
    expect(simplifiedIndexes).toEqual([0, 1]);
  });
});

describe('tone color presets', () => {
  const toneKeys = [
    'firstTone',
    'secondTone',
    'thirdTone',
    'fourthTone',
    'fifthTone',
  ] as const;

  it('pleco preset should have all 5 tones for light and dark', () => {
    for (const key of toneKeys) {
      expect(TonePresets.pleco.light[key]).toBeTruthy();
      expect(TonePresets.pleco.dark[key]).toBeTruthy();
    }
  });

  it('all presets should have valid hex colors', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [, preset] of Object.entries(TonePresets)) {
      for (const key of toneKeys) {
        expect(preset.light[key]).toMatch(hexPattern);
        expect(preset.dark[key]).toMatch(hexPattern);
      }
    }
  });

  it('dark mode colors should differ from light mode', () => {
    // At least some dark colors should differ from light
    const pleco = TonePresets.pleco;
    const diffs = toneKeys.filter(
      (k) => pleco.light[k] !== pleco.dark[k],
    );
    expect(diffs.length).toBeGreaterThan(0);
  });
});

describe('definition formatting', () => {
  it('should join definitions with semicolons', () => {
    const defs = ['man', 'male'];
    expect(defs.join('; ')).toBe('man; male');
  });

  it('should handle single definition without semicolons', () => {
    const defs = ['man'];
    expect(defs.join('; ')).toBe('man');
  });

  it('should handle definitions containing pinyin tone numbers', () => {
    const combined = ['Han4 ethnic group', 'Chinese (language)'].join('; ');
    const converted = toPinyinFromToneSuffix(combined);
    expect(converted).toContain('Hàn');
    expect(converted).toContain('Chinese (language)');
  });
});

describe('transliteration conversion for display', () => {
  it('should convert pinyin to display format', () => {
    expect(toPinyinFromToneSuffix('han4')).toBe('hàn');
    expect(toPinyinFromToneSuffix('zhong1 guo2')).toBe('zhōng guó');
  });

  it('should convert to zhuyin for display', () => {
    expect(toZhuyinFromToneSuffix('han4')).toBe('ㄏㄢˋ');
    expect(toZhuyinFromToneSuffix('ni3 hao3')).toBe('ㄋㄧˇ ㄏㄠˇ');
  });
});

describe('character display logic', () => {
  const word = { traditional: '漢', simplified: '汉' };

  function getCharacters(
    w: { traditional: string; simplified: string },
    charType: string,
  ): string[] {
    switch (charType) {
      case 'simplified':
        return [...w.simplified];
      case 'traditional':
        return [...w.traditional];
      case 'simplified_traditional':
        return [...w.simplified, ' ', ...w.traditional];
      case 'traditional_simplified':
        return [...w.traditional, ' ', ...w.simplified];
      default:
        return [...w.simplified, ' ', ...w.traditional];
    }
  }

  it('simplified_traditional shows simplified first then traditional', () => {
    const chars = getCharacters(word, 'simplified_traditional');
    expect(chars).toEqual(['汉', ' ', '漢']);
  });

  it('traditional_simplified shows traditional first then simplified', () => {
    const chars = getCharacters(word, 'traditional_simplified');
    expect(chars).toEqual(['漢', ' ', '汉']);
  });

  it('simplified shows only simplified', () => {
    const chars = getCharacters(word, 'simplified');
    expect(chars).toEqual(['汉']);
  });

  it('traditional shows only traditional', () => {
    const chars = getCharacters(word, 'traditional');
    expect(chars).toEqual(['漢']);
  });

  it('multi-char word produces correct dual display', () => {
    const multiWord = { traditional: '中國', simplified: '中国' };
    const chars = getCharacters(multiWord, 'simplified_traditional');
    expect(chars).toEqual(['中', '国', ' ', '中', '國']);
  });
});
