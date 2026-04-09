import './css/all-video.scss';

import config from '../app-exists/extension-config';
import { subTitleType } from 'subtitle';
import { WithApollo } from '../graphql-chosen/with-apollo';
import {
  updateNativeSubs,
  updateSubs,
  updateSubtitlesLoadingState,
} from './event';
import {
  nativeSubsStore,
  subsStore,
  subtitlesLoadingStateStore,
  userLanguageStore,
} from './store';
import { getCleanSubText, tokenizeChineseSubs } from './subtitle-utilities';
import Utils from './utils';
import React from 'react';
import ReactDOM from 'react-dom';
import Notification from './components/notification/notification';
import ProgressBar from './components/progress/progress-bar';
import SettingsWrapper from './components/settings/settings-wrapper';
import CenterSubs from './components/subs/center-subs';
import RightPanel from './components/subs/right-subs-panel';
import appComposer from '../app-exists/app-composer';
import ResultsComposer, {
  ResultsUseCase,
} from '../dictionaries-search/results-composer';
import Netflix from './services/netflix';
import Youtube from './services/youtube';

import { b } from '../app-exists/webext-polyfill';
import BusinessLayerComposer from '../app-exists/business-layer-composer';
import { useStore } from 'effector-react';
import Service from './services/service';

const NATIVE_LANGUAGE = 'en';

export const ComposerContext = React.createContext<VideoSubtitlesComposer | null>(
  null // default value
);

export default class VideoSubtitlesComposer {
  results: ResultsUseCase;
  bl: BusinessLayerComposer;
  service: Service;

  // c: whoever wrote the first pass didn't understand singletons
  // so used static methods everywhere. Instead of completely refactoring,
  // doing a progressive refactor that caches a singleton of the composer at the
  // static level
  static singleton: VideoSubtitlesComposer;

  init({
    bl,
    resultsComposer,
  }: {
    bl: BusinessLayerComposer;
    resultsComposer: ResultsComposer;
  }) {
    VideoSubtitlesComposer.singleton = this;
    this.bl = bl;
    this.results = resultsComposer.resultsUseCase;
    this.activateSubtitles();
    b.storage.onChanged.addListener(this.handleVideoSettingsChanged);
  }

  initTrackingHandlers() {}

