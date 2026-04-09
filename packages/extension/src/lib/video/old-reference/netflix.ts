import Service from './service';
import { parse } from 'subtitle';

const WEBVTT = 'webvtt-lssdh-ios8';
const SUB_TYPES = {
  closedcaptions: '[cc]',
  subtitles: '',
};

interface Track {
  isNoneTrack: boolean;
  isForcedNarrative: boolean;
  language: string;
  rawTrackType: 'subtitles' | 'closedcaptions';
  ttDownloadables: {
    'webvtt-lssdh-ios8': {
      downloadUrls?: {};
      urls: {
        cdn_id: number;
        url: string;
      }[];
    };
  };
}

// c: giving an example of the potential formats
export type SubCache = {
  actualVideoId: {
    en: any;
    'en-forced': any;
    'en[cc]': any;
  };
};

class Netflix implements Service {
  subCache: any;
  currentVideoId: string;

  constructor() {
    this.subCache = new Map();
    this.processSubData = this.processSubData.bind(this);
    window.addEventListener('inkahsubs_data', this.processSubData);
  }

  public init() {
    this.injectScript();
  }

  public async getSubs(language: string) {
    // public async getSubs(language: string, userLanguage: string) {
    if (language === '') return parse('');

    // c(todo): weird code flow here, but
    // trying to get better support
    // if (userLanguage) {
    //   language = userLanguage;
    // }
    const ccLanguage = language + SUB_TYPES.closedcaptions;
    let videoId: string | null | undefined = this.getMovieId();
    let subsList = this.subCache[videoId];

    if (!subsList) {
      // exue: for TV shows/episodes/series, they don't match the URL in the window.location
      // whereas for movies they do. Instead, we'll need to get the ID from the video element.
      videoId = this.getBetterMovieId();

      if (videoId) {
        subsList = this.subCache[videoId];
      }
    }

    if (videoId) this.currentVideoId = videoId;

    if (!subsList) {
      // exue: Final fallback for video ID.  We look at the most recently added list of subtitles
      // to this.subCache. Since we are using a Map, insertion order is preserved
      // 2022/10/07: pretty sure this doesn't work since the value is inserted via key instead of
      // via Map's own method to create an official entry
      subsList = Array.from(this.subCache.values()).pop();
    }

    const langKey = Object.keys(subsList).find(
      (key) => key === language || key === ccLanguage
    );

    // c: new format of Netflix passes an object of cdn_id and url
    // old format is only a string representing the cdn url
    const subUri = subsList[langKey]?.url || subsList[langKey];
    // console.log('[d:getSubs] subsList[langKey]: ', subsList[langKey]);
    // console.log('[d:getSubs] langKey: ', langKey);
    // console.log('[d:getSubs] subUri: ', subUri);

    // Very possible for there not to be the user's native language
    if (!subUri) {
      return parse('');
    }

    const resp = await fetch(subUri);
    const data = await resp.text();
    return parse(data);
  }

  public playerContainerSelector(): string {
    return '[data-uia="player"]';
  }

  public settingsSelector(): string {
    // c: old selector but it's unclear if it will continue to work on
    // international distributions
    // return '[aria-label="Full screen"]';
    // c: do we need an exit here?
    // '[data-uia="control-fullscreen-exit"]'
    return '[data-uia="control-fullscreen-enter"]';
  }

  public settingsContentSelector(): string {
    return 'div.watch-video';
  }

  public play(videoElement: HTMLVideoElement) {
    // const playButton = document.querySelector('[aria-label="Play"]');
    const playButton = document.querySelector(
      '[data-uia="control-play-pause-play"]'
    );

    if (playButton) {
      playButton.click();
    }
  }

  public pause(videoElement: HTMLVideoElement) {
    // const pauseButton = document.querySelector('[aria-label="Pause"]');
    const pauseButton = document.querySelector(
      '[data-uia="control-play-pause-pause"]'
    );

    if (pauseButton) {
      pauseButton.click();
    }
  }

