import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../data/schema';
import { SearchComposer } from '../search/search-composer';
import { createMessageHandler } from '../messaging/handler';

const search = new SearchComposer();
const handleMessage = createMessageHandler(search);

describe('Message handler', () => {
  beforeEach(async () => {
    await db.words.clear();
    await db.sentences.clear();
  });

  it('should handle settings/get', async () => {
    const response = await handleMessage({ type: 'settings/get' });
    expect(response.data).toBeDefined();
    expect(response.data).toHaveProperty('targetLanguage');
    expect(response.data).toHaveProperty('isEnabled');
  });

  it('should handle user/me', async () => {
    const response = await handleMessage({ type: 'user/me' });
    expect(response.error).toBeUndefined();
  });

  it('should handle user/create', async () => {
    const response = await handleMessage({ type: 'user/create' });
    expect(response.data).toHaveProperty('anonymousId');
  });

  it('should handle words/toggleSave for new word', async () => {
    // First seed the dictionary for the search
    await db.cedict.bulkPut([
      { key: '你好', value: '你好 你好 [ni3 hao3] /hello/' },
    ]);

    const response = await handleMessage({
      type: 'words/toggleSave',
      payload: {
        word: '你好',
        language: 'zh',
        script: 'simplified',
        definitions: ['hello'],
      },
    });

    expect(response.data).toBeDefined();
    expect((response.data as any).word).toBe('你好');

    // Verify saved
    const saved = await db.words.get('你好');
    expect(saved).toBeDefined();
  });

  it('should handle words/toggleSave as delete for existing word', async () => {
    // Create word first
    await db.words.put({
      word: '你好',
      language: 'zh',
      definitions: ['hello'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await handleMessage({
      type: 'words/toggleSave',
      payload: { word: '你好', language: 'zh' },
    });

    expect(response.data).toBeDefined();
    expect((response.data as any).isDeleted).toBe(true);

    const deleted = await db.words.get('你好');
    expect(deleted).toBeUndefined();
  });

  it('should handle words/paginated', async () => {
    await db.words.put({
      word: '你好',
      language: 'zh',
      definitions: ['hello'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await handleMessage({
      type: 'words/paginated',
      payload: { language: 'zh', pageSize: 10, pageNum: 1 },
    });

    expect(response.data).toHaveProperty('items');
    expect(response.data).toHaveProperty('pagination');
    expect((response.data as any).items.length).toBe(1);
  });

  it('should handle unknown message type', async () => {
    const response = await handleMessage({
      type: 'unknown/type' as any,
    });
    expect(response.error).toBeDefined();
  });
});
