/**
 * @vitest-environment happy-dom
 * @vitest-environment-options {"url": "https://www.netflix.com/watch/81170259"}
 *
 * Behavior-pinning tests for the video subtitle controller.
 *
 * These drive the controller only through its public surface — start(),
 * window events, and clicks on its own settings UI — and assert on DOM
 * output. They exist so refactors can prove the render pipeline's
 * input/output is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoController } from '../lib/video/video-controller';
import type { SubtitleCue, VideoService } from '../lib/video/types';
import type { Settings } from '../data/settings';

const ZH_CUES: SubtitleCue[] = [
  { start: 0, end: 5, text: '我只要汪星人' },
  { start: 6, end: 9, text: '挡我者死' },
];
const EN_CUES: SubtitleCue[] = [
  { start: 0, end: 5, text: 'I only want the dog-star leader' },
];

function makeService(overrides: Partial<VideoService> = {}): VideoService {
  return {
    init: () => {},
    getSubs: vi.fn(async (lang: string) => {
      if (lang.startsWith('zh')) return ZH_CUES;
      if (lang.startsWith('en')) return EN_CUES;
      return [];
    }),
    findVideo: () => document.querySelector('video'),
    getAvailableLanguages: () => ['zh-Hans', 'en'],
    ...overrides,
  };
}

const SETTINGS: Settings = { id: 1, targetLanguage: 'zh' };

function makeController(service: VideoService): VideoController {
  return new VideoController(service, SETTINGS, {
    lookup: vi.fn(async () => null),
    showPopup: vi.fn(),
    removePopup: vi.fn(),
    precacheSubtitle: vi.fn(() => Promise.resolve()),
    getTransliterationForText: vi.fn(() => new Map<number, string>()),
  });
}

/** Poll until `cond` is truthy or `ms` elapses (lets rAF/microtasks run). */
async function waitFor(cond: () => boolean, ms = 1000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return cond();
}

function dispatchSubtitleChange(language: string) {
  window.dispatchEvent(
    new CustomEvent('inkahsubsSubtitlesChanged', { detail: { language } }),
  );
}

/** Find a settings toggle row by its label text and click it. */
function clickToggle(label: string) {
  const rows = document.querySelectorAll('.inkahsubs-label');
  for (const row of rows) {
    if (row.textContent?.includes(label)) {
      (row.querySelector('.toggle') as HTMLElement).click();
      return;
    }
  }
  throw new Error(`Toggle not found: ${label}`);
}

describe('VideoController (Netflix DOM)', () => {
  let controller: VideoController;

  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = `
      <div class="watch-video">
        <video></video>
        <div class="controls">
          <div class="wrapper">
            <button data-uia="control-fullscreen-enter"></button>
          </div>
        </div>
      </div>`;
  });

  afterEach(() => {
    controller?.stop();
    document.body.innerHTML = '';
  });

  it('mounts the overlay and renders tokenized subtitle words with background', async () => {
    controller = makeController(makeService());
    await controller.start();
    dispatchSubtitleChange('zh-Hans');

    expect(await waitFor(() => !!document.getElementById('inkahsubs'))).toBe(true);
    expect(
      document.documentElement.classList.contains('inkahsubs-enable'),
    ).toBe(true);
    expect(
      document.documentElement.classList.contains('inkahsubs-active'),
    ).toBe(true);

    // The rAF tick renders the cue active at currentTime 0
    expect(
      await waitFor(
        () => document.querySelectorAll('#inkahsubs .inkahsubs-word').length > 0,
      ),
    ).toBe(true);

    // Character-by-character tokenization for zh
    const words = document.querySelectorAll('#inkahsubs .inkahsubs-word');
    expect(words.length).toBe('我只要汪星人'.length);
    expect(words[0].textContent).toBe('我');

    // Subtitle background class applied by default
    expect(
      document.querySelector(
        '#inkahsubs .inkahsubs-subtitles__sub.inkahsubs-show-subtitles-background',
      ),
    ).not.toBeNull();
  });

  it('does NOT set inkahsubs-active when no cues are available (native subs fail-safe)', async () => {
    controller = makeController(
      makeService({ getSubs: vi.fn(async () => []) }),
    );
    await controller.start();
    dispatchSubtitleChange('zh-Hans');

    await new Promise((r) => setTimeout(r, 100));
    expect(
      document.documentElement.classList.contains('inkahsubs-active'),
    ).toBe(false);
    // Enabled (extension on) but not active (nothing rendering) —
    // native subtitle hiding CSS requires BOTH classes
    expect(
      document.documentElement.classList.contains('inkahsubs-enable'),
    ).toBe(true);
  });

  it('mounts into a video ancestor when Netflix renames the container class', async () => {
    document.body.innerHTML = `
      <div class="totally-new-netflix-container">
        <div><video></video></div>
      </div>`;
    controller = makeController(makeService());
    await controller.start();
    dispatchSubtitleChange('zh-Hans');

    expect(await waitFor(() => !!document.getElementById('inkahsubs'))).toBe(true);
  });

  it('renders the native-language line dynamically when double subtitles are toggled on', async () => {
    controller = makeController(makeService());
    await controller.start();
    dispatchSubtitleChange('zh-Hans');
    await waitFor(
      () => document.querySelectorAll('#inkahsubs .inkahsubs-word').length > 0,
    );

    expect(document.querySelector('.inkahsubs-native-line')).toBeNull();

    clickToggle('Show double subtitles');

    expect(
      await waitFor(() => !!document.querySelector('.inkahsubs-native-line')),
    ).toBe(true);
    expect(
      document.querySelector('.inkahsubs-native-line')!.textContent,
    ).toContain('I only want the dog-star leader');
  });

  it('re-mounts the right panel after the host page rebuilds its DOM (SPA)', async () => {
    controller = makeController(makeService());
    await controller.start();
    dispatchSubtitleChange('zh-Hans');
    await waitFor(() => !!document.getElementById('inkahsubs'));

    clickToggle('Show right panel');
    expect(
      await waitFor(() => !!document.getElementById('inRightPanel')),
    ).toBe(true);

    // Simulate the SPA destroying the panel's parent DOM
    document.getElementById('inRightPanel')!.remove();

    clickToggle('Show right panel'); // off
    clickToggle('Show right panel'); // on again
    expect(
      await waitFor(() => {
        const panel = document.getElementById('inRightPanel');
        return !!panel && panel.isConnected;
      }),
    ).toBe(true);
  });

  it('clears enable/active classes on stop()', async () => {
    controller = makeController(makeService());
    await controller.start();
    dispatchSubtitleChange('zh-Hans');
    await waitFor(() =>
      document.documentElement.classList.contains('inkahsubs-active'),
    );

    controller.stop();
    expect(
      document.documentElement.classList.contains('inkahsubs-enable'),
    ).toBe(false);
    expect(
      document.documentElement.classList.contains('inkahsubs-active'),
    ).toBe(false);
  });
});
