import { createStore, Store } from 'effector';
import { parse } from 'subtitle';
import { withPersist } from './effector-persist';

export const showProgressBarState = withPersist(
  createStore(false, { name: 'showProgressBarState' })
);
export const showSubsBackgroundState = withPersist(
  createStore(true, { name: 'showSubsBackgroundState' })
);
export const subsFontSizeStore = withPersist<Store<number>>(
  createStore(125, { name: 'subsFontSizeStore' })
);
export const userLanguageStore: Store<string> = withPersist<Store<string>>(
  createStore(window.navigator.language.split('-')[0], {
    name: 'userLanguageStore',
  })
);
export const learningServiceStore = withPersist(
  createStore(null, { name: 'learningServiceStore' })
);
export const subsStore = createStore(parse(''), { name: 'subsStore' });
export const subtitlesLoadingStateStore = createStore(false, {
  name: 'subtitlesLoadingStateStore',
});

export const tokenizedSubsStore = createStore(parse(''), {
  name: 'tokenizedSubsStore',
});

export const showFullSubTranslatePopupStore = createStore(false, {
  name: 'showFullSubTranslatePopupStore',
});

export const nativeSubsStore = createStore(parse(''), {
  name: 'nativeSubsStore',
});
export const showNativeState = withPersist(
  createStore(true, { name: 'showNativeState' })
);
export const showRightPanelState = withPersist(
  createStore(true, { name: 'showRightPanelState' })
);
export const showTransliterationState = withPersist(
  createStore(false, { name: 'showTransliterationState' })
);

// Temporary state: Whether our video is currently auto-paused due to hovering over subtitles
export const isAutoPausedState = createStore(false, {
  name: 'isAutoPausedState',
});
// Persistent setting: Toggle for auto-pause when hovering over center subtitles
export const shouldAutoPauseSettingStore = withPersist(
  createStore(true, { name: 'shouldAutoPauseSettingStore' })
);
