/**
 * @vitest-environment happy-dom
 * @vitest-environment-options {"url": "https://www.netflix.com/watch/12345"}
 *
 * Pins NetflixService manifest parsing for BOTH manifest generations.
 * Netflix renames these fields periodically (timedtexttracks→textTracks,
 * ttDownloadables→downloadables, urls map→array) — August 2026 rename
 * silently killed all subtitle acquisition. Both shapes must keep working.
 */
import { describe, it, expect } from 'vitest';
import { NetflixService } from '../lib/video/netflix-service';

const WEBVTT = 'webvtt-lssdh-ios8';

function dispatchManifest(detail: object) {
  window.dispatchEvent(
    new CustomEvent('inkahsubs_data', { detail: JSON.stringify(detail) }),
  );
}

describe('NetflixService manifest parsing', () => {
  it('caches tracks from the OLD manifest shape (timedtexttracks/ttDownloadables/urls map)', () => {
    const service = new NetflixService();
    dispatchManifest({
      viewableType: 'EPISODE',
      movieId: 12345,
      timedtexttracks: [
        {
          language: 'ko',
          rawTrackType: 'subtitles',
          isNoneTrack: false,
          isForcedNarrative: false,
          ttDownloadables: {
            [WEBVTT]: { urls: { a: 'https://cdn/ko.vtt' } },
          },
        },
        {
          language: 'en',
          rawTrackType: 'closedcaptions',
          isNoneTrack: false,
          isForcedNarrative: false,
          ttDownloadables: {
            [WEBVTT]: { downloadUrls: { a: 'https://cdn/en-cc.vtt' } },
          },
        },
      ],
    });

    const langs = service.getAvailableLanguages();
    expect(langs).toContain('ko');
    expect(langs).toContain('en[cc]');
  });

  it('caches tracks from the NEW manifest shape (textTracks/downloadables/urls array)', () => {
    const service = new NetflixService();
    dispatchManifest({
      // NOTE: no viewableType — newer manifests omit it
      movieId: 12345,
      textTracks: [
        {
          language: 'ko',
          rawTrackType: 'SUBTITLES',
          isNoneTrack: false,
          isForcedNarrative: false,
          downloadables: {
            [WEBVTT]: { urls: [{ url: 'https://cdn/ko.vtt' }] },
          },
        },
        {
          language: 'th',
          rawTrackType: 'SUBTITLES',
          isNoneTrack: false,
          isForcedNarrative: true,
          downloadables: {
            [WEBVTT]: { urls: [{ url: 'https://cdn/th-forced.vtt' }] },
          },
        },
        {
          language: null,
          rawTrackType: 'SUBTITLES',
          isNoneTrack: true,
          isForcedNarrative: false,
        },
      ],
    });

    const langs = service.getAvailableLanguages();
    expect(langs).toContain('ko');
    // Forced narrative tracks are cached but excluded from language listing
    expect(langs.some((l) => l.includes('forced'))).toBe(false);
    // None-tracks are skipped entirely
    expect(langs.some((l) => l.includes('null'))).toBe(false);
  });

  it('ignores manifests with a non-playable viewableType', () => {
    const service = new NetflixService();
    dispatchManifest({
      viewableType: 'TRAILER',
      movieId: 12345,
      textTracks: [
        {
          language: 'ko',
          rawTrackType: 'SUBTITLES',
          isNoneTrack: false,
          isForcedNarrative: false,
          downloadables: { [WEBVTT]: { urls: [{ url: 'https://cdn/x.vtt' }] } },
        },
      ],
    });

    expect(service.getAvailableLanguages()).toEqual([]);
  });
});
