import { useStore } from 'effector-react';
import React, { useEffect } from 'react';
import { toggleShowProgressBarState } from '../../event';
import { showProgressBarState } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';
import Utils from '../../utils';

function ShowProgressBar() {
  const showProgressBar = useStore(showProgressBarState);
  addEnableClass(showProgressBar);

  useEffect(() => {
    addEnableClass(showProgressBar);
  });

  function changeShowState(showed: boolean) {
    toggleShowProgressBarState(showed);
    addEnableClass(showed);
  }

  function addEnableClass(showed: boolean) {
    document.documentElement.classList.toggle(
      'inkahsubs-progress-bar-enable',
      showed
    );
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">{t`Show progress bar`}</div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() => changeShowState(!showProgressBar)}
          className="toggle"
          onClick={() =>
            Utils.isNetflix() ? changeShowState(!showProgressBar) : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={showProgressBar}
            onClick={() => changeShowState(!showProgressBar)}
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
showProgressBarState.on(
  toggleShowProgressBarState,
  (state: any, showed: boolean) => showed
);

export default ShowProgressBar;