  handleVideoSettingsChanged = (changes) => {
    const settings = [
      'showProgressBarState',
      'showSubsBackgroundState',
      'subsFontSizeStore',
      'userLanguageStore',
      'learningServiceStore',
      'subsStore',
      'showFullSubTranslatePopupStore',
      'showNativeState',
      'showRightPanelState',
      'showTransliterationState',
      'isAutoPausedState',
      'shouldAutoPauseSettingStore',
    ];

    if (Utils.isNetflix()) {
      const node = document.querySelector('[data-uia="video-title"]');
      if (node) {
        const title = [...node.children]
          .map((childNode) => {
            return childNode.textContent;
          })
          .join(' ');

        this.results.setVideoTitle(title);
      }
    }

    if (changes.isSubtitleFeatureEnabled) {
      const value = changes.isSubtitleFeatureEnabled.newValue;
      const name = value ? 'Settings Video Enabled' : 'Settings Video Disabled';
      this.trackVideo({
        name,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:showNativeState']) {
      const value = !!changes['persist:showNativeState'].newValue;
      this.trackVideo({
        name: `Settings Video Native Subs Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:showRightPanelState']) {
      const value = !!changes['persist:showRightPanelState'].newValue;
      this.trackVideo({
        name: `Settings Video Right Panel Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:showSubsBackgroundState']) {
      const value = !!changes['persist:showSubsBackgroundState']
        .showSubsBackgroundState.newValue;
      this.trackVideo({
        name: `Settings Video Subs Background Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:showProgressBarState']) {
      const value = !!changes['persist:showProgressBarState'].newValue;
      this.trackVideo({
        name: `Settings Video Progress Bar Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:showTransliterationState']) {
      const value = !!changes['persist:showTransliterationState'].newValue;
      this.trackVideo({
        name: `Settings Video Show Transliteration Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:shouldAutoPauseSettingStore']) {
      const value = !!changes['persist:shouldAutoPauseSettingStore'].newValue;
      this.trackVideo({
        name: `Settings Video Should Auto Pause Toggled`,
        properties: {
          value,
        },
      });
    }

    if (changes['persist:subsFontSizeStore']) {
      const value = changes['persist:subsFontSizeStore'].newValue;
      this.trackVideo({
        name: `Settings Video Subs Font Size Updated`,
        properties: {
          value,
        },
      });
    }
  };

  switchLangBasedOnVideoLang = (videoLanguage) => {
    if (!Utils.isNetflix()) {
      return;
    }

    if (videoLanguage.indexOf('ko') !== -1) {
      // Generally just 'ko'
      b.storage.local.set({ targetLanguage: 'ko' });
    }

    if (videoLanguage.indexOf('zh') !== -1) {
      // zh-Hans, zh-Hant
      b.storage.local.set({ targetLanguage: 'zh' });
    }
  };

  parseSubtitles = async (rawSubtitles, language) => {
    const subtitlePromises: Promise<InParsedSubtitle>[] = rawSubtitles.map(
      async (
        subtitle: subTitleType,
        index: number
      ): Promise<InParsedSubtitle> => {
        const subTextVtt = subtitle.text || '';
        const cleanText = getCleanSubText(subTextVtt);

        let tokenized;
        if (
          subTextVtt.indexOf('chinese') !== -1 ||
          language.indexOf('zh') !== -1
        ) {
          const tokenizedChinese = await tokenizeChineseSubs(
            appComposer,
            subTextVtt,
            cleanText,
            language
          );
          tokenized = tokenizedChinese;
        } else {
          tokenized = {};
        }

        const parsed = {
          cleanText,
          tokens: tokenized.tokens ?? null,
          romanization: tokenized.romanization ?? null,
          spaceDelimitedWords: tokenized.spaceDelimitedWords ?? null,
          subtitle,
        };

        return parsed;
      }
    );

    const parsedSubs = await Promise.all(subtitlePromises);
    this.results.setSubtitles(parsedSubs);

    return parsedSubs;
  };

  parseVideoTitle(node) {
    return node.textContent || node.innerText || '';
  }

  trackVideo = async ({ name, properties = {} }) => {
    const result = await b.storage.local.get([
      'isEnabled',
      'isSubtitleFeatureEnabled',
    ]);

    // c: don't report the event if Inkah isn't on
    if (!result.isSubtitleFeatureEnabled) {
      return null;
    }

    // c: this doesn't currently work for autoplaying videos
    // since we never see the title
    if (Utils.isNetflix()) {
      // c: this doesn't currently work for autoplaying videos
      // since we never see the title
      const node = document.querySelector('[data-uia="video-title"]');
      if (node) {
        let title: string | null = [...node.children]
          .map((childNode) => {
            return childNode.textContent;
          })
          .join(' ');

        // c: if we don't know the title, mark it as null
        if (title === '') {
          title = null;
        }

        this.results.setVideoTitle(title);
      }
    }

    properties = {
      isEnabled: result.isEnabled,
      isSubtitleFeatureEnabled: result.isSubtitleFeatureEnabled,
      title: this.results.videoTitle,
      sourceUrl: window.location.href,
      ...properties,
    };

    this.bl.publishAction('track/event', {
      payload: {
        name,
        properties,
      },
    });
  };

  activateSubtitles() {
    const service = this.service ?? Utils.detectService();
    this.service = service;

    if (
      (service && service instanceof Netflix) ||
      (service && service instanceof Youtube)
    ) {
      // Listeners for the site/service events, and inject into the page.
      window.addEventListener('inkahsubsVideoReady', () => {
        // On video change, clear old subtitles. Prevents them from appearing briefly before new subtitles load
        updateSubs([]);
        updateNativeSubs([]);
        this.results.setRawSubtitles([]);
        this.results.setRawNativeSubtitles([]);

        if (service instanceof Youtube) {
          b.storage.local
            .get(['isEnabled', 'isSubtitleFeatureEnabled'])
            .then((result) => {
              const areCaptionsOn =
                result.isEnabled && result.isSubtitleFeatureEnabled;
              service.turnClosedCaptionsOn(areCaptionsOn);
            });
        }
      });

      window.addEventListener('inkahsubsSubtitlesChanged', (event: any) => {
        // exue: Inject items when we have sufficient data to include here
        // 豆: event.detail depends on the source, i.e. YT or Netflix, so gate accordingly
        let videoLanguage =
          service instanceof Netflix ? event.detail.language : event.detail;
        const userLanguage = userLanguageStore.getState();

        if (Utils.isNetflix()) {
          VideoSubtitlesComposer.mountSettings(service.settingsSelector());
        } else if (Utils.isYoutube()) {
          VideoSubtitlesComposer.mountSettings(
            service.settingsSelector(),
            service.settingsContentSelector()
          );

          // if (
          //   videoLanguage === NATIVE_LANGUAGE ||
          //   (videoLanguage.indexOf('zh') === -1 &&
          //     videoLanguage.indexOf('ko') === -1)
          // ) {
          //   // c: necessary for fixing the issue where
          //   // navigating on Youtube without a page refresh
          //   // causes the subtitles to appear on videos that don't have
          //   // equivalent subtitles
          //   if (this.results.subtitles) {
          //     updateSubs([]);
          //     updateNativeSubs([]);
          //     this.results.setRawSubtitles([]);
          //     this.results.setRawNativeSubtitles([]);
          //   }

          //   return;
          // }
        }

        if (service instanceof Netflix) {
          VideoSubtitlesComposer.mountRightPanel(
            config.netflixSelectors.playerContainer
          );
        } else if (service instanceof Youtube) {
          VideoSubtitlesComposer.mountRightPanel(
            config.youTubeSelectors.rightPanel
          );

          b.storage.local
            .get(['isEnabled', 'isSubtitleFeatureEnabled'])
            .then((result) => {
              const areCaptionsOn =
                result.isEnabled && result.isSubtitleFeatureEnabled;
              service.turnClosedCaptionsOn(areCaptionsOn);
            });
        }

        VideoSubtitlesComposer.mountCenterSubs(
          service.playerContainerSelector()
        );

        VideoSubtitlesComposer.mountProgressBar(
          service.playerContainerSelector()
        );

        VideoSubtitlesComposer.mountNotifications();

        if (videoLanguage) {
          // If a subtitle language is set. This can also be be null if we turn subtitles off
          this.switchLangBasedOnVideoLang(videoLanguage);
          updateSubtitlesLoadingState(true);

          // c: in case the video has completely switched from autoplay,
          // we want to identify when we DONT know
          this.results.setVideoTitle(null);
          setTimeout(() => {
            this.trackVideo({
              name: 'Video Subtitles Loading Started',
              properties: {
                language: videoLanguage,
              },
            });
          }, 300);

          service.getSubs(videoLanguage).then((subs) => {
            // c: update legacy subs effector, raw subtitles, and
            // clear the previously parsed subtitles so there isn't
            // an intermediate state between pulled subs + previously parsed subs
            // if the user is changing languages or changing shows
            if (this.results.subtitles) {
              this.results.setSubtitles(null);
            }

            this.results.setRawSubtitles(subs);
            this.parseSubtitles(subs, videoLanguage);
            updateSubs(subs);
            updateSubtitlesLoadingState(false);

            setTimeout(() => {
              this.trackVideo({
                name: 'Video Subtitles Loading Completed',
                properties: {
                  language: videoLanguage,
                },
              });
            }, 300);
          });

          // exue: Don't have native subs if same language. After we add non-English native
          // may have to deal with non-perfect matches e.g. native 'ko', sub 'ko-cc'.
          if (videoLanguage !== userLanguage) {
            this.fetchNativeSubs(userLanguage);
          }
        } else {
          // exue: null event.detail = Off for subtitles.
          // exue(todo): Investigate some shows, like It's Okay Not to Be Okay, having Off subtitiles = still 'ko'
          updateSubs([]);
          updateNativeSubs([]);
          this.results.setRawSubtitles([]);
          this.results.setRawNativeSubtitles([]);
        }

        if (Utils.isNetflix()) {
          const playerContainer = document.querySelector(
            config.netflixSelectors.playerContainer
          );
          const player = document.querySelector(config.netflixSelectors.player);

          const handleSettingsShown = (mutationsList, observer) => {
            if (playerContainer) {
              VideoSubtitlesComposer.mountSettings(service.settingsSelector());
            }
          };

          // Create an observer instance linked to the callback function
          const observer = new MutationObserver(handleSettingsShown);

          // Start observing the target node for configured mutations
          observer.observe(player, { attributes: true });
        } else if (Utils.isYoutube()) {
          const playerContainer = document.querySelector(
            config.youTubeSelectors.playerContainer
          );
          const player = document.querySelector(config.youTubeSelectors.player);

          const handleSettingsShown = (mutationsList, observer) => {
            if (playerContainer) {
              VideoSubtitlesComposer.mountSettings(
                service.settingsSelector(),
                service.settingsContentSelector()
              );
            }
          };

          // Create an observer instance linked to the callback function
          const observer = new MutationObserver(handleSettingsShown);

          // Start observing the target node for configured mutations
          observer.observe(player, { attributes: true });
        }

        // Later, you can stop observing
        // observer.disconnect();
        // playerContainer?.addEventListener('mouseover', handlePlayerMouseOver);
      });

      // Once we have the listeners ready, we can inject the native script code
      // that we need in order to listen for (the extension execution context/closure can't access netflix variable)
      service.init();

      (subsStore as any).on(
        updateSubs,
        (state: subTitleType[], subs: subTitleType[]) => subs
      );
      (nativeSubsStore as any).on(
        updateNativeSubs,
        (state: subTitleType[], subs: subTitleType[]) => {
          // console.log(
          //   '[d:VideoSubtitlesComposer.onNativeSubsStore] subs.length',
          //   subs?.length
          // );
          return subs;
        }
      );
      (subtitlesLoadingStateStore as any).on(
        updateSubtitlesLoadingState,
        (state: boolean, newState: boolean) => newState
      );
    }
  }

  fetchNativeSubs = (userLanguage) => {
    const service = Utils.detectService();
    // exue: Don't have native subs if same language. After we add non-English native
    // may have to deal with non-perfect matches e.g. native 'ko', sub 'ko-cc'.
    // console.log(
    //   '[debug:NativeSubs] languages are different, fetching subs: ',
    //   userLanguage
    // );
    service.getSubs(userLanguage).then(
      (subs) => {
        // console.log(
        //   '[debug:NativeSubs] NativeSubs FETCHED: ',
        //   userLanguage,
        //   subs?.length
        // );
        if (Utils.isYoutube()) {
          subs.forEach((sub) =>
            typeof sub.text === 'undefined'
              ? (sub.text = '<en>')
              : (sub.text = '<en>' + sub.text)
          );
          // subs.forEach((sub) =>
          //   typeof sub.text === 'undefined'
          //     ? (sub.text = `<${userLanguage}>`)
          //     : (sub.text = `<${userLanguage}>` + sub.text)
          // );
        }
        updateNativeSubs(subs);
        this.results.setRawNativeSubtitles(subs);
      },
      (error) => {
        console.log('[error:NativeSubs] NativeSubs ERRORED OUT: ', error);
      }
    );
  };

  static mountRightPanel(playerContainerSelector: string) {
    const prevRightContainerElement = document.getElementById('inRightPanel');
    if (prevRightContainerElement != null) {
      return;
    }

    const rightContainerElement = document.createElement('div');
    rightContainerElement.id = 'inRightPanel';

    const node = document.querySelector<HTMLElement>(playerContainerSelector);

    if (!node) {
      return;
    }

    // 21/09/09 c: commenting out because of the UI changes done for Netflix
    // 21/09/29 豆: This puts the right panel back in front of the video, but breaks like crazy
    if (Utils.isNetflix()) {
      node.insertBefore(rightContainerElement, null);
    } else if (Utils.isYoutube()) {
      node.prepend(rightContainerElement);
    }

    ReactDOM.render(
      <WithApollo config={config}>
        <RightPanel />
      </WithApollo>,
      document.querySelector('#inRightPanel')
    );
  }

  static mountCenterSubs(playerContainerElementSelector: string) {
    const prevSubsContainerElement = document.getElementById('inkahsubs');
    if (prevSubsContainerElement != null) return;

    const playerContainerElement = document.querySelector(
      playerContainerElementSelector
    );
    const subsContainerElement = document.createElement('div');
    subsContainerElement.id = 'inkahsubs';
    playerContainerElement.appendChild(subsContainerElement);

    ReactDOM.render(<CenterSubs />, document.querySelector('#inkahsubs'));
  }

  static mountProgressBar(playerContainerElementSelector: string) {
    const prevProgressBarElement = document.querySelector(
      '.inkahsubs-progress-bar'
    );
    if (prevProgressBarElement != null) return;

    const playerContainerElement = document.querySelector(
      playerContainerElementSelector
    );
    const progressBarElement = document.createElement('div');
    progressBarElement.className = 'inkahsubs-progress-bar';
    playerContainerElement.appendChild(progressBarElement);

    ReactDOM.render(
      <ProgressBar />,
      document.querySelector('.inkahsubs-progress-bar')
    );
  }

  static mountSettings(
    settingsSelector: string,
    settingsContentSelector?: string
  ) {
    const prevNode = document.querySelector('.inkahsubs-settings');
    if (prevNode) return;

    // c(todo): convert to just passing a node rather than a specific selector
    let node = document.querySelector(settingsSelector);
    if (!node && Utils.isNetflix()) {
      node =
        document.querySelector('[aria-label="Exit full screen"]') ||
        document.querySelector('[data-uia="control-fullscreen-exit"]') ||
        document.querySelector('[aria-label="Enter full screen"]');
    }

    const referenceNode = node?.parentNode;
    if (!referenceNode) {
      return;
    }

    const parentNode = referenceNode.parentNode;
    const settingNode = document.createElement('div');
    settingNode.className = 'inkahsubs-settings';
    parentNode.insertBefore(settingNode, referenceNode);

    ReactDOM.render(
      <SettingsWrapper settingsContentSelector={settingsContentSelector} />,
      settingNode
    );
  }

  static mountNotifications() {
    const prevNode = document.querySelector('.inkahsubs-notifications');
    if (prevNode) return;
    const referenceNode = document.querySelector('body');
    const parentNode = referenceNode.parentNode;
    const settingNode = document.createElement('div');
    settingNode.className = 'inkahsubs-notifications';
    parentNode.insertBefore(settingNode, referenceNode);

    ReactDOM.render(
      <Notification />,
      document.querySelector('.inkahsubs-notifications')
    );
  }
}
