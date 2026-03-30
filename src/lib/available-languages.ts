export const TransliterationDefaults: TransliterationOptionsType = {
  zh: 'pinyin',
  ko: 'revisedRomanization',
};

export const TransliterationEnabledDefaults: TransliterationEnabledOptionsType =
  {
    zh: true,
    ko: false,
  };

export const TonePresets = {
  pleco: {
    light: {
      firstTone: '#e30000',
      secondTone: '#01b31c',
      thirdTone: '#150ff0',
      fourthTone: '#8800bf',
      fifthTone: '#777777',
    },
    dark: {
      firstTone: '#ff8080',
      secondTone: '#80ff80',
      thirdTone: '#8080ff',
      fourthTone: '#df80ff',
      fifthTone: '#c7c7c7',
    },
  },
  nathan: {
    light: {
      firstTone: '#f41d2f',
      secondTone: '#f9761b',
      thirdTone: '#97cd5d',
      fourthTone: '#589bc8',
      fifthTone: '#000000',
    },
    dark: {
      firstTone: '#ff8080',
      secondTone: '#f9761b',
      thirdTone: '#97cd5d',
      fourthTone: '#589bc8',
      fifthTone: '#c7c7c7',
    },
  },
  mdbg: {
    light: {
      firstTone: '#ff0000',
      secondTone: '#d89000',
      thirdTone: '#00a000',
      fourthTone: '#0000ff',
      fifthTone: '#000000',
    },
    dark: {
      firstTone: '#ff8080',
      secondTone: '#d89000',
      thirdTone: '#00a000',
      fourthTone: '#8080ff',
      fifthTone: '#c7c7c7',
    },
  },
  hanping: {
    light: {
      firstTone: '#64b4ff',
      secondTone: '#30B030',
      thirdTone: '#f08000',
      fourthTone: '#d00020',
      fifthTone: '#a0a0a0',
    },
    dark: {
      firstTone: '#64b4ff',
      secondTone: '#30b030',
      thirdTone: '#f08000',
      fourthTone: '#ff8080',
      fifthTone: '#c7c7c7',
    },
  },
};

export interface DictionaryConfig {
  name: string;
  file: string;
  additions?: string;
  vicon?: string;
  dict: string;
}

export interface LanguageConfig {
  name: string;
  dictionaries: {
    en: DictionaryConfig;
  };
  transliteration: Record<string, string>;
  lemmas?: string;
  tags?: string;
}

const AvailableLanguages: Record<SupportedLanguages, LanguageConfig> = {
  zh: {
    name: 'Chinese',
    dictionaries: {
      en: {
        name: 'English',
        file: 'cedict_ts.json_text',
        additions: 'cedict-additions.json_text',
        dict: 'zh/cedict',
      },
    },
    transliteration: {
      pinyin: 'Hanyu Pinyin',
      zhuyin: 'Zhuyin / Bopomofo',
    },
    tags: 'tags-zh.csv',
  },
  ko: {
    name: 'Korean',
    dictionaries: {
      en: {
        name: 'English',
        file: 'kedict_ts.json_text',
        additions: 'ko-inkdict.json_text',
        vicon: 'Vicon-KE.json_text',
        dict: 'ko/kedict',
      },
    },
    transliteration: {
      revisedRomanization: 'Revised Romanization',
    },
    lemmas: 'kolemma-lookup.csv',
    tags: 'tags-ko.csv',
  },
};

export default AvailableLanguages;
