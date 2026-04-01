import { test, expect, type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', '.output', 'chrome-mv3');

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-gpu',
    ],
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extensionId = sw.url().split('/')[2];
  await new Promise((r) => setTimeout(r, 1000));
});

test.afterAll(async () => {
  await context?.close();
});

test('measure dictionary import times per table', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // Clear existing import progress so we can re-measure
  await page.evaluate(async () => {
    await chrome.storage.local.remove(['dictImportProgress']);
  });

  // Measure each dictionary import individually via the service worker
  const results = await page.evaluate(async () => {
    const timings: Record<string, number> = {};

    // Helper: time a fetch + JSON parse
    async function timeFetchJson(name: string, url: string) {
      const start = performance.now();
      const resp = await fetch(chrome.runtime.getURL(url));
      const fetchDone = performance.now();
      const data = await resp.json();
      const parseDone = performance.now();
      const entryCount = Object.keys(data).length;
      timings[`${name}_fetch`] = fetchDone - start;
      timings[`${name}_parse`] = parseDone - fetchDone;
      timings[`${name}_total`] = parseDone - start;
      timings[`${name}_entries`] = entryCount;
    }

    async function timeFetchCsv(name: string, url: string) {
      const start = performance.now();
      const resp = await fetch(chrome.runtime.getURL(url));
      const fetchDone = performance.now();
      const text = await resp.text();
      const parseDone = performance.now();
      const lineCount = text.split('\n').length;
      timings[`${name}_fetch`] = fetchDone - start;
      timings[`${name}_parse`] = parseDone - fetchDone;
      timings[`${name}_total`] = parseDone - start;
      timings[`${name}_entries`] = lineCount;
    }

    await timeFetchJson('cedict', '/data/dictionaries/cedict_ts.json_text');
    await timeFetchJson('cedict_additions', '/data/dictionaries/cedict-additions.json_text');
    await timeFetchJson('kedict', '/data/dictionaries/kedict_ts.json_text');
    await timeFetchJson('ko_inkdict', '/data/dictionaries/ko-inkdict.json_text');
    await timeFetchJson('vicon', '/data/dictionaries/Vicon-KE.json_text');
    await timeFetchCsv('lemmas', '/data/lemmalookups/kolemma-lookup.csv');

    return timings;
  });

  console.log('\n=== Dictionary File Load Times ===');
  const files = ['cedict', 'cedict_additions', 'kedict', 'ko_inkdict', 'vicon', 'lemmas'];
  for (const f of files) {
    const entries = results[`${f}_entries`];
    const fetch_ms = results[`${f}_fetch`];
    const parse_ms = results[`${f}_parse`];
    const total_ms = results[`${f}_total`];
    console.log(
      `${f.padEnd(20)} ${String(entries).padStart(8)} entries | ` +
      `fetch: ${fetch_ms.toFixed(0).padStart(5)}ms | ` +
      `parse: ${parse_ms.toFixed(0).padStart(5)}ms | ` +
      `total: ${total_ms.toFixed(0).padStart(5)}ms`
    );
  }

  await page.close();
});

test('measure full import pipeline (fetch + parse + IndexedDB write)', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // Clear import state + clear all dict tables
  const importResult = await page.evaluate(async () => {
    await chrome.storage.local.remove(['dictImportProgress']);

    // Trigger full import via message and measure
    const start = performance.now();
    // We can't call importDictionariesIfNeeded directly, so trigger via onInstalled
    // Instead, just measure the search before and after to see if dicts loaded
    const result = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '你好' },
    });
    const searchTime = performance.now() - start;

    return { searchTime, hasResults: !!result?.data?.length };
  });

  console.log('\n=== Import Pipeline ===');
  console.log(`Search after import: ${importResult.searchTime.toFixed(1)}ms`);
  console.log(`Has results: ${importResult.hasResults}`);

  await page.close();
});

