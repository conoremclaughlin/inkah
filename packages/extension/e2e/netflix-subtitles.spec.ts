import { test, expect, type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', 'dist', 'chrome-mv3');

let context: BrowserContext;
let extensionId: string;

test.setTimeout(120_000);

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
  await new Promise((r) => setTimeout(r, 3000));
});

test.afterAll(async () => {
  await context?.close();
});

test('content script injects Netflix subtitle service on netflix.com', async () => {
  const page = await context.newPage();
  await page.goto('https://www.netflix.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check that the injected script set up the inkah global
  const hasInkahGlobal = await page.evaluate(() => {
    return typeof (window as any).inkah !== 'undefined';
  });

  console.log('Netflix page loaded, inkah global present:', hasInkahGlobal);

  // Check that the subtitle hiding CSS was injected
  const hasSubtitleStyles = await page.evaluate(() => {
    const styles = document.querySelectorAll('style');
    for (const style of styles) {
      if (style.textContent?.includes('inkahsubs')) return true;
    }
    return false;
  });

  console.log('Subtitle styles injected:', hasSubtitleStyles);
  expect(hasSubtitleStyles).toBe(true);

  await page.close();
});

test('Netflix login flow works', async () => {
  const page = await context.newPage();
  await page.goto('https://www.netflix.com/login', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);

  // Check if already logged in
  const url = page.url();
  if (url.includes('browse') || url.includes('watch')) {
    console.log('Already logged in to Netflix');
    await page.close();
    return;
  }

  // Fill login form
  const emailInput = page.locator(
    'input[name="userLoginId"], input[data-uia="login-field"]',
  );
  const passwordInput = page.locator(
    'input[name="password"], input[data-uia="password-field"]',
  );

  if ((await emailInput.count()) > 0) {
    const email = process.env.NETFLIX_EMAIL;
    const password = process.env.NETFLIX_PASSWORD;
    if (!email || !password) {
      console.log('Skipping Netflix login — set NETFLIX_EMAIL and NETFLIX_PASSWORD env vars');
      await page.close();
      return;
    }
    await emailInput.fill(email);
    await passwordInput.fill(password);

    const loginBtn = page.locator(
      'button[data-uia="login-submit-button"], button[type="submit"]',
    );
    await loginBtn.click();
    await page.waitForTimeout(5000);

    const afterUrl = page.url();
    console.log('After login URL:', afterUrl);
    expect(
      afterUrl.includes('browse') ||
        afterUrl.includes('watch') ||
        afterUrl.includes('profile'),
    ).toBe(true);
  }

  await page.close();
});

test('YouTube content script initializes on youtube.com', async () => {
  const page = await context.newPage();
  await page.goto('https://www.youtube.com', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);

  // Check that subtitle styles were injected
  const hasSubtitleStyles = await page.evaluate(() => {
    const styles = document.querySelectorAll('style');
    for (const style of styles) {
      if (style.textContent?.includes('inkahsubs')) return true;
    }
    return false;
  });

  console.log('YouTube subtitle styles injected:', hasSubtitleStyles);
  expect(hasSubtitleStyles).toBe(true);

  await page.close();
});
