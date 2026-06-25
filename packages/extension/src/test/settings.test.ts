import { describe, it, expect, beforeEach } from 'vitest';
import { settingsGet, settingsUpdate } from '../data/settings';
import { TonePresets } from '../lib/available-languages';

describe('settingsGet', () => {
  beforeEach(async () => {
    // Clear storage between tests
    await chrome.storage.local.set({});
  });

  it('should return defaults when storage is empty', async () => {
    const settings = await settingsGet();
    expect(settings.targetLanguage).toBe('zh');
    expect(settings.isEnabled).toBe(true);
    expect(settings.isColorEnabled).toBe(true);
    expect(settings.isDarkModeOn).toBe(true);
    expect(settings.characterType).toBe('simplified_traditional');
    expect(settings.fontSize).toBe(2);
    expect(settings.lookUpDelay).toBe(20);
    expect(settings.hoverKey).toBe('noKey');
    expect(settings.dictionaryDisplay).toBe('icon');
  });

  it('should return default transliteration settings', async () => {
    const settings = await settingsGet();
    expect(settings.transliteration?.zh).toBe('pinyin');
    expect(settings.transliteration?.ko).toBe('revisedRomanization');
    expect(settings.isTransliterationEnabled?.zh).toBe(true);
    expect(settings.isTransliterationEnabled?.ko).toBe(false);
  });

  it('should return default tone colors (pleco)', async () => {
    const settings = await settingsGet();
    expect(settings.toneColors).toEqual(TonePresets.pleco);
  });
});

describe('settingsUpdate', () => {
  beforeEach(async () => {
    // Clear storage
    await chrome.storage.local.set({});
  });

  it('should update a single setting', async () => {
    const updated = await settingsUpdate({ targetLanguage: 'ko' });
    expect(updated.targetLanguage).toBe('ko');
    // Other defaults should still be there
    expect(updated.isEnabled).toBe(true);
  });

  it('should update dark mode', async () => {
    const updated = await settingsUpdate({ isDarkModeOn: false });
    expect(updated.isDarkModeOn).toBe(false);
  });

  it('should update tone colors', async () => {
    const updated = await settingsUpdate({
      toneColors: TonePresets.mdbg,
    });
    expect(updated.toneColors).toEqual(TonePresets.mdbg);
  });

  it('should update character type', async () => {
    const updated = await settingsUpdate({
      characterType: 'traditional',
    });
    expect(updated.characterType).toBe('traditional');
  });

  it('should update transliteration settings', async () => {
    const updated = await settingsUpdate({
      transliteration: { zh: 'zhuyin', ko: 'revisedRomanization' },
    });
    expect(updated.transliteration?.zh).toBe('zhuyin');
  });

  it('should update transliteration enabled', async () => {
    const updated = await settingsUpdate({
      isTransliterationEnabled: { zh: false, ko: true },
    });
    expect(updated.isTransliterationEnabled?.zh).toBe(false);
    expect(updated.isTransliterationEnabled?.ko).toBe(true);
  });

  it('should not persist null values', async () => {
    await settingsUpdate({ targetLanguage: 'ko' });
    const updated = await settingsUpdate({
      isDarkModeOn: false,
      targetLanguage: undefined as any,
    });
    // targetLanguage should still be 'ko' from previous update
    expect(updated.targetLanguage).toBe('ko');
    expect(updated.isDarkModeOn).toBe(false);
  });
});
