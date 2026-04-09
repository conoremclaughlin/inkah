import { createEvent } from 'effector';

export const toggleEnableState = createEvent('Toggle extension enable state');
export const toggleShowProgressBarState = createEvent('Toggle show progress bar state');
export const toggleShowSubsBackgroundState = createEvent('Toggle show subs background');
export const setUserLanguage = createEvent('Set user language');
export const setLearningService = createEvent('Set learning service');

export const updateSubs = createEvent('Update subtitles');
export const updateNativeSubs = createEvent('Update native subtitles');

export const updateSubtitlesLoadingState = createEvent('Update subtitles loading state');

export const videoTimeUpdate = createEvent('Video time update');
export const toggleShowFullSubTranslatePopup = createEvent('Toggle show full sub translate popup');

export const setSubsFontSize = createEvent('Set subs font size');

export const toggleShowNative = createEvent('Toggle show native subs');
export const toggleShowTransliteration = createEvent('Toggle show transliteration');
export const toggleShowRightPanel = createEvent('Toggle show right panel');

export const toggleIsAutoPausedState = createEvent('Toggle auto pause state');
export const toggleShouldAutoPauseSetting = createEvent('Toggle auto pause setting');