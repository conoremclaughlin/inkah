export interface IHangulConversionSystem {
  vowels: string[];
  consonants: {
    initial: string[];
    final: string[];
  };
}

export function isKoreanLetter(uni: number): boolean {
  return (
    !isNaN(uni) &&
    ((uni >= 0xac00 && 0xd7af >= uni) ||
      (uni >= 0x1100 && 0x11ff >= uni) ||
      (uni >= 0x3130 && 0x318f >= uni) ||
      (uni >= 0xa960 && 0xa97f >= uni) ||
      (uni >= 0xd7b0 && 0xd7ff >= uni))
  );
}

export const RevisedRomanizationKorean: IHangulConversionSystem = {
  vowels: [
    'a', 'ae', 'ya', 'yee', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
    'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
  ],
  consonants: {
    initial: [
      'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss',
      '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
    ],
    final: [
      '', 'k', 'k', 'kt', 'n', 'nt', 'nh', 't', 'l', 'lk', 'lm',
      'lp', 'lt', 'lt', 'lp', 'lh', 'm', 'p', 'pt', 't', 'tt',
      'ng', 't', 't', 'k', 't', 'p', 'h',
    ],
  },
};

const UNICODE_OFFSET = 44032;
const UNICODE_MAX = 55215;

export function romanizeChar(char: string, _isFirst: boolean): string {
  const charCode = char.charCodeAt(0);
  const isHangul = charCode >= UNICODE_OFFSET && charCode < UNICODE_MAX;
  if (!isHangul) return char;

  let unicodeOffset = charCode - UNICODE_OFFSET;
  const trailerOffset =
    unicodeOffset % RevisedRomanizationKorean.consonants.final.length;
  unicodeOffset -= trailerOffset;
  unicodeOffset /= RevisedRomanizationKorean.consonants.final.length;
  const vowelOffset = unicodeOffset % RevisedRomanizationKorean.vowels.length;
  unicodeOffset -= vowelOffset;
  unicodeOffset /= RevisedRomanizationKorean.vowels.length;
  const leadOffset = unicodeOffset;

  return (
    RevisedRomanizationKorean.consonants.initial[leadOffset] +
    RevisedRomanizationKorean.vowels[vowelOffset] +
    RevisedRomanizationKorean.consonants.final[trailerOffset]
  );
}

export function toRomanizationFromHangul(text: string): string {
  return Array.from(text)
    .map((char, index) => romanizeChar(char, index === 0))
    .join('-');
}

export function toRomanizationFromHangulAndOtherText(text: string): string {
  return Array.from(text)
    .map((char, index) => romanizeChar(char, index === 0))
    .join('');
}
