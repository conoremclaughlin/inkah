import { useStore } from 'effector-react';
import React from 'react';
import { toggleShowTransliteration } from '../../event';
import { showTransliterationState } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';
import Utils from '../../utils';

function ShowTransliteration() {
  const showTransliteration = useStore(showTransliterationState);

  function changeShowState(showed: boolean) {
    toggleShowTransliteration(showed);
  }

  return (
    <label className="inkahsubs-label inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <div className="inkahsubs-label-text">{t`Show transliteration`}</div>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div
          className="toggle"
          onClick={() => {
            changeShowState(!showTransliteration);
          }}
          className="toggle"
          onClick={() =>
            Utils.isNetflix() ? changeShowState(!showTransliteration) : null
          }
        >
          <input
            className="toggle-state setting-toggle"
            type="checkbox"
            name="check"
            value="check"
            checked={showTransliteration}
            onClick={() => changeShowState(!showTransliteration)}
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
showTransliterationState.on(
  toggleShowTransliteration,
  (state: any, showed: boolean) => showed
);

export default ShowTransliteration;
