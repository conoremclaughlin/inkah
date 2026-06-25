type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> }[keyof T];
type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>;

type SupportedLanguages = 'zh' | 'ko';
type SupportedScripts = 'simplified' | 'traditional' | 'hangul';
type HoverKeyOptions = 'noKey' | 'ctrl' | 'option' | 'command' | 'shift';
type SourceOptions = 'netflix' | 'youtube' | 'others';
type SourceQueryOptions = 'all' | SourceOptions;

type zhTransliteration = 'pinyin' | 'zhuyin';
type koTransliteration = 'revisedRomanization';
type AllTransliterations = zhTransliteration | koTransliteration;

type TransliterationOptionsType = {
  zh: zhTransliteration;
  ko: koTransliteration;
};

type TransliterationEnabledOptionsType = {
  zh: boolean;
  ko: boolean;
};

type CharacterType =
  | 'simplified_traditional'
  | 'traditional_simplified'
  | 'simplified'
  | 'traditional';

interface Transliteration {
  pinyin: string;
}

type DisplayOptions = 'icon' | 'auto';

interface InFullWrittenWord {
  hangul: string;
  traditional: string;
  simplified: string;
}

type InWrittenWord =
  | AtLeast<InFullWrittenWord, 'hangul'>
  | AtLeast<InFullWrittenWord, 'traditional' | 'simplified'>;

interface WordDefinitions {
  word: InWrittenWord;
  sentence?: InWrittenWord;
  transliteration: Transliteration;
  definitions: string[];
}

interface ToneTheme {
  firstTone: string;
  secondTone: string;
  thirdTone: string;
  fourthTone: string;
  fifthTone: string;
}

interface ToneColors {
  light: ToneTheme;
  dark: ToneTheme;
}
