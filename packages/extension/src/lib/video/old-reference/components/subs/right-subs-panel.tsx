import { useStore } from 'effector-react';
import { useQuery } from '@apollo/client';
import cx from 'classnames';
import React, {
  useEffect,
  useState,
  useLayoutEffect,
  useRef,
  MutableRefObject,
} from 'react';
import { Button, Spin } from 'antd';
import { Observer } from 'mobx-react-lite';
import {
  LoadingOutlined,
  VerticalAlignMiddleOutlined,
} from '@ant-design/icons';
import { settingsQueryGql } from '../../../knowledge-save/knowledge-queries';
import { toggleShowFullSubTranslatePopup } from '../../event';
import {
  showFullSubTranslatePopupStore,
  subsStore,
  subsFontSizeStore,
  nativeSubsStore,
  showRightPanelState,
  subtitlesLoadingStateStore,
} from '../../store';
import appComposer, { useComposer } from '../../../app-exists/app-composer';
import { resultsComposer } from '../../../dictionaries-search/results-composer';
import {
  getCleanSubText,
  getMarkerIndex,
  getSubWordsNodes,
  findActiveVideo,
} from '../../subtitle-utilities';
import ShowRightPanelToggle from './show-right-panel-toggle';
import SubtitleLine from './subtitle-line';

import { b } from '../../../app-exists/webext-polyfill';
import { subTitleType } from 'subtitle';

import Utils from '../../utils';
import config from '../../../app-exists/extension-config';

const PAUSE_AUTO_SCROLL_TIME = 20000;
const isDarkModeWebsite =
  window.location.href.indexOf(config.NetflixUrl) !== -1;

