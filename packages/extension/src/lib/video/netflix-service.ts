import { parseVtt } from './vtt-parser';
import type { SubtitleCue, VideoService } from './types';

const WEBVTT = 'webvtt-lssdh-ios8';
const SUB_TYPES: Record<string, string> = {
  closedcaptions: '[cc]',
  subtitles: '',
};

/**
 * Netflix subtitle service — ported from old extension's netflix.ts.
 * Listens for inkahsubs_data events from the MAIN world script,
 * processes subtitle track data, and fetches WebVTT.
 */
export class NetflixService implements VideoService {
  subCache: Record<string, Record<string, any>> = {};
  currentVideoId: string = '';

  constructor() {
    this.processSubData = this.processSubData.bind(this);
    window.addEventListener('inkahsubs_data', this.processSubData as EventListener);
  }

  init() {
    // API interception is done by the MAIN world content script
    // (video-injector.content.ts). We just listen for events here.
  }

  // Ported verbatim from old extension's getSubs()
  async getSubs(language: string): Promise<SubtitleCue[]> {
    if (language === '') return [];

    const ccLanguage = language + SUB_TYPES.closedcaptions;
    let videoId: string | null = this.getMovieId();
    let subsList = this.subCache[videoId];

    if (!subsList) {
      // For TV shows/episodes, video ID doesn't match URL
      videoId = this.getBetterMovieId();
      if (videoId) {
        subsList = this.subCache[videoId];
      }
    }

    if (videoId) this.currentVideoId = videoId;

    if (!subsList) {
      // Final fallback: most recently added subtitle list
      const keys = Object.keys(this.subCache);
      if (keys.length > 0) {
        subsList = this.subCache[keys[keys.length - 1]];
      }
    }

    if (!subsList) {
      console.log('[inkah] No subtitle cache found for any video ID');
      return [];
    }

    const langKey = Object.keys(subsList).find(
      (key) => key === language || key === ccLanguage,
    );

    if (!langKey) {
      console.log('[inkah] Language', language, 'not found in cache. Available:', Object.keys(subsList).join(', '));
      return [];
    }

    // New format: {cdn_id, url} object. Old format: string URL directly.
    const subUri = subsList[langKey]?.url || subsList[langKey];

    if (!subUri) {
      return [];
    }

    try {
      const resp = await fetch(subUri);
      const data = await resp.text();
      return parseVtt(data);
    } catch (err) {
      console.warn('[inkah] Failed to fetch subtitle VTT:', err);
      return [];
    }
  }

  findVideo(): HTMLVideoElement | null {
    const videos = document.getElementsByTagName('video');
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

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

  // Ported verbatim from old extension's processSubData()
  private processSubData(event: any) {
    const detail = event.detail;
    if (!detail) return;

    // Only process EPISODE and MOVIE types
    if (!['EPISODE', 'MOVIE'].includes(detail.viewableType)) {
      return;
    }

    console.log('[inkah] processSubData: movieId=', detail.movieId, 'type=', detail.viewableType);

    this.subCache[detail.movieId] = {};
    const tracks = detail.timedtexttracks;

    if (!tracks) return;

    for (const track of tracks) {
      if (track.isNoneTrack) {
        continue;
      }

      let type = SUB_TYPES[track.rawTrackType];
      if (typeof type === 'undefined') type = `[${track.rawTrackType}]`;

      // isForcedNarrative = incomplete preview subtitles (only 15-20 lines)
      const lang =
        track.language + type + (track.isForcedNarrative ? '-forced' : '');

      // ttDownloadables (with 's') is the Netflix field name
      if (!track.ttDownloadables || !track.ttDownloadables[WEBVTT]) {
        continue;
      }

      // Support both old format (downloadUrls) and new format (urls)
      const urls =
        track.ttDownloadables[WEBVTT].urls ||
        track.ttDownloadables[WEBVTT].downloadUrls;

      if (!urls) {
        continue;
      }

      // Pick a random CDN URL from the available options
      this.subCache[detail.movieId][lang] = this.randomProperty(urls);
    }

    const cached = Object.keys(this.subCache[detail.movieId]);
    console.log('[inkah] Cached', cached.length, 'subtitle tracks:', cached.join(', '));
  }

  private randomProperty(obj: any): any {
    const keys = Object.keys(obj);
    return obj[keys[(keys.length * Math.random()) << 0]];
  }

  private getMovieId(): string {
    try {
      const match = window.location.pathname.match(/\/watch\/(.*)/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  private getBetterMovieId(): string | null {
    const player = document.querySelector('[data-uia="player"]');
    return player?.getAttribute('data-videoid') ?? null;
  }
}
