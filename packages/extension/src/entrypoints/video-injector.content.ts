/**
 * MAIN world content script — runs in the page's JavaScript context.
 * This bypasses CSP restrictions for inline script injection.
 * Handles Netflix/YouTube API interception that requires access to page globals.
 */
export default defineContentScript({
  matches: [
    '*://*.netflix.com/*',
    '*://*.youtube.com/*',
  ],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    const hostname = window.location.hostname;

    if (hostname.includes('netflix.com')) {
      initNetflixInterception();
    } else if (hostname.includes('youtube.com')) {
      initYouTubeInterception();
    }
  },
});

function initNetflixInterception() {
  const parseMock = JSON.parse;
  const stringifyMock = JSON.stringify;

  // Known Netflix manifest-request profile strings — used to recognize the
  // profiles array in requests regardless of property naming (Netflix
  // renames manifest fields periodically; ported from subadub).
  const NETFLIX_PROFILES = [
    'heaac-2-dash',
    'heaac-2hq-dash',
    'playready-h264mpl30-dash',
    'playready-h264mpl31-dash',
    'playready-h264hpl30-dash',
    'playready-h264hpl31-dash',
    'vp9-profile0-L30-dash-cenc',
    'vp9-profile0-L31-dash-cenc',
    'dfxp-ls-sdh',
    'simplesdh',
    'nflx-cmisc',
    'BIF240',
    'BIF320',
  ];

  function isSubtitlesProperty(key: string, value: unknown[]): boolean {
    return (
      key === 'profiles' ||
      value.some((item) => NETFLIX_PROFILES.includes(item as string))
    );
  }

  /** Recursively locate the profiles array in a manifest request object. */
  function findSubtitlesProperty(obj: any): unknown[] | null {
    for (const key in obj) {
      const value = obj[key];
      if (Array.isArray(value)) {
        if (isSubtitlesProperty(key, value)) {
          return value;
        }
      }
      if (value && typeof value === 'object') {
        const prop = findSubtitlesProperty(value);
        if (prop) {
          return prop;
        }
      }
    }
    return null;
  }

  const inkah: any = {
    hasLoadedOnce: false,
    isLoaded: false,
    currentLanguage: null,
    currentUrl: null,
    videoSrc: null,
  };
  (window as any).inkah = inkah;

  // Hook JSON.parse to capture subtitle track data.
  // Netflix has used two manifest shapes over time:
  //   old: result.timedtexttracks[].ttDownloadables[fmt].urls (object map)
  //   new: result.textTracks[].downloadables[fmt].urls ([{url}] array)
  // Detect both here; NetflixService.processSubData normalizes them.
  JSON.parse = function () {
    const data = parseMock.apply(this, arguments as any);
    const result = data?.result;
    if (
      result &&
      (result.timedtexttracks || (result.movieId && result.textTracks))
    ) {
      lastSubtitleData = result;
      // Serialize as JSON string to survive structured cloning across worlds
      try {
        const serialized = stringifyMock(result);
        window.dispatchEvent(
          new CustomEvent('inkahsubs_data', { detail: serialized }),
        );
      } catch {}
    }
    return data;
  };

  // Hook JSON.stringify to force WebVTT into manifest requests.
  // Don't hardcode property paths — Netflix renames them often; find the
  // profiles array by content and mutate in place (ported from subadub).
  JSON.stringify = function (value: any) {
    try {
      if (value && typeof value === 'object') {
        const prop = findSubtitlesProperty(value);
        if (prop && !prop.includes('webvtt-lssdh-ios8')) {
          prop.unshift('webvtt-lssdh-ios8');
        }
      }
    } catch {}
    return stringifyMock.apply(this, arguments as any);
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

  // Handle seek requests from content script (old code's exact pattern)
  function handleSeek(event: any) {
    try {
      const player = getPlayer();
      if (!player) return;
      player.seek(event.detail);
      if (player.isPaused?.()) {
        player.play();
      }
    } catch {}
  }
  window.addEventListener('inkahsubsSeek', handleSeek);

  // Arrow key navigation between subtitles
  function handleKeyboard(event: KeyboardEvent) {
    if (event.code === 'ArrowLeft' && event.type === 'keydown') {
      try {
        const player = getPlayer();
        if (player) {
          // Seek back 5 seconds
          const currentTime = player.getCurrentTime();
          player.seek(Math.max(0, currentTime - 5000));
        }
      } catch {}
    }
    if (event.code === 'ArrowRight' && event.type === 'keydown') {
      try {
        const player = getPlayer();
        if (player) {
          // Seek forward 5 seconds
          const currentTime = player.getCurrentTime();
          player.seek(currentTime + 5000);
        }
      } catch {}
    }
  }
  document.addEventListener('keydown', handleKeyboard, true);

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

  // Store the last subtitle track data so content script can retrieve it
  let lastSubtitleData: any = null;

  // When content script signals it's ready, re-fire ALL subtitle data
  window.addEventListener('inkahContentReady', () => {
    // Re-fire the subtitle track data so content script can cache URLs
    if (lastSubtitleData) {
      try {
        const serialized = stringifyMock(lastSubtitleData);
        window.dispatchEvent(
          new CustomEvent('inkahsubs_data', { detail: serialized }),
        );
      } catch {}
    }
    // Re-fire subtitle language change
    if (inkah.isLoaded && inkah.currentLanguage) {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('inkahsubsSubtitlesChanged', {
            detail: { language: inkah.currentLanguage },
          }),
        );
      }, 100);
    }
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
    const hasVideo = document.querySelector('video') !== null;
    const hasContainer = document.querySelector('.watch-video') !== null;

    const videoEl = document.querySelector('video');
    const src = videoEl?.src ?? null;

    if (isWatchUrl && (isReady || (hasVideo && hasContainer)) && !inkah.isLoaded) {
      inkah.isLoaded = true;
      inkah.hasLoadedOnce = true;
      inkah.videoSrc = src;
      window.dispatchEvent(new CustomEvent('inkahsubsVideoReady'));
      loadSubtitles(player);
    } else if (
      inkah.isLoaded &&
      player.getTimedTextTrack &&
      (inkah.currentLanguage !== player.getTimedTextTrack()?.bcp47 ||
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
}

function initYouTubeInterception() {
  // Handle seek requests from the content script (right panel carets,
  // progress bar cues). detail is milliseconds — same contract as Netflix.
  window.addEventListener('inkahsubsSeek', ((event: CustomEvent) => {
    try {
      const player = document.getElementById('movie_player') as any;
      if (player?.seekTo) {
        player.seekTo(event.detail / 1000, true);
        player.playVideo?.();
      } else {
        const video = document.querySelector('video');
        if (video) video.currentTime = event.detail / 1000;
      }
    } catch {}
  }) as EventListener);

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
    origOpen.apply(this, arguments as any);
  };
}
