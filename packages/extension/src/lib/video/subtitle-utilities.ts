import type { SubtitleCue } from './types';
import { isChineseCharacter } from '../parse-chinese';
import { isKoreanLetter } from '../parse-korean';

/** Strip VTT inline markup from subtitle text */
export function getCleanSubText(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerHTML = text
    .replace(/<\d+:\d+:\d+[.\d]*>/g, '')
    .replace(/<[/]?c[^>]*>/g, '');
  return div.textContent || '';
}

/** Get active subtitles for the current video time */
export function getSubsForCurrentTime(
  cues: SubtitleCue[],
  currentTime: number,
): { activeCues: SubtitleCue[]; firstIndex: number } {
  const activeCues: SubtitleCue[] = [];
  let firstIndex = -1;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.start <= currentTime && currentTime <= cue.end) {
      if (firstIndex === -1) firstIndex = i;
      activeCues.push(cue);
    }
  }

  return { activeCues, firstIndex };
}

/** Get native subtitles that overlap with the target subtitle time range */
export function getNativeSubsForTimeRange(
  nativeCues: SubtitleCue[],
  start: number,
  end: number,
): SubtitleCue[] {
  return nativeCues.filter(
    (cue) =>
      (cue.start >= start - 2 && cue.start <= end + 2) ||
      (cue.end >= start - 2 && cue.end <= end + 2) ||
      (cue.start <= start && cue.end >= end),
  );
}

/** Tokenize subtitle text into hoverable segments based on language */
export function tokenizeSubtitle(
  text: string,
  lang: SupportedLanguages,
): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const code = text.codePointAt(i)!;
    const isCjk =
      lang === 'zh' ? isChineseCharacter(code) : isKoreanLetter(code);

    if (isCjk) {
      tokens.push(text[i]);
      i++;
    } else if (/\s/.test(text[i])) {
      let ws = '';
      while (i < text.length && /\s/.test(text[i])) {
        ws += text[i];
        i++;
      }
      tokens.push(ws);
    } else {
      let word = '';
      while (i < text.length) {
        const c = text.codePointAt(i)!;
        const nextCjk =
          lang === 'zh' ? isChineseCharacter(c) : isKoreanLetter(c);
        if (/\s/.test(text[i]) || nextCjk) break;
        word += text[i];
        i++;
      }
      if (word) tokens.push(word);
    }
  }

  return tokens;
}

/** Get forward-looking text for dictionary lookup (up to 12 chars) */
export function getLookupText(tokens: string[], fromIndex: number): string {
  let text = '';
  for (let i = fromIndex; i < tokens.length && text.length < 12; i++) {
    text += tokens[i];
  }
  return text;
}

/** Detect if page is Netflix */
export function isNetflix(): boolean {
  return window.location.hostname.includes('netflix.com');
}

/** Detect if page is YouTube */
export function isYouTube(): boolean {
  return window.location.hostname.includes('youtube.com');
}

/** Detect source type from current URL */
export function detectSourceType(): SourceOptions {
  if (isNetflix()) return 'netflix';
  if (isYouTube()) return 'youtube';
  return 'others';
}
