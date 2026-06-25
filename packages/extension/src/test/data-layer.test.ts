import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../data/schema';
import { csvToJson, csvToTags } from '../lib/csv-utils';

describe('Dexie schema', () => {
  beforeEach(async () => {
    await db.words.clear();
    await db.sentences.clear();
  });

  it('should store and retrieve words', async () => {
    const word = {
      word: '你好',
      language: 'zh' as SupportedLanguages,
      definitions: ['hello'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.words.put(word);
    const retrieved = await db.words.get('你好');
    expect(retrieved).toBeDefined();
    expect(retrieved!.word).toBe('你好');
    expect(retrieved!.definitions).toEqual(['hello']);
  });

  it('should store and retrieve sentences', async () => {
    const sentence = {
      sentence: '你好世界',
      language: 'zh' as SupportedLanguages,
      definitions: ['hello world'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.sentences.put(sentence);
    const retrieved = await db.sentences.get('你好世界');
    expect(retrieved).toBeDefined();
    expect(retrieved!.sentence).toBe('你好世界');
  });

  it('should support bulk operations', async () => {
    const words = [
      {
        word: '一',
        language: 'zh' as SupportedLanguages,
        definitions: ['one'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        word: '二',
        language: 'zh' as SupportedLanguages,
        definitions: ['two'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await db.words.bulkPut(words);
    const results = await db.words.bulkGet(['一', '二']);
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});

describe('csvToJson', () => {
  it('should convert CSV to key-value object', () => {
    const csv = 'base,conjugated\n하다,했다\n먹다,먹었다';
    const result = csvToJson(csv);
    expect(result['했다']).toBe('하다');
    expect(result['먹었다']).toBe('먹다');
  });

  it('should handle empty CSV', () => {
    const result = csvToJson('header1,header2');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('csvToTags', () => {
  it('should convert CSV to tag entries', () => {
    const csv = 'word,tag1,tag2\n你好,HSK1,greeting\n谢谢,HSK1,polite';
    const result = csvToTags(csv);
    expect(result).toHaveLength(2);
    expect(result[0].word).toBe('你好');
    expect(result[0].tags).toContain('HSK1');
    expect(result[0].tags).toContain('greeting');
  });
});
