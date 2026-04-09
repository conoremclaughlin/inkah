import type { SubtitleCue } from './types';

/** Parse a time string like "00:01:23.456" into seconds */
function parseTime(str: string): number {
  const parts = str.trim().split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m) * 60 + parseFloat(s);
  }
  return parseFloat(str);
}

/** Strip VTT inline tags like <c>, </c>, <00:01:23.456> */
function cleanVttText(text: string): string {
  return text
    .replace(/<\d+:\d+:\d+[.\d]*>/g, '')
    .replace(/<[/]?c[^>]*>/g, '')
    .replace(/<[/]?[a-z][^>]*>/g, '')
    .trim();
}

/** Parse WebVTT text into SubtitleCue array */
export function parseVtt(vtt: string): SubtitleCue[] {
  if (!vtt || !vtt.trim()) return [];

  const cues: SubtitleCue[] = [];
  const blocks = vtt.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let timingLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timingLine = i;
        break;
      }
    }

    if (timingLine === -1) continue;

    const timingParts = lines[timingLine].split('-->');
    if (timingParts.length < 2) continue;
    const startStr = timingParts[0].trim();
    const endRaw = timingParts[1].trim();

    const start = parseTime(startStr);
    // End time may have position settings after it: "00:00:03.000 position:10%"
    const end = parseTime(endRaw.split(/\s+/)[0]);

    const textLines = lines.slice(timingLine + 1);
    const text = cleanVttText(textLines.join('\n'));

    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues;
}
