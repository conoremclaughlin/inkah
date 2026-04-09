import { subTitleType } from 'subtitle';
import Video from './video';
import config from '../app-exists/extension-config';
import { AppComposer } from '../app-exists/app-composer';
import {
  toPinyinFromToneSuffix,
  toZhuyinFromPinyin,
  toZhuyinFromToneSuffix,
} from '../dictionaries-search/parse-chinese';
import Word from './components/subs/subtitle-word';
import Utils from './utils';
import { settingsQueryGql } from '../knowledge-save/knowledge-queries';
import { useQuery } from '@apollo/client';

export const convertSubtitlesToVtt = (subs: subTitleType[]): string[] => {
  return subs.map((sub: subTitleType) => sub.text || '');
};

export const getTargetAndNativeSubsForCurrentTime = (
  video: HTMLVideoElement,
  subs: subTitleType[],
  nativeSubs: subTitleType[],
  shouldShowNative: boolean
): {
  targetSubs: subTitleType[];
  nativeSubs: subTitleType[];
  firstSubIndex?: number;
} => {
  const currentTime = Video.getCurrentTime(video);

  // let currentSubs = getAllCurrentSub(subs, currentTime);
  // c(???): i'm not sure when multiple subs start and end would
  // stride over the current time. Feels like it should be only
  // one sub at a time based on linear progression
  let currentSubs: subTitleType[] = [];
  let firstSub;
  let firstSubIndex;
  subs.forEach((sub, index) => {
    if (sub.start <= currentTime && currentTime <= sub.end) {
      if (firstSub == null) {
        firstSub = sub;
        firstSubIndex = index;
      }
      currentSubs.push(sub);
    }
  });

  // c: necessary if our target language is one long subtitle
  // and multiple shorter subtitles are shown in the native language
  // during the target language subtitle's duration
  const prevEndTime =
    firstSubIndex > 0 ? Number(subs[firstSubIndex - 1].end) : null;
  const nextStartTime =
    firstSubIndex < subs.length - 1
      ? Number(subs[firstSubIndex + 1].start)
      : null;
  let currentNativeSubs: subTitleType[] = [];

  // Never show native subs if the target language subs are not visible -
  // this prevents us from excessive flickering of subs on and off.
  // c(ux): potentially revisit this decision later
  if (currentSubs.length > 0 && shouldShowNative) {
    currentNativeSubs = getSubForStartEndTime(
      Number(firstSub.start),
      Number(firstSub.end),
      nativeSubs,
      prevEndTime,
      nextStartTime
    );
  }

  return {
    firstSubIndex: firstSubIndex,
    targetSubs: currentSubs,
    nativeSubs: currentNativeSubs,
  };
};

export const getMarkerIndex = (
  video: HTMLVideoElement,
  subs: subTitleType[]
): number => {
  const currentTime = Video.getCurrentTime(video);

  let highlightIndex = -1;

  // exue: Binary search time w/ closest/"at least" currentTime finder?
  // Doesn't matter, linear search is on the order of microseconds for 100s-1000s of subtitles
  for (let i = subs.length - 1; i >= 0; i--) {
    if (currentTime >= subs[i].start) {
      highlightIndex = i;
      break;
    }
  }
  return highlightIndex;
};

export const subTextToChildNodesArray = (text: string): ChildNode[] => {
  if (!text) return [];
  const tmpDiv = document.createElement('div') as HTMLDivElement;
  tmpDiv.innerHTML = text
    .replace(/(<\d+:\d+:\d+.\d+>)?<[\/]?[c].*?>/g, '')
    .replace(/[\r\n]+/g, '\r\n ');
  return Array.from(tmpDiv.childNodes);
};

export const getCleanSubText = (text: string): string => {
  if (!text) return '';
  const tmpDiv = document.createElement('div') as HTMLDivElement;
  tmpDiv.innerHTML = text
    .replace(/<\d+:\d+:\d+.\d+><c>/g, '')
    .replace(/<\/c>/g, '');
  return tmpDiv.textContent || '';
};

export const getCurrentFirstSub = (
  subs: subTitleType[],
  currentTime: number
) => {
  return getAllCurrentSub(subs, currentTime)[0];
};

export const getCurrentLastSub = (
  subs: subTitleType[],
  currentTime: number
) => {
  return getAllCurrentSub(subs, currentTime).slice(-1)[0];
};

export const getAllCurrentSub = (subs: subTitleType[], currentTime: number) => {
  return subs.filter(
    (sub: subTitleType) => sub.start <= currentTime && currentTime <= sub.end
  );
};

