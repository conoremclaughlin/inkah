import { useStore } from 'effector-react';
import React from 'react';
import { toggleShowNative } from '../../event';
import { showNativeState } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';
import Utils from '../../utils';

function ShowNativeSubs() {
  const showNative = useStore(showNativeState);

  function changeShowState(showed: boolean) {
    toggleShowNative(showed);
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">{t`Show native double subtitles`}</div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() =>
            Utils.isNetflix() ? changeShowState(!showNative) : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={showNative}
            onClick={() => changeShowState(!showNative)}
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
showNativeState.on(toggleShowNative, (state: any, showed: boolean) => showed);

export default ShowNativeSubs;