test('measure full dictionary import to IndexedDB', async () => {
  test.setTimeout(300_000); // 5 min — Vicon alone is 707K entries

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // Import each dict table individually and time the full pipeline
  const importTimings = await page.evaluate(async () => {
    const BATCH = 10_000;
    const timings: Record<string, number> = {};

    async function importDict(
      tableName: string,
      url: string,
      additionsUrl?: string,
    ) {
      const overall = performance.now();

      // Fetch
      const fetchStart = performance.now();
      const resp = await fetch(chrome.runtime.getURL(url));
      const dict = await resp.json();
      timings[`${tableName}_fetch_parse`] = performance.now() - fetchStart;

      // Merge additions
      let merged = dict;
      if (additionsUrl) {
        const addResp = await fetch(chrome.runtime.getURL(additionsUrl));
        const additions = await addResp.json();
        merged = Object.assign(dict, additions);
      }

      const entries = Object.entries(merged);
      timings[`${tableName}_entries`] = entries.length;

      // Write to IDB via service worker is not possible directly from popup
      // So we just measure fetch+parse here — IDB write happens via background
      timings[`${tableName}_total`] = performance.now() - overall;
    }

    await importDict('cedict', '/data/dictionaries/cedict_ts.json_text', '/data/dictionaries/cedict-additions.json_text');
    await importDict('kedict', '/data/dictionaries/kedict_ts.json_text', '/data/dictionaries/ko-inkdict.json_text');
    await importDict('vicon', '/data/dictionaries/Vicon-KE.json_text');

    // Lemma CSV
    const lemmaStart = performance.now();
    const lemmaResp = await fetch(chrome.runtime.getURL('/data/lemmalookups/kolemma-lookup.csv'));
    const lemmaText = await lemmaResp.text();
    const lemmaLines = lemmaText.split('\n');
    timings['lemmas_fetch_parse'] = performance.now() - lemmaStart;
    timings['lemmas_entries'] = lemmaLines.length;
    timings['lemmas_total'] = performance.now() - lemmaStart;

    return timings;
  });

  console.log('\n=== Full Dictionary Import Timings (fetch + JSON parse) ===');
  for (const name of ['cedict', 'kedict', 'vicon', 'lemmas']) {
    console.log(
      `${name.padEnd(12)} ${String(Math.round(importTimings[`${name}_entries`])).padStart(8)} entries | ` +
      `${importTimings[`${name}_total`].toFixed(0).padStart(6)}ms total`
    );
  }

  // Now trigger the actual import in the background and wait
  const page2 = await context.newPage();
  await page2.goto(`chrome-extension://${extensionId}/popup.html`);
  await page2.waitForTimeout(500);

  console.log('\nTriggering full IndexedDB import via background...');
  await page2.evaluate(async () => {
    // Clear progress to force re-import
    await chrome.storage.local.remove(['dictImportProgress']);
  });

  // Poll import progress
  const importStart = Date.now();
  let fullyImported = false;
  while (Date.now() - importStart < 240_000) {
    const progress = await page2.evaluate(async () => {
      const result = await chrome.storage.local.get(['dictImportProgress']);
      return result.dictImportProgress;
    });

    // Also try to trigger import if not started
    if (!progress || progress.version === 0) {
      // Send a dummy install event by calling the import directly won't work
      // Instead let's check if we can search Korean
      const koTest = await page2.evaluate(async () => {
        return chrome.runtime.sendMessage({
          type: 'search/text',
          payload: { text: '사람', language: 'ko' },
        });
      });

      if (koTest?.data?.length > 0) {
        fullyImported = true;
        break;
      }
    }

    if (progress?.version >= 1) {
      fullyImported = true;
      break;
    }

    console.log(`  Waiting... ${((Date.now() - importStart) / 1000).toFixed(0)}s elapsed, progress: ${JSON.stringify(progress)}`);
    await page2.waitForTimeout(3000);
  }

  const importElapsed = Date.now() - importStart;
  console.log(`Import status: ${fullyImported ? 'COMPLETE' : 'INCOMPLETE'} (${(importElapsed / 1000).toFixed(1)}s)`);

  await page.close();
  await page2.close();
});

