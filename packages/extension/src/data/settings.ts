import {
  TransliterationDefaults,
  TransliterationEnabledDefaults,
  TonePresets,
} from '../lib/available-languages';

const defaultLanguage: SupportedLanguages = 'zh';
const defaultCharacterType: CharacterType = 'simplified_traditional';
const defaultFontSize = 2;
const defaultDictionaryDisplay: DisplayOptions = 'icon';
const defaultHoverKeyOption: HoverKeyOptions = 'noKey';

export interface Settings {
  id: number;
  targetLanguage: SupportedLanguages;
  isEnabled?: boolean;
  isColorEnabled?: boolean;
  isDarkModeOn?: boolean;
  toneColors?: ToneColors;
  characterType?: CharacterType;
  transliteration?: TransliterationOptionsType;
  isTransliterationEnabled?: TransliterationEnabledOptionsType;
  fontSize?: number;
  lookUpDelay?: number;
  dictionaryDisplay?: DisplayOptions;
  hoverKey?: HoverKeyOptions;
}

export async function settingsGet(): Promise<Settings> {
  const result = await chrome.storage.local.get([
    'isEnabled',
    'isColorEnabled',
    'isDarkModeOn',
    'characterType',
    'targetLanguage',
    'transliteration',
    'isTransliterationEnabled',
    'fontSize',
    'lookUpDelay',
    'dictionaryDisplay',
    'hoverKey',
    'toneColors',
  ]);

  return {
    id: 1,
    isEnabled: result.isEnabled ?? true,
    isColorEnabled: result.isColorEnabled ?? true,
    isDarkModeOn: result.isDarkModeOn ?? true,
    targetLanguage: result.targetLanguage ?? defaultLanguage,
    characterType: result.characterType ?? defaultCharacterType,
    transliteration: result.transliteration ?? TransliterationDefaults,
    isTransliterationEnabled:
      result.isTransliterationEnabled ?? TransliterationEnabledDefaults,
    fontSize: result.fontSize ?? defaultFontSize,
    hoverKey: result.hoverKey ?? defaultHoverKeyOption,
    lookUpDelay: result.lookUpDelay ?? 20,
    dictionaryDisplay: result.dictionaryDisplay ?? defaultDictionaryDisplay,
    toneColors: result.toneColors ?? TonePresets.pleco,
  };
}

export async function settingsUpdate(
  input: Partial<Settings>,
): Promise<Settings> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value != null) {
      sanitized[key] = value;
    }
  }

  await chrome.storage.local.set(sanitized);
  return settingsGet();
}
