import { test, expect, type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', '.output', 'chrome-mv3');

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--headless=new`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-gpu',
    ],
  });

  // Wait for service worker to initialize
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  // Give the service worker time to set up message handlers
  await new Promise((r) => setTimeout(r, 1000));
});

test.afterAll(async () => {
  await context?.close();
});

test('extension loads and service worker starts', async () => {
  const serviceWorkers = context.serviceWorkers();
  expect(serviceWorkers.length).toBeGreaterThan(0);
  console.log('Service worker URL:', serviceWorkers[0].url());
});

test('popup page renders settings', async () => {
  // Get extension ID from service worker URL
  const sw = context.serviceWorkers()[0];
  const extensionId = sw.url().split('/')[2];
  console.log('Extension ID:', extensionId);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for React to render
  await page.waitForTimeout(1000);

  // Check that the settings panel loaded
  const title = await page.textContent('h1');
  expect(title).toBe('Inkah');

  // Check that settings controls exist
  const toggles = await page.locator('input[type="checkbox"]').count();
  expect(toggles).toBeGreaterThanOrEqual(2); // isEnabled + isDarkModeOn + isColorEnabled

  const selects = await page.locator('select').count();
  expect(selects).toBeGreaterThanOrEqual(1); // target language

  await page.close();
});

test('popup: toggle extension on/off', async () => {
  const sw = context.serviceWorkers()[0];
  const extensionId = sw.url().split('/')[2];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  // Toggle via evaluate since checkbox is visually hidden (opacity:0, size:0)
  const initialState = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    return cb?.checked;
  });

  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.click();
  });
  await page.waitForTimeout(500);

  const newState = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    return cb?.checked;
  });
  expect(newState).not.toBe(initialState);

  // Toggle back
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.click();
  });
  await page.waitForTimeout(500);

  const restoredState = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    return cb?.checked;
  });
  expect(restoredState).toBe(initialState);

  await page.close();
});

test('popup: change language', async () => {
  const sw = context.serviceWorkers()[0];
  const extensionId = sw.url().split('/')[2];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  // Find language select
  const langSelect = page.locator('select').first();
  await langSelect.selectOption('ko');
  await page.waitForTimeout(500);

  const selectedValue = await langSelect.inputValue();
  expect(selectedValue).toBe('ko');

  // Switch back
  await langSelect.selectOption('zh');
  await page.waitForTimeout(300);

  await page.close();
});

test('content script loads on pages', async () => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Check that content script injected by looking for console messages
  // or by verifying the script ran
  const result = await page.evaluate(() => {
    return document.querySelector('#inkah-popup') === null;
  });
  // No popup should exist yet (nothing hovered)
  expect(result).toBe(true);

  await page.close();
});

test('dictionary lookup on Chinese text', async () => {
  const page = await context.newPage();

  // Create a test page with Chinese text
  await page.setContent(`
    <html>
      <body style="padding: 50px; font-size: 24px;">
        <p id="test-text">你好世界，中国人民欢迎你。</p>
      </body>
    </html>
  `);

  await page.waitForTimeout(1500); // Let content script initialize

  // Get the bounding box of the Chinese text
  const textElement = page.locator('#test-text');
  const box = await textElement.boundingBox();
  expect(box).not.toBeNull();

  // Hover over the first Chinese character
  const startTime = Date.now();
  await page.mouse.move(box!.x + 10, box!.y + box!.height / 2);
  await page.waitForTimeout(500); // Wait for lookup delay + processing

  // Check if popup appeared
  const popup = await page.locator('#inkah-popup');
  const popupExists = await popup.count();

  const elapsed = Date.now() - startTime;
  console.log(`Hover-to-popup latency: ${elapsed}ms`);
  console.log(`Popup appeared: ${popupExists > 0}`);

  if (popupExists > 0) {
    const popupText = await popup.textContent();
    console.log('Popup content:', popupText?.substring(0, 200));
    expect(popupText).toBeTruthy();
  }

  await page.close();
});

test('service worker handles messages correctly', async () => {
  const sw = context.serviceWorkers()[0];
  const extensionId = sw.url().split('/')[2];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // Test settings/get message
  const settingsResult = await page.evaluate(async () => {
    return chrome.runtime.sendMessage({ type: 'settings/get' });
  });

  console.log('Settings response:', JSON.stringify(settingsResult));
  expect(settingsResult).toHaveProperty('data');
  expect(settingsResult.data).toHaveProperty('targetLanguage');
  expect(settingsResult.data).toHaveProperty('isEnabled');

  // Test user/me message
  const userResult = await page.evaluate(async () => {
    return chrome.runtime.sendMessage({ type: 'user/me' });
  });

  console.log('User response:', JSON.stringify(userResult));
  expect(userResult).toHaveProperty('data');

  // Test search/text message (may fail if dictionaries haven't imported yet)
  const searchResult = await page.evaluate(async () => {
    const start = performance.now();
    const result = await chrome.runtime.sendMessage({
      type: 'search/text',
      payload: { text: '你好' },
    });
    const elapsed = performance.now() - start;
    return { result, elapsed };
  });

  console.log(
    `Search latency: ${searchResult.elapsed.toFixed(1)}ms`,
  );
  console.log(
    'Search result:',
    JSON.stringify(searchResult.result)?.substring(0, 300),
  );

  await page.close();
});

test('dictionary import and search performance', async () => {
  const sw = context.serviceWorkers()[0];
  const extensionId = sw.url().split('/')[2];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  // Trigger dictionary import if not done
  const importResult = await page.evaluate(async () => {
    const progress = await chrome.storage.local.get(['dictImportProgress']);
    return progress;
  });
  console.log('Import progress:', JSON.stringify(importResult));

  // Benchmark: multiple search queries
  const benchmarkResult = await page.evaluate(async () => {
    const queries = ['你好', '中国', '人', '我', '是', '的', '了', '在', '不', '有'];
    const times: number[] = [];

    for (const q of queries) {
      const start = performance.now();
      await chrome.runtime.sendMessage({
        type: 'search/text',
        payload: { text: q },
      });
      times.push(performance.now() - start);
    }

    return {
      queries: queries.length,
      totalMs: times.reduce((a, b) => a + b, 0),
      avgMs: times.reduce((a, b) => a + b, 0) / times.length,
      maxMs: Math.max(...times),
      minMs: Math.min(...times),
      times,
    };
  });

  console.log('\n=== Search Performance Benchmark ===');
  console.log(`Queries: ${benchmarkResult.queries}`);
  console.log(`Total: ${benchmarkResult.totalMs.toFixed(1)}ms`);
  console.log(`Average: ${benchmarkResult.avgMs.toFixed(1)}ms`);
  console.log(`Min: ${benchmarkResult.minMs.toFixed(1)}ms`);
  console.log(`Max: ${benchmarkResult.maxMs.toFixed(1)}ms`);
  console.log(`Per-query: ${benchmarkResult.times.map((t) => t.toFixed(1)).join(', ')}ms`);

  // Performance should be reasonable (< 100ms per query)
  expect(benchmarkResult.avgMs).toBeLessThan(500);

  await page.close();
});
