import Service from './service';
import { parse } from 'subtitle';

interface Subtitle {
  baseUrl: string;
  isTranslatable: boolean;
  languageCode: string;
  name: { simpleText: string };
  vssId: string;
}

class YouTube implements Service {
  private subCache: any;
  currentVideoId: string;

  constructor() {
    this.subCache = {};
    this.processSubData = this.processSubData.bind(this);
    window.addEventListener('inkahsubs_data', this.processSubData);
  }

  public init() {
    this.injectScript();
  }

  public play(videoElement: HTMLVideoElement) {
    videoElement.play();
  }

  public pause(videoElement: HTMLVideoElement) {
    videoElement.pause();
  }

  // public async getSubs(language: string, native: boolean = false) {
  public async getSubs(language: string) {
    if (language === '') return parse('');
    const videoId = this.getVideoId();
    if (!videoId) return parse('');
    const urlObject: URL = new URL(this.subCache[videoId][language]);
    urlObject.searchParams.set('fmt', 'vtt');
    let subUri: string = urlObject.href;
    // language = 'en-GB';
    try {
      // c(todo): I may need to restore this to grab the translation language
      // it's a bit confusing if this is necessary...
      // if (userLanguage) {
      //   subUri = subUri + `&tlang=${userLanguage}`;
      // }
      const resp = await fetch(subUri);
      const text = await resp.text();
      return parse(text);
    } catch (err) {
      return parse('');
    }
  }

  public settingsSelector(): string {
    return '.ytp-right-controls .ytp-autonav-toggle-button-container';
  }

  public ccButtonSelector(): string {
    return '.ytp-right-controls .ytp-subtitles-button';
  }

  public settingsContentSelector(): string {
    return '#primary';
    // return '.inkahsubs-settings-container';
  }

  public playerContainerSelector(): string {
    return '.html5-video-player';
  }

  public turnClosedCaptionsOn(isEnabled: boolean): void {
    if (!isEnabled) {
      return;
    }
    const ccButton = document.querySelector(
      this.ccButtonSelector()
    ) as HTMLButtonElement;
    if (ccButton.getAttribute('aria-pressed') == 'false') {
      ccButton.click();
    }
  }

  private getVideoId() {
    const regExpression = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = window.location.href.match(regExpression);
    if (match && match[2].length === 11) {
      return match[2];
    }
    console.error("Can't get youtube video id");
  }

  private injection = () => {
    const handleLocationChange = (event: any) => {
      // console.log('[debug:locationChange] url has changed!', event);
      window.dispatchEvent(
        new CustomEvent('inkahsubsSubtitlesChanged', { detail: null })
      );
    };

    function handleSeek(event: any) {
      const player = document.getElementsByTagName('video')[0];
      player.currentTime = event.detail / 1000;
    }

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

    window.setInterval(() => {
      const player: any = document.getElementById('movie_player');
      const subsToggleElement = document.querySelector('.ytp-subtitles-button');

      if (player) {
        if (!window.isLoaded) {
          window.isLoaded = true;
          window.dispatchEvent(new CustomEvent('inkahsubsVideoReady'));
          window.addEventListener('inkahsubsSeek', handleSeek);
          if (subsToggleElement.getAttribute('aria-pressed') === 'true') {
            player.toggleSubtitles();
          } else {
            window.dispatchEvent(
              new CustomEvent('inkahsubsSubtitlesChanged', { detail: '' })
            );
          }
        }
      } else {
        window.isLoaded = false;
      }

      if (subsToggleElement) {
        if (
          window.subtitlesEnabled &&
          subsToggleElement.getAttribute('aria-pressed') === 'false'
        ) {
          window.subtitlesEnabled = false;
          window.dispatchEvent(
            new CustomEvent('inkahsubsSubtitlesChanged', { detail: '' })
          );
        }
      }
    }, 500);

    ((open) => {
      XMLHttpRequest.prototype.open = function (method: string, url: string) {
        if (url.match(/^http/g) !== null) {
          const urlObject = new URL(url);
          if (urlObject.pathname === '/api/timedtext') {
            window.subtitlesEnabled = true;
            const lang =
              urlObject.searchParams.get('tlang') ||
              urlObject.searchParams.get('lang');
            window.dispatchEvent(
              new CustomEvent('inkahsubs_data', { detail: urlObject.href })
            );
            window.dispatchEvent(
              new CustomEvent('inkahsubsSubtitlesChanged', { detail: lang })
            );
          }
        }
        open.call(this, method, url);
      };
    })(XMLHttpRequest.prototype.open);
  };

  private processSubData(event: any) {
    const urlObject = new URL(event.detail);
    const lang =
      urlObject.searchParams.get('tlang') || urlObject.searchParams.get('lang');
    const videoId = urlObject.searchParams.get('v');
    this.currentVideoId = videoId;
    this.subCache[videoId] = {};
    this.subCache[videoId][lang] = urlObject.href;
  }

  private injectScript() {
    const sc = document.createElement('script');
    sc.innerHTML = `(${this.injection.toString()})()`;
    document.head.appendChild(sc);
    document.head.removeChild(sc);
  }
}

export default YouTube;