// Use original subtitle to find native-language subtitles in subs
export const getSubForStartEndTime = (
  startTime: number,
  endTime: number,
  nativeSubs: subTitleType[],
  prevEndTime?: number | null,
  nextStartTime?: number | null
) => {
  const centralTime = (startTime + endTime) / 2;
  // c(todo): i'm not sure about taking this average, feels like it's better
  // to include the context from the previous sub until now but maybe there are issues, too
  // Regardless it does seem showing the other track should run by its own timing rather than that
  // of the current sub but maybe it's jarring in such circumstances
  // problems with the centralTime approach:
  // 1. what happens if the subtitle starts before the new sub but ends in its duration
  // 2. OR it starts after the start of the new sub but DOESNT end before the end of the central time
  // 豆: Use central time of the nativeSub and filter
  // into difference between target language sub
  // midpoint between current and prev subs
  // with a buffer of AllowableTimeWindow

  const AllowableTimeWindow = 2000;
  const windowSubs = nativeSubs.filter((sub: subTitleType) => {
    const currentNativeSubMidpoint = (Number(sub.end) + Number(sub.start)) / 2;

    const prevCurrentTargetSubMidpoint = prevEndTime
      ? (startTime + prevEndTime) / 2
      : startTime;
    const currentNextTargetSubMidpoint = nextStartTime
      ? (nextStartTime + endTime) / 2
      : endTime;

    return (
      currentNativeSubMidpoint >= prevCurrentTargetSubMidpoint &&
      currentNativeSubMidpoint >= startTime - AllowableTimeWindow &&
      currentNativeSubMidpoint < currentNextTargetSubMidpoint &&
      currentNativeSubMidpoint < endTime + AllowableTimeWindow
    );
  });

  if (windowSubs.length > 0) return windowSubs;

  // c: old logic using the average point. maybe it does product the best results?
  // const bestMatchNativeSubs = nativeSubs.filter(
  //   (sub: subTitleType) => sub.start <= centralTime && centralTime <= sub.end
  // );

  // if (bestMatchNativeSubs.length > 0) {
  //   return bestMatchNativeSubs;
  // }

  // Fallback: Find nearest sub match if using the central time to search for paired native subs yields nothing
  let bestTimeGap = Number.MAX_VALUE;
  let bestSubMatch;

  for (let i = 0; i < nativeSubs.length; i++) {
    const currentSub = nativeSubs[i];
    const currentSubCentralTime =
      (Number(currentSub.start) + Number(currentSub.end)) / 2;
    const timeGap = Math.abs(centralTime - currentSubCentralTime);

    if (timeGap < bestTimeGap) {
      bestTimeGap = timeGap;
      bestSubMatch = currentSub;
    }
  }

  // Best sub match's time gap cannot be more than 2 seconds - otherwise
  // it's likely it is just a piece of very irrelevant dialogue from far away.
  // In fact the typical misalignment between native and target language is 120ms
  // c: the above is from the original code base. converting to use AllowableTimeWindow
  if (bestSubMatch && bestTimeGap < AllowableTimeWindow) {
    return [bestSubMatch];
  }

  return [];
};

export const getPrevSub = (
  subs: subTitleType[],
  currentTime: number
): subTitleType => {
  const currentSub = getCurrentLastSub(subs, currentTime);
  if (currentSub) {
    const indexCurrentSub = subs.findIndex((sub) => sub === currentSub);
    return subs[indexCurrentSub - 1];
  }

  return subs.find((sub, index) => {
    return (
      sub.end <= currentTime &&
      (!subs[index + 1] || subs[index + 1].start >= currentTime)
    );
  });
};

export const getNextSub = (
  subs: subTitleType[],
  currentTime: number
): subTitleType => {
  const currentSub = getCurrentFirstSub(subs, currentTime);
  if (currentSub) {
    const indexCurrentSub = subs.findIndex((sub) => sub === currentSub);
    return subs[indexCurrentSub + 1];
  }

  return subs.find((sub) => sub.start >= currentTime);
};

