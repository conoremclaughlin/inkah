import { db, type Sentence } from './schema';

export interface SentenceInput {
  sentence: string;
  language: SupportedLanguages;
  definitions?: string[];
  sourceUrl?: string;
  sourceType?: SourceOptions;
}

export interface SentencesDeleteResponse {
  sentence: string;
  language: SupportedLanguages;
  ok: boolean;
}

export interface PaginatedSentences {
  items: Sentence[];
  pagination: {
    total: number;
    hasMore: boolean;
  };
}

export async function sentencesQuery(
  sentences: string[] | null,
  _language?: string | null,
): Promise<Sentence[]> {
  if (!sentences || sentences.length === 0) return [];
  const items = await db.sentences.bulkGet(sentences);
  return items.filter((item): item is Sentence => item != null);
}

export async function paginatedSentences(
  language: string,
  pageSize = 50,
  pageNum = 1,
  sourceType: SourceQueryOptions = 'all',
): Promise<PaginatedSentences> {
  const offset = (pageNum - 1) * pageSize;

  let count: number;
  if (sourceType === 'all') {
    count = await db.sentences.where({ language }).count();
  } else {
    count = await db.sentences.where({ language, sourceType }).count();
  }

  const items = await db.sentences
    .orderBy('createdAt')
    .reverse()
    .filter((record) => record.language === language)
    .filter(
      (record) => sourceType === 'all' || record.sourceType === sourceType,
    )
    .offset(offset)
    .limit(pageSize)
    .toArray();

  const hasMore = count - offset - pageSize > 0;

  return {
    items,
    pagination: { total: count, hasMore },
  };
}

export async function sentencesDelete(
  input: SentenceInput,
): Promise<SentencesDeleteResponse> {
  const { sentence, language = 'zh' } = input;
  await db.sentences.where({ sentence, language }).delete();
  return { sentence, language, ok: true };
}

export async function sentencesToggleSave(
  input: SentenceInput,
): Promise<Sentence | null> {
  const { sentence, language = 'zh', sourceUrl } = input;
  let { sourceType } = input;

  const existingRecord = await db.sentences.get({ sentence, language });

  if (existingRecord) {
    await db.sentences.where({ sentence, language }).delete();
    return { ...existingRecord, isDeleted: true };
  }

  const definitions = input.definitions ?? [];

  if (!sourceType) {
    sourceType = 'others';
  }

  const dateTime = new Date();
  const serialized: Sentence = {
    sentence,
    language,
    definitions,
    createdAt: dateTime,
    updatedAt: dateTime,
    sourceUrl,
    sourceType,
  };

  await db.sentences.put(serialized);
  return serialized;
}
