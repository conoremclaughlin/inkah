import { useStore } from 'effector-react';
import React, { useEffect } from 'react';
import { toggleShowSubsBackgroundState } from '../../event';
import { showSubsBackgroundState } from '../../store';
import Utils from '../../utils';
import { t } from '../../../../../../src/dx-code-convenience/globals';

function SubsBackground() {
  const showSubsBackground = useStore(showSubsBackgroundState);
  addEnableClass(showSubsBackground);

  useEffect(() => {
    addEnableClass(showSubsBackground);
  });

  function changeShowState(showed: boolean) {
    toggleShowSubsBackgroundState(showed);
    addEnableClass(showed);
  }

  function addEnableClass(showed: boolean) {
    document.documentElement.classList.toggle(
      'inkahsubs-show-subtitles-background',
      showed
    );
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">{`Subtitles background`}</div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() =>
            Utils.isNetflix() ? changeShowState(!showSubsBackground) : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={showSubsBackground}
            onClick={() => changeShowState(!showSubsBackground)}
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
showSubsBackgroundState.on(
  toggleShowSubsBackgroundState,
  (state: any, showed: boolean) => showed
);

export default SubsBackground;
