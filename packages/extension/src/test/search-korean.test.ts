import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../data/schema';
import { SearchKoreanUseCase } from '../search/search-korean';

const search = new SearchKoreanUseCase();

beforeAll(async () => {
  // Seed test dictionary
  await db.kedict.bulkPut([
    { key: '사람', value: ['사람 [saram] /person/people/\n'] },
    { key: '한국', value: ['한국 [hanguk] /Korea/South Korea/\n'] },
    {
      key: '한국인',
      value: ['한국인 [hangukin] /Korean person/Korean national/\n'],
    },
    { key: '안녕', value: ['안녕 [annyeong] /peace/well-being/\n'] },
    {
      key: '안녕하세요',
      value: ['안녕하세요 [annyeonghaseyo] /hello (formal)/\n'],
    },
  ]);

  await db.vicon.bulkPut([
    { key: '했다', value: '했다 [haessda] /did/past tense of 하다/\n' },
  ]);

  await db.lemmas.bulkPut([
    { conjugated: '했다', base: '하다' },
  ]);
});

describe('SearchKoreanUseCase', () => {
  describe('search', () => {
    it('should find exact word matches', async () => {
      const result = await search.search('사람');
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].word).toHaveProperty('hangul', '사람');
    });

    it('should return longest match first', async () => {
      const result = await search.search('안녕하세요');
      expect(result).not.toBeNull();
      expect(result![0].word).toHaveProperty('hangul', '안녕하세요');
    });

    it('should return null for non-matching text', async () => {
      const result = await search.search('hello');
      expect(result).toBeNull();
    });

    it('should handle vicon dictionary lookups', async () => {
      const result = await search.search('했다');
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe('parseTokens', () => {
    it('should tokenize Korean text', async () => {
      const tokens = await search.parseTokens('사람');
      expect(tokens).not.toBeNull();
      expect(tokens!.length).toBeGreaterThan(0);
    });
  });

  describe('insertLemma', () => {
    it('should inject lemma into definition', () => {
      const result = search.insertLemma(
        '하다 [hada] /to do/\n',
        '하다',
        '했다',
      );
      expect(result).toContain('했다');
      expect(result).toContain('(하다)');
    });
  });

  describe('toDefinitionsFromCe', () => {
    it('should parse Korean dictionary format', () => {
      const result = search.toDefinitionsFromCe(
        '사람 [saram] /person/\n',
      );
      expect(result).not.toBeNull();
      expect(result![0].word).toHaveProperty('hangul', '사람');
      expect(result![0].transliteration.pinyin).toBe('saram');
    });
  });
});
