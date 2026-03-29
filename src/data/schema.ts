import Dexie, { type Table } from 'dexie';

export interface Word {
  word: string;
  language: SupportedLanguages;
  script?: SupportedScripts;
  writtenAlternatives?: {
    hangul?: string;
    traditional?: string;
    simplified?: string;
  };
  isDeleted?: boolean;
  transliteration?: string;
  definitions?: string[];
  collections?: string[];
  sourceUrl?: string;
  syncedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sentence {
  sentence: string;
  language: SupportedLanguages;
  isDeleted?: boolean;
  definitions?: string[];
  sourceUrl?: string;
  sourceType?: SourceOptions;
  syncedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  word: string;
  tags: string[];
}

export interface DictEntry {
  key: string;
  value: string | string[];
}

export interface LemmaEntry {
  conjugated: string;
  base: string;
}

class InkahDexie extends Dexie {
  words!: Table<Word, string>;
  sentences!: Table<Sentence, string>;
  tags!: Table<Tag, string>;
  cedict!: Table<DictEntry, string>;
  kedict!: Table<DictEntry, string>;
  vicon!: Table<DictEntry, string>;
  lemmas!: Table<LemmaEntry, string>;

  constructor() {
    // cache: 'immutable' tells Dexie 4 that dict tables are read-only,
    // enabling aggressive in-memory caching of read entries
    super('inkah', { cache: 'immutable' });

    this.version(6).stores({
      words: 'word,language,script,collections,createdAt,updatedAt',
      sentences:
        'sentence,language,sourceUrl,sourceType,createdAt,updatedAt',
      tags: 'word,tags',
      cedict: 'key',
      kedict: 'key',
      vicon: 'key',
      lemmas: 'conjugated',
    });
  }
}

export const db = new InkahDexie();

/**
 * Pre-warm the IndexedDB B-tree by doing count() (touches root nodes)
 * and representative lookups spread across the Unicode key space.
 * This pulls B-tree internal nodes into the OS filesystem cache
 * so subsequent lookups avoid disk I/O.
 */
export async function warmDictionaryCache(): Promise<void> {
  // count() on each table forces the B-tree root pages to be read
  await Promise.all([
    db.cedict.count(),
    db.kedict.count(),
    db.vicon.count(),
    db.lemmas.count(),
  ]);

  // Sample common characters spread across the CJK/Hangul Unicode ranges
  // to warm internal B-tree nodes at different positions
  const zhSamples = [
    '一', '人', '大', '中', '是', '不', '了', '的',
    '在', '有', '我', '他', '这', '上', '来', '到',
    '说', '时', '要', '出', '会', '可', '也', '好',
  ];
  const koSamples = [
    '가', '나', '다', '라', '마', '바', '사', '아',
    '자', '차', '카', '타', '파', '하', '거', '너',
    '의', '이', '은', '를', '에', '서', '도', '로',
  ];

  await Promise.all([
    db.cedict.bulkGet(zhSamples),
    db.kedict.bulkGet(koSamples),
    db.vicon.bulkGet(koSamples),
  ]);

  console.log('[inkah] Dictionary cache warmed');
}
