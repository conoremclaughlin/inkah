import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../data/schema';
import { SearchChineseUseCase } from '../search/search-chinese';

const search = new SearchChineseUseCase();

beforeAll(async () => {
  // Seed test dictionary
  await db.cedict.bulkPut([
    { key: '你', value: '你 你 [ni3] /you/' },
    { key: '好', value: '好 好 [hao3] /good/well/' },
    { key: '你好', value: '你好 你好 [ni3 hao3] /hello/hi/' },
    { key: '中', value: '中 中 [zhong1] /middle/center/' },
    { key: '国', value: '国 國 [guo2] /country/nation/' },
    { key: '中国', value: '中国 中國 [Zhong1 guo2] /China/' },
    { key: '人', value: '人 人 [ren2] /person/people/' },
    { key: '中国人', value: '中国人 中國人 [Zhong1 guo2 ren2] /Chinese person/' },
  ]);
});

describe('SearchChineseUseCase', () => {
  describe('search', () => {
    it('should find exact word matches', async () => {
      const result = await search.search('你好');
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      // Longest match first
      expect(result![0].word).toHaveProperty('traditional', '你好');
    });

    it('should return longest match first', async () => {
      const result = await search.search('中国人');
      expect(result).not.toBeNull();
      expect(result![0].word).toHaveProperty('traditional', '中国人');
    });

    it('should return null for non-matching text', async () => {
      const result = await search.search('hello');
      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await search.search('');
      expect(result).toBeNull();
    });
  });

  describe('parseTokens', () => {
    it('should tokenize Chinese text', async () => {
      const tokens = await search.parseTokens('你好');
      expect(tokens).not.toBeNull();
      expect(tokens!.length).toBeGreaterThan(0);
      expect(tokens![0].word).toHaveProperty('traditional', '你好');
    });

    it('should handle mixed text', async () => {
      const tokens = await search.parseTokens('你好 hello');
      expect(tokens).not.toBeNull();
      expect(tokens!.length).toBeGreaterThan(1);
    });
  });

  describe('toDefinitionsFromCe', () => {
    it('should parse CC-CEDICT format', () => {
      const result = search.toDefinitionsFromCe(
        '你好 你好 [ni3 hao3] /hello/hi/',
      );
      expect(result).not.toBeNull();
      expect(result![0].word).toEqual({
        traditional: '你好',
        simplified: '你好',
      });
      expect(result![0].transliteration.pinyin).toBe('ni3 hao3');
      expect(result![0].definitions).toEqual(['hello', 'hi']);
    });

    it('should filter comment lines', () => {
      const result = search.toDefinitionsFromCe(
        '# comment\n你 你 [ni3] /you/',
      );
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
    });
  });
});
