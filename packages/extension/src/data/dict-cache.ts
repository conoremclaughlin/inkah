import { db, type DictEntry, type LemmaEntry } from './schema';

/**
 * In-memory read-through cache for dictionary lookups.
 * Since dictionary data is immutable (write-once on import),
 * we can cache aggressively. The cache auto-clears when the
 * MV3 service worker is terminated.
 */
const cedictCache = new Map<string, DictEntry | null>();
const kedictCache = new Map<string, DictEntry | null>();
const viconCache = new Map<string, DictEntry | null>();
const lemmaCache = new Map<string, LemmaEntry | null>();

export async function getCedict(key: string): Promise<DictEntry | undefined> {
  if (cedictCache.has(key)) return cedictCache.get(key) ?? undefined;
  const entry = await db.cedict.get(key);
  cedictCache.set(key, entry ?? null);
  return entry;
}

export async function getKedict(key: string): Promise<DictEntry | undefined> {
  if (kedictCache.has(key)) return kedictCache.get(key) ?? undefined;
  const entry = await db.kedict.get(key);
  kedictCache.set(key, entry ?? null);
  return entry;
}

export async function getVicon(key: string): Promise<DictEntry | undefined> {
  if (viconCache.has(key)) return viconCache.get(key) ?? undefined;
  const entry = await db.vicon.get(key);
  viconCache.set(key, entry ?? null);
  return entry;
}

export async function getLemma(key: string): Promise<LemmaEntry | undefined> {
  if (lemmaCache.has(key)) return lemmaCache.get(key) ?? undefined;
  const entry = await db.lemmas.get(key);
  lemmaCache.set(key, entry ?? null);
  return entry;
}

export async function bulkGetCedict(
  keys: string[],
): Promise<(DictEntry | undefined)[]> {
  const results: (DictEntry | undefined)[] = [];
  const missingKeys: string[] = [];
  const missingIndexes: number[] = [];

  for (let i = 0; i < keys.length; i++) {
    if (cedictCache.has(keys[i])) {
      results[i] = cedictCache.get(keys[i]) ?? undefined;
    } else {
      missingKeys.push(keys[i]);
      missingIndexes.push(i);
    }
  }

  if (missingKeys.length > 0) {
    const fetched = await db.cedict.bulkGet(missingKeys);
    for (let j = 0; j < missingKeys.length; j++) {
      cedictCache.set(missingKeys[j], fetched[j] ?? null);
      results[missingIndexes[j]] = fetched[j];
    }
  }

  return results;
}

export async function bulkGetKedict(
  keys: string[],
): Promise<(DictEntry | undefined)[]> {
  const results: (DictEntry | undefined)[] = [];
  const missingKeys: string[] = [];
  const missingIndexes: number[] = [];

  for (let i = 0; i < keys.length; i++) {
    if (kedictCache.has(keys[i])) {
      results[i] = kedictCache.get(keys[i]) ?? undefined;
    } else {
      missingKeys.push(keys[i]);
      missingIndexes.push(i);
    }
  }

  if (missingKeys.length > 0) {
    const fetched = await db.kedict.bulkGet(missingKeys);
    for (let j = 0; j < missingKeys.length; j++) {
      kedictCache.set(missingKeys[j], fetched[j] ?? null);
      results[missingIndexes[j]] = fetched[j];
    }
  }

  return results;
}

export async function bulkGetVicon(
  keys: string[],
): Promise<(DictEntry | undefined)[]> {
  const results: (DictEntry | undefined)[] = [];
  const missingKeys: string[] = [];
  const missingIndexes: number[] = [];

  for (let i = 0; i < keys.length; i++) {
    if (viconCache.has(keys[i])) {
      results[i] = viconCache.get(keys[i]) ?? undefined;
    } else {
      missingKeys.push(keys[i]);
      missingIndexes.push(i);
    }
  }

  if (missingKeys.length > 0) {
    const fetched = await db.vicon.bulkGet(missingKeys);
    for (let j = 0; j < missingKeys.length; j++) {
      viconCache.set(missingKeys[j], fetched[j] ?? null);
      results[missingIndexes[j]] = fetched[j];
    }
  }

  return results;
}

export async function bulkGetLemmas(
  keys: string[],
): Promise<(LemmaEntry | undefined)[]> {
  const results: (LemmaEntry | undefined)[] = [];
  const missingKeys: string[] = [];
  const missingIndexes: number[] = [];

  for (let i = 0; i < keys.length; i++) {
    if (lemmaCache.has(keys[i])) {
      results[i] = lemmaCache.get(keys[i]) ?? undefined;
    } else {
      missingKeys.push(keys[i]);
      missingIndexes.push(i);
    }
  }

  if (missingKeys.length > 0) {
    const fetched = await db.lemmas.bulkGet(missingKeys);
    for (let j = 0; j < missingKeys.length; j++) {
      lemmaCache.set(missingKeys[j], fetched[j] ?? null);
      results[missingIndexes[j]] = fetched[j];
    }
  }

  return results;
}
