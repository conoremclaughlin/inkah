import { parseVtt } from './vtt-parser';
import type { SubtitleCue, VideoService } from './types';

/**
 * YouTube subtitle service.
 * Injects a script that hooks XMLHttpRequest.open to capture
 * timedtext API calls for subtitle URLs.
 */
export class YouTubeService implements VideoService {
  private subCache: Record<string, Record<string, string>> = {};

  init() {
    // Listen for subtitle URL data from the MAIN world content script
    window.addEventListener('inkahsubs_data', ((e: CustomEvent) => {
      try {
        const url = new URL(e.detail);
        if (url.pathname !== '/api/timedtext') return;

        const videoId = this.getVideoId() ?? 'unknown';
        const lang =
          url.searchParams.get('tlang') || url.searchParams.get('lang') || '';

        if (!this.subCache[videoId]) this.subCache[videoId] = {};
        this.subCache[videoId][lang] = e.detail;
      } catch {}
    }) as EventListener);

    // Note: API interception is done by the MAIN world content script
    // (video-injector.content.ts)
  }

  async getSubs(language: string): Promise<SubtitleCue[]> {
    if (!language) return [];

    const videoId = this.getVideoId();
    if (!videoId) return [];

    // Direct cache hit — exact language URL was intercepted
    if (this.subCache[videoId]?.[language]) {
      try {
        const url = new URL(this.subCache[videoId][language]);
        url.searchParams.set('fmt', 'vtt');
        const resp = await fetch(url.href);
        const text = await resp.text();
        return parseVtt(text);
      } catch {
        return [];
      }
    }

    // Fallback: use any cached URL + tlang for auto-translated subtitles
    const cached = this.subCache[videoId];
    if (cached) {
      const anyUrl = Object.values(cached)[0];
      if (anyUrl) {
        try {
          const url = new URL(anyUrl);
          url.searchParams.set('tlang', language);
          url.searchParams.set('fmt', 'vtt');
          const resp = await fetch(url.href);
          const text = await resp.text();
          const cues = parseVtt(text);
          if (cues.length > 0) return cues;
        } catch {}
      }
    }

    return [];
  }

  findVideo(): HTMLVideoElement | null {
    return document.querySelector('video');
  }

  getAvailableLanguages(): string[] {
    const videoId = this.getVideoId();
    if (!videoId || !this.subCache[videoId]) return [];
    return Object.keys(this.subCache[videoId]);
  }

  private getVideoId(): string | null {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

}
