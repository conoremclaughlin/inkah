import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importDictionariesIfNeeded } from '../data/import-dictionaries';

/**
 * Regression tests for dictionary import resume behavior.
 *
 * MV3 service workers can be killed mid-import. The import must:
 * 1. Run again on service worker startup when incomplete (not only onInstalled)
 * 2. Early-return cheaply when already complete
 * 3. Dedupe concurrent invocations (onInstalled + startup race)
 */
describe('importDictionariesIfNeeded', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    // Reset stored import progress
    await chrome.storage.local.set({ dictImportProgress: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('early-returns without fetching when import is already complete', async () => {
    await chrome.storage.local.set({
      dictImportProgress: {
        version: 1,
        cedict: true,
        kedict: true,
        vicon: true,
        lemmas: true,
        tags_zh: true,
        tags_ko: true,
      },
    });

    await importDictionariesIfNeeded();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attempts import when progress is incomplete (resume after SW kill)', async () => {
    await chrome.storage.local.set({
      dictImportProgress: {
        version: 0,
        cedict: true,
        tags_zh: true,
        // kedict/vicon/lemmas/tags_ko missing — interrupted mid-import
      },
    });

    // Feed empty dictionaries so the import completes quickly
    fetchMock.mockResolvedValue({
      json: async () => ({}),
      text: async () => '',
    });

    await importDictionariesIfNeeded();

    // It fetched the missing Korean files (kedict at minimum)
    expect(fetchMock).toHaveBeenCalled();
    const fetchedUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(fetchedUrls.some((u) => u.includes('kedict'))).toBe(true);
    // And skipped already-imported Chinese dict
    expect(fetchedUrls.some((u) => u.includes('cedict'))).toBe(false);

    // Marks complete when done
    const result = await chrome.storage.local.get(['dictImportProgress']);
    expect(
      (result.dictImportProgress as { version: number }).version,
    ).toBeGreaterThanOrEqual(1);
  });

  it('dedupes concurrent invocations', async () => {
    await chrome.storage.local.set({
      dictImportProgress: { version: 0 },
    });

    let resolveFetch: (v: unknown) => void;
    const gate = new Promise((r) => { resolveFetch = r; });
    fetchMock.mockImplementation(async () => {
      await gate;
      return { json: async () => ({}), text: async () => '' };
    });

    // Two overlapping calls (simulates onInstalled + startup race)
    const p1 = importDictionariesIfNeeded();
    const p2 = importDictionariesIfNeeded();

    // Same in-flight promise — the second call must not start a second import
    expect(p1).toBe(p2);

    resolveFetch!({});
    await Promise.all([p1, p2]);
  });
});
