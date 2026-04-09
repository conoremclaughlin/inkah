import React from 'react';
import Language from './language';
import LearningService from './learning-service';
import Toggle from './toggle';
import ShowProgressBar from './show-progress-bar';
import ShowNativeSubs from './show-native-subs';
import ShowTransliteration from './show-transliteration';
import AutoPause from './auto-pause';
import SubsFontSize from './subs-font-size';
import ResyncSubs from './resync-subs';
import CustomSubs from './custom-subs';
import SubsBackground from './subs-background';
import onClickOutside from 'react-onclickoutside';
import { isFirefox } from '../../../app-exists/webext-polyfill';
import Utils from '../../utils';

import { t } from '../../../../../../src/dx-code-convenience/globals';
import Netflix from '../../services/netflix';
import YouTube from '../../services/youtube';

// tslint:disable-next-line: variable-name
const Content = (props: any) => {
  const service = Utils.detectService();

  function closeSettings() {
    props.toggleShowSettings(false);
  }

  (Content as any).handleClickOutside = () => {
    props.toggleShowSettings(false);
  };

  const copy = {
    header: Utils.isNetflix()
      ? `Inkah Netflix settings`
      : `Inkah Youtube BETA settings`,
  };

  const subCache =
    service && service instanceof Netflix ? service.subCache : null;

  // const currentSubCache = Array.from(subCache.values()).pop();
  // c: fetch the current list of FULL subtitle files that are available to us
  // -forced subtitle files are incomplete and not for the full episode
  let currentSubCache;
  // if (service instanceof Netflix || service instanceof YouTube) {
  if (service instanceof Netflix) {
    // console.log(
    //   '[d:subCache.values] service.currentVideoId: ',
    //   service.currentVideoId
    // );
    currentSubCache = subCache[service.currentVideoId];
  }

  return (
    <div
      className="inkahsubs-settings-wrapper"
      style={{
        top: props.boundingRect?.top,
        left: props.boundingRect?.left,
        opacity: props.shouldDisplay ? 1 : 0,
      }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      <div className="inkahsubs-settings-close" onClick={closeSettings} />
      <div className="inkahsubs-settings-header">{t(copy.header)}</div>
      <div className="inkahsubs-settings__content">
        <div className="inkahsubs-settings__item" style={{ maxWidth: 280 }}>
          <div>{t`Hover and press 's' or 'b' to save a word 💪`}</div>
        </div>
        <div className="inkahsubs-settings__content__header">
          {t(copy.header)}
        </div>
        <Toggle />
        <ShowNativeSubs />
        <Language subCache={currentSubCache} />
        <ShowTransliteration />
        <AutoPause />
        <ShowProgressBar />
        {/* <LearningService /> */}
        {/* <div className="inkahsubs-settings__content__header">Interface</div> */}
        <div className="inkahsubs-settings__content__header">
          {t`Subtitles`}
        </div>
        <SubsBackground />
        <SubsFontSize />
        {/* TODO(exue) re-enable for release <ResyncSubs /> <CustomSubs /> */}
        {!isFirefox && Utils.isNetflix() && (
          <div className="inkahsubs-settings__item" style={{ maxWidth: 280 }}>
            <div>
              <b>Note: </b>
              {t`For an optimal experience, turn off Netflix's experimental features under your Netflix account settings.`}
            </div>
          </div>
        )}
        {isFirefox && Utils.isNetflix() && (
          <>
            <div className="inkahsubs-settings__content__header">
              {t`Firefox`}
            </div>
            <div className="inkahsubs-settings__item" style={{ maxWidth: 280 }}>
              <div>
                <b>Note: </b>
                {t`Due to a bug in Netflix's API for Firefox, Inkah cannot seek to exact subtitle lines. We've kept the feature so you may jump to approximate times. Thanks for understanding 🙏`}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const clickOutsideConfig = {
  handleClickOutside: () => (Content as any).handleClickOutside,
};

export default onClickOutside(Content, clickOutsideConfig);