  // exue: We must inject this code into the document header,
  // since the `netflix` object isn't available from extension context. Any actions on the
  // `netflix` object e.g. seeking must also rely on this injected code,
  // and thus use window.dispatchEvent for communication.
  //
  // Doing video.currentTime on the HTML5 video element doesn't work
  // and will cause the Netflix window to display an error message.
  // c: Adding more color: the injection method is toString() later on
  // and injected into the header with its mini helper functions for
  // accessing the topmost script outside the extension "world". Probably
  // an easier way to do this but it works for now
  private injection = () => {
    const parseMock = JSON.parse;
    const stringifyMock = JSON.stringify;
    const playerSelector = '[data-uia="player"]';
    const playerContainerSelector = '[data-uia="watch-video"]'; // '.watch-video';
    const fullScreenEnterSelector = '[data-uia="control-fullscreen-enter"]';
    const fullScreenExitSelector = '[data-uia="control-fullscreen-exit"]';

    const inkah = {
      hasLoadedOnce: false,
      isLoaded: false,
      currentLanguage: null,
    };

    (window as any).inkah = inkah;

    JSON.parse = function () {
      const data = parseMock.apply(this, arguments);
      if (data && data.result && data.result.timedtexttracks) {
        window.dispatchEvent(
          new CustomEvent('inkahsubs_data', { detail: data.result })
        );
      }
      return data;
    };

    JSON.stringify = function (response: any) {
      if (!response) return stringifyMock.apply(this, arguments);
      const data = parseMock(stringifyMock.apply(this, arguments));

      let modified = false;
      if (data && data.params && data.params.showAllSubDubTracks != null) {
        data.params.showAllSubDubTracks = true;
        modified = true;
      }
      if (data && data.params && data.params.profiles) {
        data.params.profiles.push('webvtt-lssdh-ios8');
        modified = true;
      }

      return modified
        ? stringifyMock(data)
        : stringifyMock.apply(this, arguments);
    };

    // this is not an HTMLVideoElement what is it?
    function getPlayer() {
      const videoPlayer = netflix.appContext.state.playerApp.getAPI()
        .videoPlayer;
      const sessionId = videoPlayer.getAllPlayerSessionIds()[0];
      return videoPlayer.getVideoPlayerBySessionId(sessionId);
    }

    function handleSeek(event: any) {
      const player = getPlayer();
      player.seek(event.detail);

      if (player.isPaused) {
        player.play();
      }
    }

    const findActiveVideo = (): HTMLVideoElement | null => {
      const potentialVideoElements = document.getElementsByTagName('video');

      if (potentialVideoElements.length === 0) {
        return null;
      } else if (potentialVideoElements.length === 1) {
        return potentialVideoElements[0];
      } else {
        // Sometimes we can end up with more than one video element
        // try to look for the matching ID, which works for Netflix
        // otherwise, we just take the last element.
        // exue(todo): - check edge cases for other services
        // It's usually the last element, but really we should go and compare the ID
        // of .ltr-fntwn3 (data-videoid="70298569") with the
        const videoContainer = document.querySelector(playerSelector);
        if (videoContainer) {
          const videoId = videoContainer.getAttribute('data-videoid');

          for (let i = 0; i < potentialVideoElements.length; i++) {
            const el = potentialVideoElements[i];
            if (el.parentElement?.id === videoId) {
              return el;
            }
          }
        }

        // Return the last element if the above technique doesn't work
        return potentialVideoElements[potentialVideoElements.length - 1];
      }
    };

    window.addEventListener('inkahsubsSeek', handleSeek);

    const loadSubtitles = (player) => {
      // console.log(
      //   '[debug:loadSubtitles] currentLanguage: ',
      //   player.getTimedTextTrack().bcp47
      // );
      inkah.currentLanguage = player.getTimedTextTrack().bcp47;
      // c(todo): explore how to get the list of possible languages for netflix and add
      // to the dropdown for choosing a language
      window.dispatchEvent(
        new CustomEvent('inkahsubsSubtitlesChanged', {
          detail: {
            language: inkah.currentLanguage,
          },
        })
      );
    };

    const handleLocationChange = (event) => {
      // console.log('[debug:locationChange] url has changed!', event);
    };

    // @see https://stackoverflow.com/a/52809105
    // c(todo): get notifications for the URL changing
    // to ideally remove the necessity of the polling
    history.pushState = ((f) =>
      function pushState() {
        const ret = f.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('inkahLocationChange'));
        return ret;
      })(history.pushState);

