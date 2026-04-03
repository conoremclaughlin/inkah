import { test, expect, type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', 'dist', 'chrome-mv3');

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

test('popup has transliteration controls', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Transliteration');

  // Should have a transliteration type dropdown with pinyin option
  const translitSelect = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    for (const s of selects) {
      const options = Array.from(s.options).map((o) => o.value);
      if (options.includes('pinyin')) return options;
    }
    return null;
  });
  expect(translitSelect).toBeTruthy();
  expect(translitSelect).toContain('pinyin');

  await page.close();
});

test('popup has character set radio buttons (Chinese)', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Character set');

  // Should have 4 radio buttons for character type
  const radioCount = await page.locator('input[type="radio"]').count();
  expect(radioCount).toBe(4);

  // Default should be simplified_traditional
  const checkedValue = await page.evaluate(() => {
    const checked = document.querySelector(
      'input[type="radio"]:checked',
    ) as HTMLInputElement;
    return checked?.value;
  });
  expect(checkedValue).toBe('simplified_traditional');

  await page.close();
});

test('popup character set changes when switching to Korean', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  // Switch to Korean
  const langSelect = page.locator('select').first();
  await langSelect.selectOption('ko');
  await page.waitForTimeout(500);

  // Character set section should disappear for Korean
  const bodyText = await page.textContent('body');
  expect(bodyText).not.toContain('Character set');

  // Radio buttons should be gone
  const radioCount = await page.locator('input[type="radio"]').count();
  expect(radioCount).toBe(0);

  // Switch back to Chinese
  await langSelect.selectOption('zh');
  await page.waitForTimeout(300);

  await page.close();
});

test('popup has tone coloring toggle', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Tone coloring');

  await page.close();
});

test('popup has dark mode toggle', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Dark mode');

  await page.close();
});

test('popup has font size slider with labels', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Target font size');
  expect(bodyText).toContain('0.85x');
  expect(bodyText).toContain('1x');
  expect(bodyText).toContain('1.7x');

  await page.close();
});

test('popup has hover key selector', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('Hover Key');

  // Check that hover key dropdown has expected options
  const hoverKeyOptions = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    for (const s of selects) {
      const options = Array.from(s.options).map((o) => o.value);
      if (options.includes('noKey')) return options;
    }
    return null;
  });
  expect(hoverKeyOptions).toContain('ctrl');
  expect(hoverKeyOptions).toContain('shift');

  await page.close();
});

test('popup does not show version footer', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  expect(bodyText).not.toContain('v0.1.0');
  expect(bodyText).not.toContain('MV3');

  await page.close();
});

test('popup transliteration toggle changes setting', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(1000);

  // Get initial transliteration enabled state
  const initialState = await page.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({
      type: 'settings/get',
    });
    return result.data.isTransliterationEnabled?.zh;
  });

  // Toggle transliteration (it's not the first checkbox, find by context)
  // The transliteration toggle is in the Transliteration section
  const toggles = page.locator('input[type="checkbox"]');
  const count = await toggles.count();

  // Toggle the transliteration one (second or third checkbox)
  // Find the toggle near "Transliteration" text
  await page.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // The transliteration toggle should be the second one
    if (checkboxes[1]) (checkboxes[1] as HTMLInputElement).click();
  });
  await page.waitForTimeout(500);

  const newState = await page.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({
      type: 'settings/get',
    });
    return result.data.isTransliterationEnabled?.zh;
  });

  expect(newState).not.toBe(initialState);

  // Toggle back
  await page.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    if (checkboxes[1]) (checkboxes[1] as HTMLInputElement).click();
  });
  await page.waitForTimeout(300);

  await page.close();
});
