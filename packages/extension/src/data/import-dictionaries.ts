import { db } from './schema';
import { csvToJson, csvToTags } from '../lib/csv-utils';
import AvailableLanguages from '../lib/available-languages';

const DICT_PATH = '/data/dictionaries/';
const LEMMA_PATH = '/data/lemmalookups/';
const TAGS_PATH = '/data/tags/';

const BATCH_SIZE = 10_000;
const IMPORT_VERSION = 1;

type ImportProgress = {
  version: number;
  cedict?: boolean;
  kedict?: boolean;
  vicon?: boolean;
  lemmas?: boolean;
  tags_zh?: boolean;
  tags_ko?: boolean;
};

async function getImportProgress(): Promise<ImportProgress> {
  const result = await chrome.storage.local.get(['dictImportProgress']);
  return result.dictImportProgress ?? { version: 0 };
}

async function updateImportProgress(
  update: Partial<ImportProgress>,
): Promise<void> {
  const current = await getImportProgress();
  await chrome.storage.local.set({
    dictImportProgress: { ...current, ...update },
  });
}

async function importJsonDict(
  tableName: 'cedict' | 'kedict' | 'vicon',
  filePath: string,
  additionsPath?: string,
): Promise<void> {
  const response = await fetch(chrome.runtime.getURL(filePath));
  const dictionary = await response.json();

  let additions: Record<string, unknown> | null = null;
  if (additionsPath) {
    const addResp = await fetch(chrome.runtime.getURL(additionsPath));
    additions = await addResp.json();
  }

  const merged = additions
    ? Object.assign(dictionary, additions)
    : dictionary;

  const entries = Object.entries(merged);
  const table = db[tableName];

  // Clear existing data for clean import
  await table.clear();

  // Batch insert
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map(([key, value]) => ({
      key,
      value: value as string | string[],
    }));
    await table.bulkPut(batch);
  }

  console.log(
    `[inkah] Imported ${entries.length} entries into ${tableName}`,
  );
}

async function importLemmas(filePath: string): Promise<void> {
  const response = await fetch(chrome.runtime.getURL(filePath));
  const csvText = await response.text();
  const lemmaObj = csvToJson(csvText);

  const entries = Object.entries(lemmaObj).map(([conjugated, base]) => ({
    conjugated,
    base,
  }));

  await db.lemmas.clear();

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db.lemmas.bulkPut(batch);
  }

  console.log(`[inkah] Imported ${entries.length} lemma entries`);
}

async function importTags(
  language: SupportedLanguages,
  filePath: string,
): Promise<void> {
  const response = await fetch(chrome.runtime.getURL(filePath));
  const csvText = await response.text();
  const tagsList = csvToTags(csvText);
  await db.tags.bulkPut(tagsList);
  console.log(
    `[inkah] Imported ${tagsList.length} tag entries for ${language}`,
  );
}

async function importChineseDicts(progress: ImportProgress): Promise<void> {
  if (!progress.cedict) {
    const zhConfig = AvailableLanguages.zh.dictionaries.en;
    await importJsonDict(
      'cedict',
      `${DICT_PATH}${zhConfig.file}`,
      zhConfig.additions ? `${DICT_PATH}${zhConfig.additions}` : undefined,
    );
    await updateImportProgress({ cedict: true });
  }

  if (!progress.tags_zh) {
    const zhTags = AvailableLanguages.zh.tags;
    if (zhTags) {
      await importTags('zh', `${TAGS_PATH}${zhTags}`);
    }
    await updateImportProgress({ tags_zh: true });
  }
}

async function importKoreanDicts(progress: ImportProgress): Promise<void> {
  if (!progress.kedict) {
    const koConfig = AvailableLanguages.ko.dictionaries.en;
    await importJsonDict(
      'kedict',
      `${DICT_PATH}${koConfig.file}`,
      koConfig.additions ? `${DICT_PATH}${koConfig.additions}` : undefined,
    );
    await updateImportProgress({ kedict: true });
  }

  if (!progress.vicon) {
    const koConfig = AvailableLanguages.ko.dictionaries.en;
    if (koConfig.vicon) {
      await importJsonDict('vicon', `${DICT_PATH}${koConfig.vicon}`);
    }
    await updateImportProgress({ vicon: true });
  }

  if (!progress.lemmas) {
    const lemmaFile = AvailableLanguages.ko.lemmas;
    if (lemmaFile) {
      await importLemmas(`${LEMMA_PATH}${lemmaFile}`);
    }
    await updateImportProgress({ lemmas: true });
  }

  if (!progress.tags_ko) {
    const koTags = AvailableLanguages.ko.tags;
    if (koTags) {
      await importTags('ko', `${TAGS_PATH}${koTags}`);
    }
    await updateImportProgress({ tags_ko: true });
  }
}

export async function importDictionariesIfNeeded(): Promise<void> {
  const progress = await getImportProgress();
  if (progress.version >= IMPORT_VERSION) {
    console.log('[inkah] Dictionaries already imported');
    return;
  }

  // Import preferred language first, then the other
  const langResult = await chrome.storage.local.get(['targetLanguage']);
  const preferred: SupportedLanguages = langResult.targetLanguage ?? 'zh';

  console.log(`[inkah] Starting dictionary import (preferred: ${preferred})...`);

  if (preferred === 'ko') {
    await importKoreanDicts(progress);
    await importChineseDicts(await getImportProgress());
  } else {
    await importChineseDicts(progress);
    await importKoreanDicts(await getImportProgress());
  }

  await updateImportProgress({ version: IMPORT_VERSION });
  console.log('[inkah] Dictionary import complete!');
}
