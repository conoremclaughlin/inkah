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
    // Listen for subtitle URL data from injected script
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

    this.injectScript();
  }

  async getSubs(language: string): Promise<SubtitleCue[]> {
    if (!language) return [];

    const videoId = this.getVideoId();
    if (!videoId || !this.subCache[videoId]?.[language]) return [];

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

  findVideo(): HTMLVideoElement | null {
    return document.querySelector('video');
  }

  private getVideoId(): string | null {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

  private injectScript() {
    const script = document.createElement('script');
    script.textContent = `(${this.injection.toString()})()`;
    document.documentElement.appendChild(script);
    script.remove();
  }

  private injection = () => {
    // Detect URL changes (SPA navigation)
    const origPush = history.pushState;
    history.pushState = function () {
      const ret = origPush.apply(this, arguments as any);
      window.dispatchEvent(new Event('inkahLocationChange'));
      return ret;
    };
    const origReplace = history.replaceState;
    history.replaceState = function () {
      const ret = origReplace.apply(this, arguments as any);
      window.dispatchEvent(new Event('inkahLocationChange'));
      return ret;
    };
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('inkahLocationChange'));
    });

    window.addEventListener('inkahLocationChange', () => {
      window.dispatchEvent(
        new CustomEvent('inkahsubsSubtitlesChanged', { detail: null }),
      );
    });

    // Poll for video player readiness
    window.setInterval(() => {
      const player: any = document.getElementById('movie_player');
      const subsToggle = document.querySelector('.ytp-subtitles-button');

      if (player) {
        if (!(window as any).inkahYtLoaded) {
          (window as any).inkahYtLoaded = true;
          window.dispatchEvent(new CustomEvent('inkahsubsVideoReady'));

          // If subtitles are already on, toggle to trigger data capture then re-enable
          if (subsToggle?.getAttribute('aria-pressed') === 'true') {
            player.toggleSubtitles?.();
          } else {
            window.dispatchEvent(
              new CustomEvent('inkahsubsSubtitlesChanged', { detail: '' }),
            );
          }
        }
      } else {
        (window as any).inkahYtLoaded = false;
      }

      // Detect if user turned off subtitles
      if (subsToggle) {
        if (
          (window as any).inkahYtSubsEnabled &&
          subsToggle.getAttribute('aria-pressed') === 'false'
        ) {
          (window as any).inkahYtSubsEnabled = false;
          window.dispatchEvent(
            new CustomEvent('inkahsubsSubtitlesChanged', { detail: '' }),
          );
        }
      }
    }, 500);

    // Hook XHR to capture timedtext API URLs
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string) {
      try {
        if (url?.match(/^http/g)) {
          const urlObj = new URL(url);
          if (urlObj.pathname === '/api/timedtext') {
            (window as any).inkahYtSubsEnabled = true;
            const lang =
              urlObj.searchParams.get('tlang') ||
              urlObj.searchParams.get('lang');
            window.dispatchEvent(
              new CustomEvent('inkahsubs_data', { detail: urlObj.href }),
            );
            window.dispatchEvent(
              new CustomEvent('inkahsubsSubtitlesChanged', { detail: lang }),
            );
          }
        }
      } catch {}
      origOpen.call(this, method, url);
    };
  };
}
