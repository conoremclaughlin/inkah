import { db, type Word } from './schema';
import type { SearchComposer } from '../search/search-composer';

export interface WordInput {
  word: string;
  language: SupportedLanguages;
  script?: string;
  definitions?: string[];
  transliteration?: string;
  writtenAlternatives?: {
    hangul?: string;
    traditional?: string;
    simplified?: string;
  };
  sourceUrl?: string;
}

export interface WordsDeleteResponse {
  word: string;
  language: SupportedLanguages;
  ok: boolean;
}

export interface PaginatedWords {
  items: Word[];
  pagination: {
    total: number;
    hasMore: boolean;
  };
}

export async function wordsQuery(
  words: string[] | null,
  _language?: string | null,
): Promise<Word[]> {
  if (!words || words.length === 0) return [];
  const items = await db.words.bulkGet(words);
  return items.filter((item): item is Word => item != null);
}

export async function paginatedWords(
  language: string,
  pageSize = 50,
  pageNum = 1,
): Promise<PaginatedWords> {
  const offset = (pageNum - 1) * pageSize;
  const count = await db.words.where({ language }).count();

  const items = await db.words
    .orderBy('createdAt')
    .reverse()
    .filter((record) => record.language === language)
    .offset(offset)
    .limit(pageSize)
    .toArray();

  const hasMore = count - offset - pageSize > 0;

  return {
    items,
    pagination: { total: count, hasMore },
  };
}

export async function wordsDelete(
  input: WordInput,
): Promise<WordsDeleteResponse> {
  const { word, language = 'zh' } = input;
  await db.words.where({ word, language }).delete();
  return { word, language, ok: true };
}

export async function wordsToggleSave(
  input: WordInput,
  search: SearchComposer,
): Promise<Word | null> {
  const { word, language = 'zh', script, sourceUrl } = input;

  const existingRecord = await db.words.get({ word, language });

  if (existingRecord) {
    await db.words.where({ word, language }).delete();
    return { ...existingRecord, isDeleted: true };
  }

  let definitions: string[];
  let transliteration: string | undefined;
  let writtenAlternatives: Record<string, string> | undefined;

  if (input.definitions) {
    definitions = input.definitions;
    writtenAlternatives = input.writtenAlternatives as
      | Record<string, string>
      | undefined;
    if (language === 'zh') {
      transliteration = input.transliteration;
    }
  } else {
    const searchUseCase =
      language === 'ko' ? search.searchKorean : search.searchChinese;
    const wordDefinitions = await searchUseCase.search(word);
    if (wordDefinitions && wordDefinitions.length > 0) {
      const wordDefinition = wordDefinitions[0];
      definitions = wordDefinition.definitions;
      if (language === 'zh') {
        transliteration = wordDefinition.transliteration.pinyin;
        if (wordDefinition.word) {
          writtenAlternatives = {};
          for (const key in wordDefinition.word) {
            if (key === script) continue;
            writtenAlternatives[key] =
              (wordDefinition.word as Record<string, string>)[key];
          }
        }
      }
    } else {
      definitions = [];
    }
  }

  const dateTime = new Date();
  const serialized: Word = {
    word,
    language,
    script: script as SupportedScripts | undefined,
    definitions,
    writtenAlternatives,
    transliteration,
    createdAt: dateTime,
    updatedAt: dateTime,
    ...(sourceUrl ? { sourceUrl } : {}),
  };

  await db.words.put(serialized);
  return serialized;
}
