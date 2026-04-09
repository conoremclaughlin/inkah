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
    try {
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
    } catch {
      return stringifyMock.apply(this, arguments as any);
    }
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
    origOpen.call(this, method, url);
  };
}
