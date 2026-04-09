import React, { useEffect, useState } from 'react';
import { t } from '../../../../../../src/dx-code-convenience/globals';
import { b } from '../../../app-exists/webext-polyfill';
import Utils from '../../utils';
import Youtube from '../../services/youtube';

function Toggle() {
  // exue: Toggle controls the same setting as the main Inkah on/off switch,
  // and thus uses the native browser storage API in settings-panel
  const [isSubtitleFeatureEnabled, setisSubtitleFeatureEnabled] = useState(
    false
  );
  // toggleEnableClass(isSubtitleFeatureEnabled);

  useEffect(() => {
    const fetch = async () => {
      const result = await b.storage.local.get(['isSubtitleFeatureEnabled']);

      changeEnableState(result.isSubtitleFeatureEnabled ?? true);
    };

    fetch();

    const isSubtitleFeatureEnabledListener = (changes, namespace) => {
      if (changes.isSubtitleFeatureEnabled) {
        changeEnableState(changes.isSubtitleFeatureEnabled.newValue);
      }
    };

    // exue: Main settings panel can turn off video subtitles.
    b.storage.onChanged.addListener(isSubtitleFeatureEnabledListener);

    return () => {
      b.storage.onChanged.removeListener(isSubtitleFeatureEnabledListener);
    };
  }, [isSubtitleFeatureEnabled, setisSubtitleFeatureEnabled]);

  function changeAndWriteEnableState(isSubtitleFeatureEnabled: boolean) {
    changeEnableState(isSubtitleFeatureEnabled);
    b.storage.local.set({ isSubtitleFeatureEnabled: isSubtitleFeatureEnabled });

    if (isSubtitleFeatureEnabled) {
      b.storage.local.set({ isEnabled: true });

      // c: UX quirk where we need to enable closed captioning any time
      // we turn on Inkah for Youtube so that subtitle files are passed
      // back from Youtube for parsing
      const service = Utils.detectService();
      if (service instanceof Youtube) {
        service.turnClosedCaptionsOn(true);
      }
    }
  }

  function changeEnableState(isSubtitleFeatureEnabled: boolean) {
    setisSubtitleFeatureEnabled(isSubtitleFeatureEnabled);
    toggleEnableClass(isSubtitleFeatureEnabled);
  }

  function toggleEnableClass(isSubtitleFeatureEnabled: boolean) {
    document.documentElement.classList.toggle(
      'inkahsubs-enable',
      isSubtitleFeatureEnabled
    );
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">{t`Enable`}</div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() =>
            Utils.isNetflix()
              ? changeAndWriteEnableState(!isSubtitleFeatureEnabled)
              : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={isSubtitleFeatureEnabled}
            onClick={() => changeAndWriteEnableState(!isSubtitleFeatureEnabled)}
          />
          <div className="toggle-inner">
            <div className="indicator" />
          </div>
          <div className="active-bg" />
        </div>
      </div>
    </label>
  );
}

export default Toggle;