    history.replaceState = ((f) =>
      function replaceState() {
        const ret = f.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('inkahLocationChange'));
        return ret;
      })(history.replaceState);

    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('inkahLocationChange'));
    });

    window.addEventListener('inkahLocationChange', handleLocationChange);

    function doNotTest() {
      try {
        let buildID =
          netflix.appContext.state.model.models.serverDefs.data
            .BUILD_IDENTIFIER;
        // 2022/10/07: This no longer works sadly. Trying mre but not sure how many accounts it works for
        // let endpoint = `https://www.netflix.com/api/shakti/${buildID}/account/donottest`;
        let endpoint = `https://www.netflix.com/api/shakti/mre/account/donottest`;

        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canABTest: false,
            authURL: netflix.reactContext.models.userInfo.data.authURL,
          }),
        }).then(
          (res) => {
            // console.log('[d:doNotTest] response from netflix: ', res);
            if (res.status === 200) {
              res.json();
            }
          },
          () => {
            // c: do nothing if this doesn't work
          }
        );
      } catch (error) {}
    }

    function checkLoading() {
      const player = getPlayer();

      // exue: May need to listen for URL changes e.g. we start on netflix.com then navigate to a known page
      // exue(todo): Remove, this is probably useless
      // c: I'm not sure what eddie was doing here with this
      // except trying to get things to reload on url changes
      if (inkah.currentUrl !== window.location.href) {
        inkah.currentUrl = window.location.href;
        inkah.isLoaded = false;
      }

      const isPlayerLoaded = player && player.isReady();

      const hasFullScreen =
        document.querySelector(fullScreenEnterSelector) !== null ||
        document.querySelector(fullScreenExitSelector) !== null;

      // exue: Take care of edge case where we let the home screen preview finish, and only then
      // brows to a full-page watch video. In this case, the player doesn't get updated with getLoaded function
      // and getPlaying/isPlaying also continues to be false.
      // e.g. the player object will have 84 properties: (84) ["ql", "wf", "addEventListener", "removeEventListener", "getReady", "getXid", "getMovieId", "getPlaygraphId", "getElement", "isPlaying", "isPaused", "isMuted", "isReady", "isBackground", "setBackground", "startInactivityMonitor", "setTransitionTime", "getDiagnostics", "getTextTrackList", "getTextTrack", "setTextTrack", "getVolume", "isEnded", "getBusy", "getError", "getCurrentTime", "getBufferedTime", "getSegmentTime", "getDuration", "getVideoSize", "getAudioTrackList", "getAudioTrack", "getTimedTextTrackList", "getTimedTextTrack", "getAdditionalLogInfo", "getTrickPlayFrame", "getSessionSummary", "getTimedTextSettings", "setMuted", "setVolume", "getPlaybackRate", "setPlaybackRate", "setAudioTrack", "setTimedTextTrack", "setTimedTextSettings", "prepare", "load", "close", "play", "pause", "seek", "engage", "induceError", "loadCustomTimedTextTrack", "tryRecoverFromStall", "addEpisode", "playNextEpisode", "playSegment", "queueSegment", "updateNextSegmentWeights", "getCropAspectRatio", "getCropAspectRatioXandY", "generateScreenshots", "getCurrentSegmentId", "getPlaygraphMap", "setNextSegment", "clearNextSegment", "updatePlaygraphMap", "goToNextSegment", "getPlaying", "getPaused", "getMuted", "getEnded", "getTimedTextVisibility", "isTimedTextVisible", "setTimedTextVisibility", "setTimedTextSize", "setTimedTextBounds", "setTimedTextMargins", "setTimedTextVisible", "getCongestionInfo", "oia", "log", "observables"]
      // while missing the last 5 ["hasLoggedClose", "loaded", "loading", "getLoaded", "isLoading"]
      const backupDetection =
        player && hasFullScreen && window.location.href.indexOf('watch') !== -1;

      const isWhitelistedUrl = window.location.href.indexOf('watch') !== -1;

      // 21/04/20 c: when I'm in full screen and the bug occurs, the button is not present
      // I'm going to get rid of this and see what happens
      const hasVideoElements =
        // document.querySelector('.ltr-16gjl7v.small') &&
        !!(
          // isWhitelistedUrl &&
          (
            document.querySelector(playerContainerSelector) &&
            document.querySelector(playerSelector)
          )
        );

      // c(bug): firefox has an issue where it can autoblock the player
      // which tricked Inkah into thinking it was ready to load. Either wait
      // in this section or if empty subtitles in the video-loader calls for both,
      // try again later
      const didFirefoxBlockAutoplay = !!(
        !inkah.hasLoadedOnce &&
        !hasFullScreen &&
        document.querySelector(playerContainerSelector) &&
        document.querySelector(playerSelector)
      );

      // const isAutoplayTransition = !!isWhitelistedUrlj;

      const videoElement = findActiveVideo();
      const src = videoElement ? videoElement.src : null;

      // console.log('[debug:checkLoading] href: ', window.location.href);
      // console.log('[debug:checkLoading] isWhitelistedUrl: ', isWhitelistedUrl);
      // console.log('[debug:checkLoading] isPlayerLoaded: ', isPlayerLoaded);
      // console.log('[debug:checkLoading] backupDetection: ', backupDetection);
      // // backupDetection;
      // console.log('[debug:checkLoading] hasVideoElements: ', hasVideoElements);
      // console.log(
      //   '[debug:checkLoading] didFirefoxBlockAutoplay: ',
      //   didFirefoxBlockAutoplay
      // );

      // c(bug): this is likely the issue but I can't insert break points
      // due to the silly injection
      // c(todo): migrate Eddie's code to window.addEventListener('popstate')
      // vs the current complexity
      if (
        isWhitelistedUrl &&
        (isPlayerLoaded || backupDetection) &&
        hasVideoElements &&
        !didFirefoxBlockAutoplay
      ) {
        if (!inkah.isLoaded) {
          inkah.isLoaded = true;
          inkah.hasLoadedOnce = true;
          inkah.videoSrc = src;
          window.dispatchEvent(new CustomEvent('inkahsubsVideoReady'));
          doNotTest();
          // New video loaded, load new subtitles since
          // console.log(
          //   '[debug:checkLoading] inkah has now been loaded SUPPOSEDLY for the first time'
          // );
          loadSubtitles(player);

          // may be same language, but will be new subtitles for new episodes in case of autoplay
        } else if (
          inkah.currentLanguage !== player.getTimedTextTrack().bcp47 ||
          inkah.videoSrc !== src
        ) {
          // c(todo): potentially grab the video src here and compare
          // still fails if the full screen button isn't present
          // OR watch for the URL change event to detect a new show
          // changing but it's the question whether we can detect it on
          // fullscreen change. we may not have access to the URL
          // due to the tabs permissions?? maybe it's why the URL
          // changing doesn't affect anything
          if (inkah.videoSrc !== src) {
            // console.log(
            //   `[debug:checkLoading] video source has changed. inkah.videoSrc: ${inkah.videoSrc} vs. src: ${src}`
            // );
            inkah.videoSrc = src;
          } else {
            // Video stayed loaded, but language changed due to user choice
            // console.log('[debug:checkLoading] current language has changed');
          }

          loadSubtitles(player);
        }
      } else {
        // c: this else statement was triggering when leaving full screen,
        // maybe from the netflix button reappearing? see if removing it
        // keeps things from reloading when leaving full screen
        // console.log(
        //   '[debug:checkLoading] we are now in the final else statement.'
        // );
        if (!isWhitelistedUrl && inkah.hasLoadedOnce) {
          // console.log(
          //   '[debug:checkLoading] isLoaded and currentLanguage have been reset'
          // );

          // exue: This doesn't fire on autoplay/continue, since within 500ms
          // the player doesn't transition to not-loaded yet usually. Instead of
          // relying on being fast enough to try and catch auto-play, we
          // explicitly watch for video element src change
          inkah.isLoaded = false;
          inkah.currentLanguage = null;
          inkah.hasLoadedOnce = false;
        } else {
          // console.log(
          //   '[debug:checkLoading] almost reset. didFirefoxBlock...: ',
          //   didFirefoxBlockAutoplay
          // );
        }
      }
    }

    window.setInterval(checkLoading, 350);
  };

  // c(???): da fuq is this
  private randomProperty = (obj: any) => {
    const keys = Object.keys(obj);
    // tslint:disable-next-line: no-bitwise
    return obj[keys[(keys.length * Math.random()) << 0]];
  };

  private processSubData(event: any) {
    if (!['EPISODE', 'MOVIE'].includes(event.detail.viewableType)) {
      return;
    }

    // console.log('[d:processSubData] event: ', event);
    // console.log('[d:processSubData] event.detail: ', event.detail);
    // console.log(
    //   '[d:processSubData] event.detail.timedtext: ',
    //   event.detail.timedtexttracks
    // );
    this.subCache[event.detail.movieId] = {};
    const tracks: Track[] = event.detail.timedtexttracks;

    for (const track of tracks) {
      // console.log('[d:processSubData] track: ', track);

      if (track.isNoneTrack) {
        continue;
      }

      let type = SUB_TYPES[track.rawTrackType];
      if (typeof type === 'undefined') type = `[${track.rawTrackType}]`;

      // c: for anyone else confused by this absurdly uncommented code, isForcedNarrative
      // seems to be a preview function that returns subtitles are are INCOMPLETE. They will only
      // have 15-20 lines. This means we can't use them for displaying subtitles. Netflix
      // will preload subtitles that relate to your profile, but we can't force them to give us
      // everything. Someone has to set their profile to perfer certain languages or change
      // their base Netflix language if they'd like double subtitles in a specific language.
      // It's an imperfect art
      const lang =
        track.language + type + (track.isForcedNarrative ? '-forced' : '');

      // Use a link randomly to download subs - many provided. Usually will have keys like
      // ["51049", "54928", "59680"]
      // console.log('[d:processSubData] track: ', track);
      // console.log(
      //   '[d:processSubData] track.ttDownloadables',
      //   track.ttDownloadables
      // );

      if (!track.ttDownloadables || !track.ttDownloadables[WEBVTT]) {
        continue;
      }

      // c: support both the old format (downloadUrls) and the new format (urls)
      const urls =
        track.ttDownloadables[WEBVTT].urls ||
        track.ttDownloadables[WEBVTT].downloadUrls;

      if (!urls) {
        continue;
      }

      // this.subCache[event.detail.movieId][lang] = this.randomProperty(
      //   track.ttDownloadables[WEBVTT].downloadUrls
      // );
      this.subCache[event.detail.movieId][lang] = this.randomProperty(urls);
    }
  }

  private injectScript() {
    const sc = document.createElement('script');
    sc.innerHTML = `(${this.injection.toString()})()`;
    document.head.appendChild(sc);
    document.head.removeChild(sc);
  }

  private getMovieId() {
    return window.location.pathname.match(/\/watch\/(.*)/)[1];
  }

  private getBetterMovieId() {
    const player = document.querySelector(this.playerContainerSelector());
    return player?.getAttribute('data-videoid');
  }
}

export default Netflix;
