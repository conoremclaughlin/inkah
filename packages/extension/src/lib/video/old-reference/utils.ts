import { learningServiceStore, subsStore } from './store';
import EnglishWithFun from './services/english-with-fun';
import KinoPub from './services/kinopub';
import Netflix from './services/netflix';
import YouTube from './services/youtube';
import Coursera from './services/coursera';
import Lingualeo from './learning-services/lingualeo';
import PuzzleEnglish from './learning-services/puzzle-english';
import Video from './video';
import { findActiveVideo } from './subtitle-utilities';

import { isFirefox, b } from '../app-exists/webext-polyfill';

const keyboardEvents = ['keyup', 'keydown', 'keypress'];

let isSubtitleFeatureEnabled = false;

const fetch = async () => {
  const result = await b.storage.local.get([
    'isSubtitleFeatureEnabled',
    'isEnabled',
  ]);

  if (result.isSubtitleFeatureEnabled == null) {
    // NOTE(exue) Null or undefined: User hasn't toggled subtitles setting yet
    // Default to main Inkah setting and save, to avoid confusion
    // Saving also propagates the change to other isSubtitleFeatureEnabled users
    result.isSubtitleFeatureEnabled = result.isEnabled ?? true;
    b.storage.local.set({
      isSubtitleFeatureEnabled: result.isSubtitleFeatureEnabled,
    });
  }

  isSubtitleFeatureEnabled = result.isSubtitleFeatureEnabled ?? true;
};

fetch();

const isSubtitleFeatureEnabledListener = (changes, namespace) => {
  if (changes.isSubtitleFeatureEnabled) {
    isSubtitleFeatureEnabled = changes.isSubtitleFeatureEnabled.newValue;
  }
};

b.storage.onChanged.addListener(isSubtitleFeatureEnabledListener);

const service = null;

class Utils {
  public static service: YouTube | Netflix;

  public static castSubTime(time: number | string) {
    return typeof time === 'number' ? time : parseInt(time, 10);
  }

  public static detectService():
    | YouTube
    | Netflix
    | KinoPub
    | EnglishWithFun
    | Coursera {
    const titleContent = document.querySelector('title').textContent;
    if (
      titleContent.includes('YouTube') ||
      window.location.host === 'www.youtube.com'
    ) {
      document.querySelector('html').id = 'youtube';
      if (!Utils.service) Utils.service = new YouTube();
      return Utils.service;
    }
    if (
      titleContent.includes('Netflix') ||
      window.location.host === 'www.netflix.com'
    ) {
      document.querySelector('html').id = 'netflix';

      // c: switch this to use a singleton so we avoid losing data
      // each time detectService is called
      if (!Utils.service) Utils.service = new Netflix();
      return Utils.service;
    }
    if (
      titleContent.includes('Кинопаб') ||
      document.querySelector('meta[content="Кинопаб"]')
    ) {
      document.querySelector('html').id = 'kinopub';
      return new KinoPub();
    }
    if (
      titleContent.includes('English-With-Fun') ||
      window.location.host === 'english-with-fun.com'
    ) {
      document.querySelector('html').id = 'english-with-fun';
      return new EnglishWithFun();
    }
    if (
      titleContent.includes('Coursera') ||
      window.location.host === 'www.coursera.org'
    ) {
      document.querySelector('html').id = 'coursera';
      return new Coursera();
    }
    return null;
  }

  public static clearWord(word: string): string {
    return word.replace(/[~!@#№$%^&*()_|+\-=?;:",.<>\{\}\[\]\\\/]/gi, '');
  }
  public static clearWordContext(sub: string, word: string): string {
    const words = sub
      .replace(/[\r\n]+/g, ' ') // remove ne line
      .replace('  ', ' ') // Remove double spaces
      .replace(/(<([^>]+)>)/gi, '') // Remove tags
      .match(/([^ \r\n][^!?\.\r\n]+[\w!?\.]+)/g) || ['']; // Split to sentences

    return words.find((element) => element.indexOf(word) >= 0);
  }

  public static getVideoCurrentTime(video: HTMLVideoElement) {
    return Math.round(video.currentTime * 1000);
  }

  public static getCurrentLearningService() {
    const currentServiceName = learningServiceStore.getState();
    switch (currentServiceName) {
      case 'lingualeo':
        return new Lingualeo();
      case 'puzzle-english':
        return new PuzzleEnglish();
      default:
        return null;
    }
  }

  public static isNetflix() {
    return ['www.netflix.com', 'netflix.com'].includes(window.location.host);
  }

  public static isYoutube() {
    return ['www.youtube.com', 'youtube.com'].includes(window.location.host);
  }

  public static keyboardHandler(event: KeyboardEvent) {
    // c. seeking doesn't work with the arrow keys on firefox. disable
    // for now until we can hook into the react render tree and access
    // i.prototype.scrubEnd / i.prototype.seek
    if (!isSubtitleFeatureEnabled || isFirefox) {
      return;
    }

    const videoElement = findActiveVideo();
    if (event.code === 'ArrowLeft') {
      event.stopPropagation();
      if (event.type === 'keydown') {
        Video.moveToPrevSub(videoElement, subsStore.getState(), event.altKey);
      }
    }
    if (event.code === 'ArrowRight') {
      event.stopPropagation();
      if (event.type === 'keydown') {
        Video.moveToNextSub(videoElement, subsStore.getState(), event.altKey);
      }
    }
  }

  public static addKeyboardEventsListeners() {
    keyboardEvents.forEach((eventType) => {
      document.addEventListener(eventType, Utils.keyboardHandler, true);
    });
  }

  public static removeKeyboardEventsListeners() {
    keyboardEvents.forEach((eventType) => {
      document.removeEventListener(eventType, Utils.keyboardHandler, true);
    });
  }

  public static arrayStringify(data: string[]): string {
    return data.map((item) => `q=${encodeURIComponent(item)}`).join('&');
  }

  public static extract(key: string, resp: any) {
    const re = new RegExp(`"${key}":".*?"`);
    const result = re.exec(resp);
    if (result !== null) {
      return result[0].replace(`"${key}":"`, '').slice(0, -1);
    }
    return '';
  }

  public static getTranslateFromGoogleResponse(response: any) {
    response = response.slice(6);
    const response_items = response.split(/^\d+$/gm).slice(1);
    for (const json_item of response_items) {
      const parsed_item = JSON.parse(json_item);

      if (parsed_item[0][2]) {
        const translates = JSON.parse(parsed_item[0][2]);
        return translates[1][0][0][5]
          .map((translate: any) => translate[0])
          .join(' ');
      }
    }
  }
}

export default Utils;
