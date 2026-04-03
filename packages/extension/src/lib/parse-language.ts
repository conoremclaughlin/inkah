import { isChineseCharacter } from './parse-chinese';
import { isKoreanLetter } from './parse-korean';

export const isLanguageFunctions: Record<
  SupportedLanguages,
  (uni: number) => boolean
> = {
  zh: isChineseCharacter,
  ko: isKoreanLetter,
};

export const getScript = (
  targetLanguage: SupportedLanguages,
  configWriting?: CharacterType,
): SupportedScripts => {
  if (targetLanguage === 'ko') {
    return 'hangul';
  }
  if (configWriting) {
    switch (configWriting) {
      case 'traditional_simplified':
      case 'traditional':
        return 'traditional';
      case 'simplified_traditional':
      case 'simplified':
      default:
        return 'simplified';
    }
  }
  return 'traditional';
};

export function hasTargetLanguage(
  targetLanguage: SupportedLanguages,
  text: string | null,
): boolean {
  if (!text) return false;

  for (let i = 0; i < text.length; i++) {
    const unicodeCodePoint = text.codePointAt(i);
    if (unicodeCodePoint == null) continue;
    if (isLanguageFunctions[targetLanguage](unicodeCodePoint)) {
      return true;
    }
  }

  return false;
}

export function parseNewLines(
  textToParse: string,
  language: SupportedLanguages,
): WordDefinitions[] {
  const tokens: WordDefinitions[] = [];

  const makeWord = (text: string): InWrittenWord => {
    return language === 'zh'
      ? { traditional: text, simplified: text }
      : { hangul: text };
  };

  if (textToParse.match(/\n/)) {
    const splitToken = textToParse.split(/(\n)/);
    for (const miniToken of splitToken) {
      tokens.push({
        word: makeWord(miniToken),
        transliteration: { pinyin: '' },
        definitions: [],
      });
    }
  } else {
    tokens.push({
      word: makeWord(textToParse),
      transliteration: { pinyin: '' },
      definitions: [],
    });
  }
  return tokens;
}
