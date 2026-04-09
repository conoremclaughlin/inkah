import { useStore } from 'effector-react';
import React, { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { toggleIsAutoPausedState } from '../../event';
import {
  subsStore,
  isAutoPausedState,
  subsFontSizeStore,
  showNativeState,
  nativeSubsStore,
  shouldAutoPauseSettingStore,
  subtitlesLoadingStateStore,
} from '../../store';
import {
  convertSubtitlesToVtt,
  tokenizeChineseSubs,
  getCleanSubText,
  getTargetAndNativeSubsForCurrentTime,
  getSubWordsNodes,
  findActiveVideo,
} from '../../subtitle-utilities';
import SubtitleLine from './subtitle-line';
import Draggable from 'react-draggable';
import appComposer, { useComposer } from '../../../app-exists/app-composer';
import { resultsComposer } from '../../../dictionaries-search/results-composer';
import { toRomanizationFromHangulAndOtherText } from '../../../dictionaries-search/parse-korean';
import { showTransliterationState } from '../../store';
import Utils from '../../utils';
import { subTitleType } from 'subtitle';
import { settingsQueryGql } from '../../../knowledge-save/knowledge-queries';
import { useQuery } from '@apollo/client';
import config from '../../../app-exists/extension-config';
import { WithApollo } from '../../../graphql-chosen/with-apollo';

function SubtitleRow({
  subtitles,
  firstSubIndex,
  parsedSubtitles,
  relativeFontSize,
  shouldUseRomanization = false,
}: {
  subtitles?: subTitleType[];
  firstSubIndex?: number;
  parsedSubtitles?: InParsedSubtitle[];
  relativeFontSize: string;
  shouldUseRomanization?: boolean;
}) {
  if (!subtitles || firstSubIndex == null) return null;
  let vttList = convertSubtitlesToVtt(subtitles);
  let { loading, data, error } = useQuery(settingsQueryGql);
  // determining if the vtt is the chinese vtt is diifferent for Netflix and Youtube, so had to pull this true/false check out to a separate function  with different conditions for each service
  let wordsNodes;
  let cleanSubText;

  const parseChineseSubs = (index: number): void => {
    // c(todo): this refactor doesn't return values here for some reason. It should
    // return values instead of modifying values on the parent scope
    if (!parsedSubtitles) return;
    let subtitleIndex = firstSubIndex + index;
    const parsedSubtitle = parsedSubtitles[subtitleIndex];

    if (shouldUseRomanization) {
      cleanSubText = parsedSubtitle.romanization;
      wordsNodes = getSubWordsNodes(parsedSubtitle.romanization, true);
    } else {
      // console.log(
      //   '[d:parseChineseSubs] parsedSubtitle.spaceDelimitedWords: ',
      //   parsedSubtitle.spaceDelimitedWords
      // );
      // console.log(
      //   '[d:parseChineseSubs] parsedSubtitle.cleanText: ',
      //   parsedSubtitle.cleanText
      // );
      cleanSubText = parsedSubtitle.cleanText || '';
      wordsNodes = getSubWordsNodes(
        parsedSubtitle.spaceDelimitedWords || cleanSubText,
        false
      );
    }
  };

  const parsedSubsExist = (subtitleIndex) => {
    return (
      parsedSubtitles != null &&
      parsedSubtitles.length > subtitleIndex &&
      parsedSubtitles[subtitleIndex] != null
    );
  };

  // c: Youtube pulls from /api/timedtext for subtitles so you can filter
  // in the web inspector for it to see the example format
  const lines = vttList.map((subTextVtt: string, index: number) => {
    let subtitleIndex = firstSubIndex + index;
    if (Utils.isYoutube() && subTextVtt.indexOf('<en>') !== -1) {
      // we need to get to this branch when the language is 'en', bc references to parsedSubtitles is always going to give the targetLanguage
      wordsNodes = getSubWordsNodes(subTextVtt, true);
      cleanSubText = getCleanSubText(subTextVtt);
    } else if (
      // if Netflix, index of Chinese works
      // for Youtube WEBVTT, need the zh check
      (subTextVtt.indexOf('chinese') !== -1 ||
        (Utils.isYoutube() && subTextVtt.indexOf('zh') !== -1)) &&
      parsedSubsExist(subtitleIndex)
    ) {
      parseChineseSubs(index);
    } else {
      if (shouldUseRomanization && subTextVtt.indexOf('korean') !== -1) {
        const cleaned = getCleanSubText(subTextVtt);
        cleanSubText = toRomanizationFromHangulAndOtherText(cleaned);
        wordsNodes = getSubWordsNodes(cleanSubText, true);
      } else {
        wordsNodes = getSubWordsNodes(subTextVtt, true);
        cleanSubText = getCleanSubText(subTextVtt);
      }
    }

    return (
      <SubtitleLine
        isCenter={true}
        text={cleanSubText}
        words={wordsNodes}
        key={index}
        relativeSize={relativeFontSize}
        marginBottom={0}
      />
    );
  });

  return <>{lines}</>;
}

// This is the subtitle component that appears in the main/center area,
// over the video. It will pause the video when we mouse over
function CenterSubs() {
  const subs = useStore(subsStore);
  const nativeSubs = useStore(nativeSubsStore);
  const isAutoPaused = useStore(isAutoPausedState);
  const subsFontSize = useStore(subsFontSizeStore);
  const shouldShowNative = useStore(showNativeState);
  const shouldShowTransliteration = useStore(showTransliterationState);
  const shouldAutoPauseSetting = useStore(shouldAutoPauseSettingStore);
  const areSubtitlesLoadingFromServer = useStore(subtitlesLoadingStateStore);

  const [videoElement, setVideoElement] = useState(findActiveVideo());
  const [fontSize, setFontSize] = useState(38);
  const [currentSubs, setCurrentSubs] = useState<{
    targetSubs?: subTitleType[];
    nativeSubs?: subTitleType[];
    firstSubIndex?: number;
  }>({});
  const { composer } = useComposer(resultsComposer, { appComposer });
  const { results } = composer.useUseCases();

  useEffect(() => {
    // c(todo): i'm a little concerned about this legacy code for
    // not adding keyboard listeners in the composer itself and instead
    // in the react component... unintended side effects if someone decides
    // not to render the component for whatever reason
    // Utils.addKeyboardEventsListeners();

    // exue: On autoplay, the video element can be set to a stale empty <video style=""></video>
    // temporarily - need to watch and update
    const currentVideoElement = findActiveVideo();
    if (currentVideoElement) {
      if (!videoElement || videoElement.src !== currentVideoElement.src) {
        setVideoElement(currentVideoElement);
      }

      currentVideoElement.addEventListener('timeupdate', handleTimeUpdate);

      return () => {
        // Utils.removeKeyboardEventsListeners();
        currentVideoElement.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
    // console.log(
    //   '[d:CenterSubs:useEffect] nativeSubs.length: ',
    //   nativeSubs.length
    // );
  }, [
    shouldAutoPauseSetting,
    subs,
    nativeSubs,
    shouldShowNative,
    shouldShowTransliteration,
    videoElement,
    isAutoPaused,
    subsFontSize,
  ]);

  function updateSize() {
    let newFontSize;
    let minFontSize;
    let clientWidth = videoElement?.clientWidth ?? 1024;

    if (clientWidth > 1000) {
      minFontSize = 28;
    } else {
      minFontSize = 24;
    }

    // c: subsFontSize is a percentage: 100, 110, etc.
    newFontSize = Math.round(
      Math.max(
        ((clientWidth / 100) * subsFontSize) / 43,
        minFontSize * (subsFontSize / 100)
      )
    );
    // setFontSize(((videoElement.clientWidth / 100) * subsFontSize) / 43);
    setFontSize(newFontSize);
  }

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(videoElement as Element);

    return () => window.removeEventListener('resize', updateSize);
  }, [subsFontSize, videoElement]);

  async function handleTimeUpdate() {
    const currentVideoElement = findActiveVideo();

    // c(bug): this once again looks like bad code smell from Eddie.
    // would videoElement be updated in time for the call below??
    // likely not since the value is reset then...
    // going to set a video element only for this function for now
    let foundVideoElement;
    if (
      currentVideoElement &&
      (!videoElement || videoElement.src !== currentVideoElement.src)
    ) {
      // We also to need to watch for video element change, in case user clicks directly on "Next episode" for autoplay
      setVideoElement(currentVideoElement);
      foundVideoElement = currentVideoElement;
    } else {
      foundVideoElement = videoElement;
    }

    if (isAutoPaused) {
      if (currentVideoElement?.paused) {
        return;
      } else {
        toggleIsAutoPausedState(false);
      }
    }

    let subsResult = getTargetAndNativeSubsForCurrentTime(
      foundVideoElement,
      subs,
      shouldShowNative ? nativeSubs : [],
      shouldShowNative as boolean
    );

    setCurrentSubs(subsResult);
  }

  function handleOnMouseEnter() {
    if (!shouldAutoPauseSetting) {
      return;
    }

    if (!videoElement.paused) {
      toggleIsAutoPausedState(true);
      Utils.detectService().pause(videoElement);

      appComposer.bl.publishAction('track/event', {
        payload: {
          name: 'Video Playback Started',
          properties: {
            title: results.videoTitle,
            sourceUrl: window.location.href,
          },
        },
      });
    }
  }

  function handleOnMouseLeave() {
    if (isAutoPaused) {
      toggleIsAutoPausedState(false);
      Utils.detectService().play(videoElement);
      appComposer.bl.publishAction('track/event', {
        payload: {
          name: 'Video Playback Paused',
          properties: {
            title: results.videoTitle,
            sourceUrl: window.location.href,
          },
        },
      });
    }
  }

  const isLoading = areSubtitlesLoadingFromServer;
  // console.log('[d:CenterSubs] ACTUAL nativeSubs.length: ', nativeSubs.length);
  // console.log(
  //   '[d:CenterSubs] centerSubs.nativeSubs.length: ',
  //   currentSubs.nativeSubs?.length
  // );
  // console.log(
  //   '[d:CenterSubs] centerSubs.nativeSubs first element: ',
  //   currentSubs.nativeSubs?.length > 0 && nativeSubs[0]
  // );
  // console.log(
  //   '[d:CenterSubs] targetSubs.length: ',
  //   currentSubs?.targetSubs?.length
  // );

  return (
    <WithApollo config={config}>
      <Draggable>
        <div
          className="inkahsubs-subtitles"
          style={{ fontSize: `${fontSize}px` }}
        >
          {isLoading ? (
            <span style={{ fontSize: '24px', opacity: 0.75 }}>
              {`loading subtitles...`}
            </span>
          ) : (
            <>
              {shouldShowTransliteration && (
                <SubtitleRow
                  subtitles={currentSubs.targetSubs}
                  firstSubIndex={currentSubs.firstSubIndex}
                  parsedSubtitles={results?.subtitles}
                  relativeFontSize="70%"
                  key="transliteration"
                  shouldUseRomanization
                />
              )}
              <div
                onMouseEnter={handleOnMouseEnter}
                onMouseLeave={handleOnMouseLeave}
              >
                <SubtitleRow
                  firstSubIndex={currentSubs.firstSubIndex}
                  subtitles={currentSubs.targetSubs}
                  parsedSubtitles={results?.subtitles}
                  relativeFontSize="120%"
                  key="target"
                />
              </div>
              <SubtitleRow
                firstSubIndex={currentSubs.firstSubIndex}
                subtitles={currentSubs.nativeSubs}
                // parsedSubtitles={results?.subtitles}
                relativeFontSize="75%"
                key="native"
              />
            </>
          )}
        </div>
      </Draggable>
    </WithApollo>
  );
}

(isAutoPausedState as any).on(
  toggleIsAutoPausedState,
  (state: any, enable: boolean) => enable
);

export default CenterSubs;
