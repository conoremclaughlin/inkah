import { parseVtt } from './vtt-parser';
import type { SubtitleCue, VideoService } from './types';

const SUB_TYPES = { closedcaptions: '[cc]' };

/**
 * Netflix subtitle service.
 * Injects a script into the page context that hooks JSON.parse/stringify
 * to intercept subtitle track data from Netflix's API.
 */
export class NetflixService implements VideoService {
  private subCache: Record<string, Record<string, string>> = {};
  private currentVideoId: string | null = null;

  init() {
    // Listen for subtitle data events from the injected script
    window.addEventListener('inkahsubs_data', ((e: CustomEvent) => {
      const data = e.detail;
      if (!data?.timedtexttracks) return;

      const videoId = data.movieId?.toString() ?? 'unknown';
      const subs: Record<string, string> = {};

      for (const track of data.timedtexttracks) {
        if (!track.language) continue;
        // Extract the WebVTT download URL
        const downloadable = track.ttDownloadable;
        if (downloadable?.['webvtt-lssdh-ios8']?.downloadUrls) {
          const urls = downloadable['webvtt-lssdh-ios8'].downloadUrls;
          const url = Object.values(urls)[0] as string;
          if (url) {
            const lang = track.language + (track.isForcedNarrative ? '-forced' : '');
            subs[lang] = url;
            // Also store with [cc] suffix if it's CC
            if (track.rawTrackType === 'closedcaptions') {
              subs[track.language + SUB_TYPES.closedcaptions] = url;
            }
          }
        }
      }

      if (Object.keys(subs).length > 0) {
        this.subCache[videoId] = subs;
        this.currentVideoId = videoId;
      }
    }) as EventListener);

    // Inject the interception script into the page context
    this.injectScript();
  }

  async getSubs(language: string): Promise<SubtitleCue[]> {
    if (!language) return [];

    const ccLanguage = language + SUB_TYPES.closedcaptions;

    // Try by video ID, fallback to most recent cache
    let subsList = this.currentVideoId
      ? this.subCache[this.currentVideoId]
      : undefined;

    if (!subsList) {
      // Use most recent cached entry
      const keys = Object.keys(this.subCache);
      if (keys.length > 0) {
        subsList = this.subCache[keys[keys.length - 1]];
      }
    }

    if (!subsList) return [];

    const langKey = Object.keys(subsList).find(
      (key) => key === language || key === ccLanguage,
    );
    if (!langKey) return [];

    const subUri = subsList[langKey];
    if (!subUri) return [];

    try {
      const resp = await fetch(subUri);
      const data = await resp.text();
      return parseVtt(data);
    } catch {
      return [];
    }
  }

  findVideo(): HTMLVideoElement | null {
    const videos = document.getElementsByTagName('video');
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    // Try to match by Netflix's data-videoid
    const player = document.querySelector('[data-uia="player"]');
    if (player) {
      const videoId = player.getAttribute('data-videoid');
      if (videoId) {
        for (const vid of videos) {
          if (vid.parentElement?.id === videoId) return vid;
        }
      }
    }

    return videos[videos.length - 1];
  }

  private injectScript() {
    const script = document.createElement('script');
    script.textContent = `(${this.injection.toString()})()`;
    document.documentElement.appendChild(script);
    script.remove();
  }

  private injection = () => {
    const parseMock = JSON.parse;
    const stringifyMock = JSON.stringify;

    const inkah: any = {
      hasLoadedOnce: false,
      isLoaded: false,
      currentLanguage: null,
      currentUrl: null,
      videoSrc: null,
    };
    (window as any).inkah = inkah;

    // Hook JSON.parse to capture subtitle track data
    JSON.parse = function () {
      const data = parseMock.apply(this, arguments as any);
      if (data?.result?.timedtexttracks) {
        window.dispatchEvent(
          new CustomEvent('inkahsubs_data', { detail: data.result }),
        );
      }
      return data;
    };

    // Hook JSON.stringify to force Netflix to include all subtitle tracks
    JSON.stringify = function (response: any) {
      if (!response) return stringifyMock.apply(this, arguments as any);
      const data = parseMock(stringifyMock.apply(this, arguments as any));

      let modified = false;
      if (data?.params?.showAllSubDubTracks != null) {
        data.params.showAllSubDubTracks = true;
        modified = true;
      }
      if (data?.params?.profiles) {
        data.params.profiles.push('webvtt-lssdh-ios8');
        modified = true;
      }

      return modified
        ? stringifyMock(data)
        : stringifyMock.apply(this, arguments as any);
    };

    function getPlayer(): any {
      try {
        const videoPlayer = (window as any).netflix.appContext.state.playerApp
          .getAPI().videoPlayer;
        const sessionId = videoPlayer.getAllPlayerSessionIds()[0];
        return videoPlayer.getVideoPlayerBySessionId(sessionId);
      } catch {
        return null;
      }
    }

    function loadSubtitles(player: any) {
      try {
        inkah.currentLanguage = player.getTimedTextTrack().bcp47;
        window.dispatchEvent(
          new CustomEvent('inkahsubsSubtitlesChanged', {
            detail: { language: inkah.currentLanguage },
          }),
        );
      } catch {}
    }

    // Detect URL changes
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

    // Poll for player readiness and subtitle changes
    window.setInterval(() => {
      const player = getPlayer();
      if (!player) return;

      if (inkah.currentUrl !== window.location.href) {
        inkah.currentUrl = window.location.href;
        inkah.isLoaded = false;
      }

      const isReady = player.isReady?.();
      const isWatchUrl = window.location.href.includes('watch');
      const hasPlayer =
        document.querySelector('.watch-video') &&
        document.querySelector('[data-uia="player"]');

      const videoEl = document.querySelector('video');
      const src = videoEl?.src ?? null;

      if (isWatchUrl && (isReady || hasPlayer) && !inkah.isLoaded) {
        inkah.isLoaded = true;
        inkah.hasLoadedOnce = true;
        inkah.videoSrc = src;
        window.dispatchEvent(new CustomEvent('inkahsubsVideoReady'));
        loadSubtitles(player);
      } else if (
        inkah.isLoaded &&
        (inkah.currentLanguage !== player.getTimedTextTrack?.()?.bcp47 ||
          inkah.videoSrc !== src)
      ) {
        inkah.videoSrc = src;
        loadSubtitles(player);
      } else if (!isWatchUrl && inkah.hasLoadedOnce) {
        inkah.isLoaded = false;
        inkah.currentLanguage = null;
        inkah.hasLoadedOnce = false;
      }
    }, 350);
  };
}
