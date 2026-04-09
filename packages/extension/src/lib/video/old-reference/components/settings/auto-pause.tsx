import { useStore } from 'effector-react';
import React from 'react';
import { toggleShouldAutoPauseSetting } from '../../event';
import { shouldAutoPauseSettingStore } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';
import Utils from '../../utils';

function AutoPause() {
  const shouldAutoPauseSetting = useStore(shouldAutoPauseSettingStore);

  function changeShowState(showed: boolean) {
    toggleShouldAutoPauseSetting(showed);
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">
          {t`Auto pause when hovering subtitles`}
        </div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() =>
            Utils.isNetflix() ? changeShowState(!shouldAutoPauseSetting) : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={shouldAutoPauseSetting}
            onClick={() => changeShowState(!shouldAutoPauseSetting)}
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
shouldAutoPauseSettingStore.on(
  toggleShouldAutoPauseSetting,
  (state: any, showed: boolean) => showed
);

export default AutoPause;
