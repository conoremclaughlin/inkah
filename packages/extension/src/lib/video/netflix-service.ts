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
    // Listen for subtitle data events from the MAIN world content script
    window.addEventListener('inkahsubs_data', ((e: CustomEvent) => {
      const data = e.detail;
      console.log('[inkah] inkahsubs_data received:', data ? 'has data' : 'null');

      if (!data?.timedtexttracks) {
        console.log('[inkah] No timedtexttracks in data. Keys:', data ? Object.keys(data) : 'null');
        return;
      }

      console.log('[inkah] Found', data.timedtexttracks.length, 'tracks');

      const videoId = data.movieId?.toString() ?? 'unknown';
      const subs: Record<string, string> = {};

      for (const track of data.timedtexttracks) {
        if (!track.language) continue;
        // Extract the WebVTT download URL — try multiple format keys
        const downloadable = track.ttDownloadable;
        if (!downloadable) {
          // Log first track's keys to understand structure
          if (Object.keys(subs).length === 0) {
            console.log('[inkah] Track keys:', Object.keys(track));
            console.log('[inkah] Track language:', track.language, 'type:', track.rawTrackType);
          }
          continue;
        }

        // Try known format keys in order of preference
        const formatKeys = ['webvtt-lssdh-ios8', 'simplesdh', 'nflx-cmisc', 'dfxp-ls-sdh'];
        let url: string | null = null;

        for (const fk of formatKeys) {
          if (downloadable[fk]?.downloadUrls) {
            url = Object.values(downloadable[fk].downloadUrls)[0] as string;
            if (url) break;
          }
          // Also check urls (plural) directly
          if (downloadable[fk]?.urls) {
            const urlObj = Object.values(downloadable[fk].urls)[0] as any;
            url = typeof urlObj === 'string' ? urlObj : urlObj?.url;
            if (url) break;
          }
        }

        // Fallback: try any key in downloadable that has URLs
        if (!url) {
          for (const [key, value] of Object.entries(downloadable)) {
            const v = value as any;
            if (v?.downloadUrls) {
              url = Object.values(v.downloadUrls)[0] as string;
              if (url) {
                console.log('[inkah] Found URL under format key:', key);
                break;
              }
            }
          }
        }

        if (url) {
          const lang = track.language + (track.isForcedNarrative ? '-forced' : '');
          subs[lang] = url;
          if (track.rawTrackType === 'closedcaptions') {
            subs[track.language + SUB_TYPES.closedcaptions] = url;
          }
        } else if (Object.keys(subs).length === 0) {
          // Log format keys to understand what Netflix sends now
          console.log('[inkah] downloadable keys for', track.language, ':', Object.keys(downloadable));
        }
      }

      if (Object.keys(subs).length > 0) {
        this.subCache[videoId] = subs;
        this.currentVideoId = videoId;
        console.log('[inkah] Netflix subtitle tracks cached:', Object.keys(subs).join(', '));
      }
    }) as EventListener);

    // Note: API interception is done by the MAIN world content script
    // (video-injector.content.ts), not by inline script injection,
    // to comply with CSP restrictions on Netflix/YouTube.
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
}
