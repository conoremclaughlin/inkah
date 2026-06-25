import { describe, it, expect } from 'vitest';
import { parseVtt } from '../lib/video/vtt-parser';

describe('parseVtt', () => {
  it('should parse basic VTT', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Hello world

2
00:00:04.000 --> 00:00:06.000
Second subtitle`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3, text: 'Hello world' });
    expect(cues[1]).toEqual({ start: 4, end: 6, text: 'Second subtitle' });
  });

  it('should handle HH:MM:SS.mmm format', () => {
    const vtt = `WEBVTT

00:01:30.500 --> 00:01:33.200
Test`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBeCloseTo(90.5);
    expect(cues[0].end).toBeCloseTo(93.2);
  });

  it('should strip VTT inline tags', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<00:00:01.000><c>你好</c><00:00:02.000><c>世界</c>`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('你好世界');
  });

  it('should return empty array for empty input', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT')).toEqual([]);
  });

  it('should handle position settings after time', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000 position:10% line:0
Positioned subtitle`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].end).toBeCloseTo(3);
    expect(cues[0].text).toBe('Positioned subtitle');
  });

  it('should handle Chinese subtitles', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
我是中国人

00:00:04.000 --> 00:00:06.000
你好吗`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('我是中国人');
    expect(cues[1].text).toBe('你好吗');
  });

  it('should handle multi-line subtitles', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Line one
Line two`;

    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Line one\nLine two');
  });
});