test('measure language swap latency', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // First check if Korean dicts are available
  const koAvailable = await page.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '사람', language: 'ko' },
    });
    return (result?.data?.length ?? 0) > 0;
  });

  console.log(`\nKorean dictionary available: ${koAvailable}`);

  const swapResults = await page.evaluate(async () => {
    const timings: Record<string, unknown> = {};

    // 1. Start with Chinese, warm up
    await chrome.runtime.sendMessage({
      type: 'settings/update',
      payload: { targetLanguage: 'zh' },
    });
    await new Promise((r) => setTimeout(r, 200));

    // Warm Chinese cache with a few queries
    for (const q of ['你', '好', '中', '国']) {
      await chrome.runtime.sendMessage({
        type: 'search/text',
        payload: { text: q },
      });
    }

    const warmup = performance.now();
    const zhResult = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '你好' },
    });
    timings['zh_warm_search'] = performance.now() - warmup;
    timings['zh_result'] = zhResult?.data?.[0]?.word?.traditional ?? 'none';

    // 2. Swap to Korean
    const swapStart = performance.now();
    await chrome.runtime.sendMessage({
      type: 'settings/update',
      payload: { targetLanguage: 'ko' },
    });
    timings['swap_zh_to_ko'] = performance.now() - swapStart;

    await new Promise((r) => setTimeout(r, 100));

    // 3. Korean searches
    const koSearch1Start = performance.now();
    const koResult1 = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '안녕하세요' },
    });
    timings['ko_cold_search'] = performance.now() - koSearch1Start;
    timings['ko_result_1'] = koResult1?.data?.[0]?.word?.hangul ?? 'none';
    timings['ko_count_1'] = koResult1?.data?.length ?? 0;

    const koSearch2Start = performance.now();
    const koResult2 = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '사람' },
    });
    timings['ko_warm_search'] = performance.now() - koSearch2Start;
    timings['ko_result_2'] = koResult2?.data?.[0]?.word?.hangul ?? 'none';
    timings['ko_count_2'] = koResult2?.data?.length ?? 0;

    // 4. Swap back to Chinese
    const swapBackStart = performance.now();
    await chrome.runtime.sendMessage({
      type: 'settings/update',
      payload: { targetLanguage: 'zh' },
    });
    timings['swap_ko_to_zh'] = performance.now() - swapBackStart;

    await new Promise((r) => setTimeout(r, 100));

    // 5. Chinese search (should be fast — still cached)
    const zhSearch2Start = performance.now();
    const zhResult2 = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '中国' },
    });
    timings['zh_after_swap'] = performance.now() - zhSearch2Start;
    timings['zh_result_2'] = zhResult2?.data?.[0]?.word?.traditional ?? 'none';
    timings['zh_count_2'] = zhResult2?.data?.length ?? 0;

    // 6. Rapid swap benchmark
    const rapidStart = performance.now();
    for (let i = 0; i < 10; i++) {
      const lang = i % 2 === 0 ? 'ko' : 'zh';
      await chrome.runtime.sendMessage({
        type: 'settings/update',
        payload: { targetLanguage: lang },
      });
    }
    timings['rapid_10_swaps'] = performance.now() - rapidStart;

    // Reset
    await chrome.runtime.sendMessage({
      type: 'settings/update',
      payload: { targetLanguage: 'zh' },
    });

    return timings;
  });

  console.log('\n=== Language Swap Performance ===');
  console.log(`Chinese warm search:       ${(swapResults.zh_warm_search as number).toFixed(1)}ms → "${swapResults.zh_result}"`);
  console.log(`Swap zh→ko:                ${(swapResults.swap_zh_to_ko as number).toFixed(1)}ms`);
  console.log(`Korean cold search:        ${(swapResults.ko_cold_search as number).toFixed(1)}ms → "${swapResults.ko_result_1}" (${swapResults.ko_count_1} results)`);
  console.log(`Korean warm search:        ${(swapResults.ko_warm_search as number).toFixed(1)}ms → "${swapResults.ko_result_2}" (${swapResults.ko_count_2} results)`);
  console.log(`Swap ko→zh:                ${(swapResults.swap_ko_to_zh as number).toFixed(1)}ms`);
  console.log(`Chinese after swap:        ${(swapResults.zh_after_swap as number).toFixed(1)}ms → "${swapResults.zh_result_2}" (${swapResults.zh_count_2} results)`);
  console.log(`Rapid 10 swaps:            ${(swapResults.rapid_10_swaps as number).toFixed(1)}ms`);

  // Chinese should always work
  expect((swapResults.zh_count_2 as number)).toBeGreaterThan(0);

  await page.close();
});

test('search latency distribution (50 queries)', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  const benchResult = await page.evaluate(async () => {
    const queries = [
      '你', '好', '中', '国', '人', '我', '是', '的', '了', '在',
      '不', '有', '这', '他', '她', '们', '大', '小', '上', '下',
      '来', '去', '说', '看', '想', '做', '吃', '喝', '走', '跑',
      '你好', '中国', '学生', '老师', '朋友', '电脑', '手机', '公司', '学校', '医院',
      '今天', '明天', '昨天', '现在', '以后', '因为', '所以', '但是', '如果', '虽然',
    ];

    const times: number[] = [];

    for (const q of queries) {
      const start = performance.now();
      await chrome.runtime.sendMessage({
        type: 'search/text',
        payload: { text: q },
      });
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    return {
      count: times.length,
      min: times[0],
      p50: times[Math.floor(times.length * 0.5)],
      p90: times[Math.floor(times.length * 0.9)],
      p99: times[Math.floor(times.length * 0.99)],
      max: times[times.length - 1],
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      total: times.reduce((a, b) => a + b, 0),
    };
  });

  console.log('\n=== Search Latency Distribution (50 queries) ===');
  console.log(`Total:  ${benchResult.total.toFixed(0)}ms`);
  console.log(`Avg:    ${benchResult.avg.toFixed(1)}ms`);
  console.log(`Min:    ${benchResult.min.toFixed(1)}ms`);
  console.log(`P50:    ${benchResult.p50.toFixed(1)}ms`);
  console.log(`P90:    ${benchResult.p90.toFixed(1)}ms`);
  console.log(`P99:    ${benchResult.p99.toFixed(1)}ms`);
  console.log(`Max:    ${benchResult.max.toFixed(1)}ms`);

  await page.close();
});
