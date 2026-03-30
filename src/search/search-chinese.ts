import { bulkGetCedict } from '../data/dict-cache';
import { parseNewLines, hasTargetLanguage } from '../lib/parse-language';

const MAX_CHINESE_WORD_LENGTH = 8;
const MAX_PARSE_LENGTH = 250;

export class SearchChineseUseCase {
  async parseTokens(toParse: string): Promise<WordDefinitions[] | null> {
    const configWriting = 'traditional';

    let currCursor = 0;
    let text = `${toParse}`;
    let notFoundString = '';
    let tokens: WordDefinitions[] = [];
    const toParseLength = Math.min(toParse.length, MAX_PARSE_LENGTH);

    if (
      toParseLength > MAX_PARSE_LENGTH &&
      hasTargetLanguage('zh', toParse.substring(MAX_PARSE_LENGTH))
    ) {
      return null;
    }

    while (currCursor < toParseLength) {
      const entries = await this.search(text);
      const longestEntry = entries?.[0];

      if (longestEntry) {
        if (notFoundString.length > 0) {
          tokens = tokens.concat(parseNewLines(notFoundString, 'zh'));
          notFoundString = '';
        }

        tokens.push(longestEntry);
        const wordText =
          (longestEntry.word as { traditional: string })[configWriting] ?? '';
        text = text.substring(wordText.length);
        currCursor += wordText.length;
      } else {
        notFoundString += text[0];
        text = text.substring(1);
        currCursor += 1;
      }
    }

    if (notFoundString.length > 0) {
      tokens = tokens.concat(parseNewLines(notFoundString, 'zh'));
    }

    return tokens;
  }

  async search(searchTerm: string): Promise<WordDefinitions[] | null> {
    if (!searchTerm) return null;

    const maxLength = Math.min(searchTerm.length, MAX_CHINESE_WORD_LENGTH);

    // Collect all candidate substrings and batch lookup
    const candidates: string[] = [];
    for (let i = 1; i <= maxLength; i++) {
      candidates.push(searchTerm.substring(0, i));
    }

    const results = await bulkGetCedict(candidates);

    // Build sparse array of definitions by word length
    const words: (string | undefined)[][] = [];
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry?.value) {
        const wordIndex = i; // 0-indexed = wordLength - 1
        if (!words[wordIndex]) words[wordIndex] = [];
        const val = Array.isArray(entry.value)
          ? entry.value
          : [entry.value as string];
        words[wordIndex] = words[wordIndex].concat(val);
      }
    }

    // Reverse so longest matches come first
    const block: string[] = [];
    words.reverse().forEach((wordDefinitions) => {
      if (wordDefinitions) {
        block.push(...(wordDefinitions as string[]));
      }
    });

    if (block.length === 0) return null;
    return this.toDefinitionsFromCe(block.join('\n'));
  }

  toDefinitionsFromCe(dictString: string): WordDefinitions[] | null {
    if (!dictString) return null;

    const lines = dictString.match(/[^\r\n]+/g);
    if (!lines) return null;

    return lines
      .filter((line) => line.match(/^#/g) == null)
      .map((line) => {
        const [traditional, simplified] = line.split(' ');

        const matches = line.match(
          /\[{1}(?<transliteration>[^\]]+)\]{1}/i,
        );
        const transliteration = matches?.groups?.transliteration ?? null;

        const parts = line.split('/');
        const definitions = parts.slice(1, parts.length - 1);

        return {
          word: { traditional, simplified },
          transliteration: { pinyin: transliteration ?? '' },
          definitions,
        };
      });
  }
}