export const tokenizeChineseSubs = async (
  composer: AppComposer,
  vttSubs: string,
  cleanText?: string,
  scriptType?: string
): Promise<{
  tokens: WordDefinitions[];
  romanization: string;
  spaceDelimitedWords: string;
}> => {
  const { data } = await composer.bl.client.query({
    query: settingsQueryGql,
    fetchPolicy: 'network-only',
  });

  // const chineseTransliterationOption = 'pinyin'; // exue(todo): take in from user settings
  const chineseTransliterationUserSetting = data?.settings?.transliteration?.zh;
  const characterTypeUserSetting = data?.settings?.characterType;
  // const charType =
  //   vttSubs.indexOf('simplified') !== -1 || scriptType === 'zh-CN'
  //     ? 'simplified'
  //     : 'traditional';
  const charType =
    characterTypeUserSetting.indexOf('simplified') === 0
      ? 'simplified'
      : 'traditional';

  const chineseCharacters = cleanText ?? getCleanSubText(vttSubs);

  const tokens = await composer.bl.publishAction('search/tokenize', {
    payload: { text: chineseCharacters },
  });

  // exue: we are currently keeping all the tokens, including punctuation and non-Chinese letters
  const allTransliterationsArray = tokens.map(
    (token, index) => token.transliteration['pinyin']
  );
  let romanization = allTransliterationsArray.join(' ');

  const chineseWordsArray = tokens.map((token, index) => token.word[charType]);
  const chineseWords = chineseWordsArray.join(' ');

  if (chineseTransliterationUserSetting === 'pinyin') {
    romanization = toPinyinFromToneSuffix(romanization);
  } else {
    romanization = toZhuyinFromPinyin(romanization);
  }

  return { tokens, romanization, spaceDelimitedWords: chineseWords };
};

export const getSubWordsNodes = (
  subtitleText: string,
  shouldAddSpace: boolean = true
) => {
  return subTextToChildNodesArray(subtitleText)
    .map((node: any, nodeIndex: number) => {
      if (node.textContent.match(/[^ ]/g) == null) {
        return false;
      }

      return node.textContent
        .match(/[^ ]+/g)
        .map((word: string, wordIndex: number) => {
          const tagName = !!node.tagName ? node.tagName.toLowerCase() : 'span';
          return (
            <Word
              tagName={tagName}
              word={word}
              context={Utils.clearWordContext(subtitleText, word)}
              key={word + nodeIndex + wordIndex}
              keyName={word + nodeIndex + wordIndex}
              shouldAddSpace={shouldAddSpace}
            />
          );
        });
    })
    .flat();
};

// exue: Finding the video element on a Netflix page is nontrivial:
// Old code used to have document.querySelector('video') everywhere,
// but this isn't robust: It's sometimes possible to have two video elements on page,
// especially when you go autoplay from one episode to another of a show.
// findActiveVideo helps solve this issue.
//
// https://www.netflix.com/watch/70298569?trackId=155573558
// Example: Possible to have:
// <div class="VideoContainer" aria-hidden="true" role="presentation" data-uia="player" data-videoid="70298569">
//   <div style="position: relative; width: 100%; height: 100%; overflow: hidden;">
//     <div id="70298568" style="position: relative; width: 100%; height: 100%; overflow: hidden; display: none;">
//       <video src="blob:https://www.netflix.com/f850956d-b9da-49a8-9273-a347cb076d7e" style=""></video>
//     </div>

//     <div id="70298569" style="position: relative; width: 100%; height: 100%; overflow: hidden; display: block;">
//       <video src="blob:https://www.netflix.com/0c85768a-5d4f-4961-b461-1a09615db6f8" style="position: absolute; width: 100%; height: 100%;"></video>
//       <div class="player-timedtext" style="display: none; direction: ltr;"></div>
//     </div>
//   </div>
//   <div id="inkahsubs"><div class="inkahsubs-subtitles react-draggable" style="touch-action: none; font-size: 30px; transform: translate(0px, 0px);">
//   </div>
//   </div>
//   <div class="inkahsubs-progress-bar">
//     <div class="inkahsubs-progress-bar-container"></div>
// </div>

export const findActiveVideo = () => {
  const potentialVideoElements = document.getElementsByTagName('video');

  if (potentialVideoElements.length === 0) {
    return null;
  } else if (potentialVideoElements.length === 1) {
    return potentialVideoElements[0];
  } else {
    // Sometimes we can end up with more than one video element
    // try to look for the matching ID, which works for Netflix
    // otherwise, we just take the last element. exue(todo): check edge cases for other services
    // It's usually the last element, but really we should go and compare the ID
    // of .VideoContainer (data-videoid="70298569") with the
    const videoContainer = document.querySelector(
      config.netflixSelectors.player
    );
    if (videoContainer) {
      const videoId = videoContainer.getAttribute('data-videoid');

      for (const el of potentialVideoElements) {
        if (el.parentElement.id === videoId) {
          return el;
        }
      }
    }

    // Return the last element if the above technique doesn't work
    return potentialVideoElements[potentialVideoElements.length - 1];
  }
};
