import {
  bulkGetKedict,
  bulkGetVicon,
  bulkGetLemmas,
  getVicon,
  getKedict,
} from '../data/dict-cache';
import { isCjkPunctuation } from '../lib/parse-chinese';
import { parseNewLines, hasTargetLanguage } from '../lib/parse-language';

const MAX_KOREAN_WORD_LENGTH = 12;
const MAX_PARSE_LENGTH = 250;

export class SearchKoreanUseCase {
  async parseTokens(toParse: string): Promise<WordDefinitions[] | null> {
    const configWriting = 'hangul';

    let currCursor = 0;
    let text = `${toParse}`;
    let notFoundString = '';
    let tokens: WordDefinitions[] = [];
    const toParseLength = Math.min(toParse.length, MAX_PARSE_LENGTH);

    if (
      toParseLength > MAX_PARSE_LENGTH &&
      hasTargetLanguage('ko', toParse.substring(MAX_PARSE_LENGTH))
    ) {
      return null;
    }

    while (currCursor < toParseLength) {
      const unicodeChar = toParse.charCodeAt(currCursor);

      if (isCjkPunctuation(unicodeChar)) {
        text = text.substring(1);
        currCursor += 1;
        continue;
      }

      const entries = await this.search(text);
      const longestEntry = entries?.[0];

      if (longestEntry) {
        if (notFoundString.length > 0) {
          tokens = tokens.concat(parseNewLines(notFoundString, 'ko'));
          notFoundString = '';
        }

        tokens.push(longestEntry);
        const wordText =
          (longestEntry.word as { hangul: string })[configWriting] ?? '';
        text = text.substring(wordText.length);
        currCursor += wordText.length;
      } else {
        notFoundString += text[0];
        text = text.substring(1);
        currCursor += 1;
      }
    }

    if (notFoundString.length > 0) {
      tokens = tokens.concat(parseNewLines(notFoundString, 'ko'));
    }

    return tokens;
  }

  async search(searchTerm: string): Promise<WordDefinitions[] | null> {
    if (!searchTerm) return null;

    const maxLength = Math.min(searchTerm.length, MAX_KOREAN_WORD_LENGTH);

    // Collect all candidate substrings
    const candidates: string[] = [];
    for (let i = 1; i <= maxLength; i++) {
      candidates.push(searchTerm.substring(0, i));
    }

    // Batch lookup across all three dictionaries + lemmas in parallel
    const [mainResults, viconResults, lemmaResults] = await Promise.all([
      bulkGetKedict(candidates),
      bulkGetVicon(candidates),
      bulkGetLemmas(candidates),
    ]);

    const words: (string | undefined)[][] = [];

    for (let i = 0; i < candidates.length; i++) {
      const word = candidates[i];
      const mainEntry = mainResults[i];
      const viconEntry = viconResults[i];
      const lemmaEntry = lemmaResults[i];

      const wordIndex = i;

      // Handle Vicon matches
      if (viconEntry?.value) {
        let definition = viconEntry.value as string;
        if (lemmaEntry) {
          definition = this.insertLemma(
            definition,
            lemmaEntry.base,
            word,
          );
        }

        if (!words[wordIndex]) words[wordIndex] = [];
        words[wordIndex].push(definition);
      } else if (lemmaEntry) {
        // Lemma-only: look up the base form in vicon or main
        const baseLemma = lemmaEntry.base;
        const [viconBase, mainBase] = await Promise.all([
          getVicon(baseLemma),
          getKedict(baseLemma),
        ]);

        if (viconBase?.value || mainBase?.value) {
          const baseDefinition = (viconBase?.value ??
            (Array.isArray(mainBase?.value)
              ? (mainBase!.value as string[])[0]
              : mainBase?.value)) as string;

          const newDefinition = this.insertLemma(
            baseDefinition,
            baseLemma,
            word,
          );

          if (!words[wordIndex]) words[wordIndex] = [];
          words[wordIndex].push(newDefinition);
        }
      }

      // Handle main dict matches
      if (mainEntry?.value) {
        if (!words[wordIndex]) words[wordIndex] = [];
        const val = Array.isArray(mainEntry.value)
          ? mainEntry.value
          : [mainEntry.value as string];
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

  insertLemma(definition: string, lemma: string, word: string): string {
    let newDef = definition.replace(lemma, word);
    const idx = newDef.indexOf('] /');
    if (idx !== -1) {
      newDef =
        newDef.slice(0, idx + 3) +
        `(${lemma}) ` +
        newDef.slice(idx + 3);
    }
    return newDef;
  }

  toDefinitionsFromCe(dictString: string): WordDefinitions[] | null {
    if (!dictString) return null;

    const lines = dictString.match(/[^\r\n]+/g);
    if (!lines) return null;

    const records = lines
      .filter((line) => line.match(/^#/g) == null)
      .map((line) => {
        const [hangul] = line.split(' [');

        const matches = line.match(
          /\[{1}(?<transliteration>[^\]]+)\]{1}/i,
        );
        const transliteration = matches?.groups?.transliteration ?? null;

        const definitions = [
          line.slice(line.indexOf('/') + 1, line.lastIndexOf('/')),
        ];

        return {
          word: { hangul },
          transliteration: { pinyin: transliteration ?? '' },
          definitions,
        };
      });

    // Deduplicate: merge definitions for same hangul word
    let prevRecord: WordDefinitions | undefined;
    const reducedRecords: WordDefinitions[] = [];
    for (const record of records) {
      if (
        prevRecord &&
        (prevRecord.word as { hangul: string }).hangul ===
          (record.word as { hangul: string }).hangul
      ) {
        prevRecord.definitions = prevRecord.definitions.concat(
          record.definitions,
        );
      } else {
        prevRecord = record;
        reducedRecords.push(record);
      }
    }

    return reducedRecords;
  }
}