function RightPanel() {
  const subs = useStore(subsStore);
  const subsFontSize = useStore(subsFontSizeStore);
  const [videoElement, setVideoElement] = useState(findActiveVideo());
  const [fontSize, setFontSize] = useState(24);
  const nativeSubs = useStore(nativeSubsStore);
  const [isSubtitleFeatureEnabled, setisSubtitleFeatureEnabled] = useState(
    false
  );
  const areSubtitlesLoadingFromServer = useStore(subtitlesLoadingStateStore);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [basicSubs, setBasicSubs] = useState([]);

  const showRightPanel = useStore(showRightPanelState);
  const shouldShowRightPanel = Utils.isYoutube() ? true : showRightPanel;

  const isLoading =
    areSubtitlesLoadingFromServer ||
    (subs.length > 0 && basicSubs.length === 0);

  const { data, refetch: settingsRefetch } = useQuery(settingsQueryGql, {
    fetchPolicy: 'cache-and-network',
  });
  const shouldUseDarkMode = data?.settings?.isDarkModeOn || isDarkModeWebsite;

  const { composer } = useComposer(resultsComposer, { appComposer });
  const { results } = composer.useUseCases();

  useEffect(() => {
    const fetch = async () => {
      const result = await b.storage.local.get(['isSubtitleFeatureEnabled']);

      setisSubtitleFeatureEnabled(result.isSubtitleFeatureEnabled ?? true);
    };

    fetch();

    const settingsChangesListener = (changes, namespace) => {
      if (changes.isSubtitleFeatureEnabled) {
        setisSubtitleFeatureEnabled(changes.isSubtitleFeatureEnabled.newValue);
      }

      if (changes.isDarkModeOn) {
        settingsRefetch();
      }
    };

    b.storage.onChanged.addListener(settingsChangesListener);

    return () => {
      b.storage.onChanged.removeListener(settingsChangesListener);
    };
  }, [isSubtitleFeatureEnabled, setisSubtitleFeatureEnabled]);

  let myRef = useRef<HTMLDivElement | null>(null);
  let scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // If user has scrolled manually in the last PAUSE_AUTO_SCROLL_TIME
  // milliseconds, then we don't automatically scroll the right panel.
  let userScrolledTime = useRef(0);
  let ignoreNextScroll = useRef(false);

  useEffect(() => {
    // exue: On autoplay, the video element can be set to a stale empty <video style=""></video>
    // temporarily - need to watch and update
    const currentVideoElement = findActiveVideo();

    // Find the video element
    // also instead updating on time, we can do just do the every 100ms

    if (currentVideoElement) {
      if (!videoElement || videoElement.src !== currentVideoElement.src) {
        setVideoElement(currentVideoElement);
      }

      currentVideoElement.addEventListener('timeupdate', handleTimeUpdate);

      return () => {
        currentVideoElement.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [subs, nativeSubs, videoElement, basicSubs]);

  function updateSize() {
    // c. round in order to avoid unnecessary repaints and reflows from the font
    // size changing by fractional decimal places
    // todo: add a debounce for layout effects to avoid reflowing and repainting
    // overly often with window resizing
    if (videoElement.clientWidth !== 0) {
      const newFontSize = Math.round(
        Math.max(((videoElement.clientWidth / 100) * subsFontSize) / 48, 16)
      );
      setFontSize(newFontSize);
    } else {
      // c. do nothing, leave the font size alone
    }
  }

  useLayoutEffect(() => {
    // When the video element gets reset/cleared, the font size can also get squashed to zero.
    // We should treat video element without a src as non video. For now, make sure to just re-calculate
    // size whenever video element is updated
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(videoElement);

    return () => window.removeEventListener('resize', updateSize);
  }, [subsFontSize, videoElement]);

  function parseSubs() {
    const subsToRender = subs.map((subtitle: subTitleType, index: number) => {
      let marginBottom = 4;

      // margin-bottom ranges from [6, 42] px depending on time since last spoken word
      // 0 seconds: 3px, 6 seconds or more: 42px
      if (index < subs.length - 1) {
        const nextSubtitleStartTime = Number(subs[index + 1].start);
        const timeGap = nextSubtitleStartTime - subtitle.end;
        marginBottom = Math.min(42, (timeGap / 1000) * 6 + 6);
      }

      const subTextVtt = subtitle.text || '';
      const parsedSubtitle =
        results.subtitles?.length > index ? results.subtitles[index] : null;
      const cleanSubText =
        parsedSubtitle?.cleanText ?? getCleanSubText(subTextVtt);

      let subWordsNodes;
      if (subTextVtt.indexOf('chinese') !== -1 && parsedSubtitle != null) {
        subWordsNodes = getSubWordsNodes(
          parsedSubtitle.spaceDelimitedWords,
          false
        );
      } else {
        subWordsNodes = getSubWordsNodes(subTextVtt);
      }

      return {
        text: cleanSubText,
        words: subWordsNodes,
        marginBottom,
        subtitle,
      };
    });

    setBasicSubs(subsToRender);
  }

  // Scroll if the item is not entirely visible - trailing edge is the bottom edge
  const isInViewport = (element, offset = 0): boolean => {
    if (!element) {
      return false;
    }

    const bottom = element.getBoundingClientRect().bottom;
    const containerHeight =
      scrollContainerRef?.current?.offsetHeight || window.innerHeight;
    return bottom + offset >= 0 && bottom - offset <= containerHeight;
  };

  const scrollToCurrent = (shouldScroll: boolean = false): null => {
    if (shouldScroll) {
      const top = myRef.current?.offsetTop;
      if (top && scrollContainerRef.current) {
        // @see https://stackoverflow.com/questions/635706/how-to-scroll-to-an-element-inside-a-div
        // c: if we're on Youtube, the right subs panel isn't aligned
        // with the top of the window, so scrollTo will scroll the right subs panel
        // AND the full window, which is irritating UX. Here we just change the view
        // rather than have a smooth scroll to get it done
        if (Utils.isYoutube()) {
          scrollContainerRef.current.scrollTop = top;
        } else {
          scrollContainerRef.current?.scrollTo({
            top,
            left: 0,
            behavior: 'smooth',
          });
        }
      }
      return null;
    }

    // Pause auto-scroll for PAUSE_AUTO_SCROLL_TIME after user manually scrolls
    if (
      Date.now() - userScrolledTime.current > PAUSE_AUTO_SCROLL_TIME &&
      !isInViewport(myRef.current)
    ) {
      // Don't scroll unless our current track moves off screen
      // exue: Calculate manually, since scrollIntoViewIfNeeded is not on Firefox
      // as of 2021-02-09 https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoViewIfNeeded
      ignoreNextScroll.current = true;

      if (Utils.isYoutube() && scrollContainerRef.current && myRef.current) {
        const top = myRef.current.offsetTop;
        scrollContainerRef.current.scrollTop = top;
      } else {
        myRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleScroll = (e) => {
    if (ignoreNextScroll.current === true) {
      // exue: see if us ignoring scroll events coming from browser would
      // cause autos-scroll to break on resizing window https://stackoverflow.com/a/47553150
      ignoreNextScroll.current = false;
    } else {
      userScrolledTime.current = Date.now();
    }
  };

  // exue: add the current sub higlight arrow to the basic subs
  // If rendering basic subs takes 150ms even only on the shadow DOM, then modifying
  // a single sub takes <1ms, instead of repeating the 150ms on each render cycle
  const renderCurrentSubs = () => {
    let currentSubs: JSX.Element[] = [];
    if (basicSubs.length <= 0) return null;

    currentSubs = basicSubs.map((subtitleMeta, index) => {
      const { text, words, subtitle, marginBottom } = subtitleMeta;
      const prevSub = index > 0 ? basicSubs[index - 1] : null;
      const nextSub =
        index < basicSubs.length - 1 ? basicSubs[index + 1] : null;
      const isActive = index === highlightIndex;
      return (
        <div key={`show_${index}`} ref={isActive ? myRef : null}>
          <SubtitleLine
            text={text}
            words={words}
            relativeSize="95%"
            isActive={isActive}
            key={index}
            subtitleStart={subtitle.start}
            subtitleEnd={subtitle.end}
            prevSubtitleEnd={prevSub?.subtitle?.end}
            nextSubtitleStart={nextSub?.subtitle?.start}
            marginBottom={marginBottom}
          />
        </div>
      );
    });

    return currentSubs;
  };

  const handleTimeUpdate = () => {
    setHighlightIndex(getMarkerIndex(videoElement, subs));
    scrollToCurrent();
  };

  const handleScrollClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    scrollToCurrent(true);
  };

  let playerContainerSelector;
  let playerSelector;

  if (Utils.isNetflix()) {
    playerContainerSelector = config.netflixSelectors.playerContainer;
    playerSelector = config.netflixSelectors.player;
  } else if (Utils.isYoutube()) {
    playerContainerSelector = config.youTubeSelectors.playerContainer;
    playerSelector = config.youTubeSelectors.player;
  }

  // const playerContainerSelector = '.watch-video';
  // const playerSelector = '[data-uia="player"]';

  useEffect(() => {
    const modifierClassName = 'watch-video__hasRightPanel';
    const playerView = document.querySelector(
      playerContainerSelector
    ) as HTMLDivElement;

    if (shouldShowRightPanel && playerView) {
      playerView.classList.add(modifierClassName);
    } else if (
      !shouldShowRightPanel &&
      playerView.classList.contains(modifierClassName)
    ) {
      playerView.classList.remove(modifierClassName);
    }
  }, [shouldShowRightPanel]);

  // c: for youtube, if subs are [] and they've completed loading, don't show
  // the right panel. Invariant 30 of react, always render the same number
  // of hooks requires this check be at the bottom
  if (!areSubtitlesLoadingFromServer && (!subs || subs.length === 0)) {
    return null;
  }

  return (
    <div
      className={cx('inkahsubs-right-half-subtitles', {
        in_themeDarkPleco: shouldUseDarkMode,
      })}
      style={{
        fontSize: `${fontSize}px`,
        userSelect: 'text',
      }}
      onClick={(e) => {
        e.stopPropagation();
        // exue: Keep focus on player so user can pause/unpause with spacebar. Use service?
        document.querySelector(playerSelector)?.focus();
      }}
    >
      {Utils.isNetflix() && <ShowRightPanelToggle />}
      {shouldShowRightPanel && (
        <div
          onScroll={handleScroll}
          className="in_rightPanel_scrollContainer"
          ref={scrollContainerRef}
        >
          <div className="in_scrollMiddleButtonContainer">
            <Button
              type="primary"
              shape="circle"
              className="in_scrollMiddleButton"
              icon={<VerticalAlignMiddleOutlined />}
              onClick={handleScrollClick}
            />
          </div>
          <Observer>
            {() => {
              useEffect(() => {
                parseSubs();
              }, [subs, results.subtitles, videoElement]);

              return isLoading ? (
                <div
                  style={{
                    position: 'absolute',
                    textAlign: 'center',
                    margin: 'auto',
                    top: '40vh',
                    left: '0',
                    right: '0',
                  }}
                >
                  <Spin
                    indicator={
                      <LoadingOutlined style={{ fontSize: 36 }} spin />
                    }
                  />
                </div>
              ) : (
                <>{renderCurrentSubs()}</>
              );
            }}
          </Observer>
        </div>
      )}
    </div>
  );
}

(showFullSubTranslatePopupStore as any).on(
  toggleShowFullSubTranslatePopup,
  (state: any, isShow: boolean) => isShow
);

export default RightPanel;
