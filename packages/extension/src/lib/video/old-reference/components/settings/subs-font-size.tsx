import { useStore } from 'effector-react';
import React from 'react';
import { setSubsFontSize } from '../../event';
import { subsFontSizeStore } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';

const fontSizeStep = 5;

function SubsFontSize() {
  const subsFontSize = useStore(subsFontSizeStore);

  function increaseSubsFontSize() {
    setSubsFontSize(Number(subsFontSize + fontSizeStep));
  }

  function decreaseSubsFontSize() {
    setSubsFontSize(Number(subsFontSize - fontSizeStep));
  }

  return (
    <div className="inkahsubs-settings__learning-service inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <span>{t`Subtitles size`}</span>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div className="inkahsubs-settings__font-size">
          <div
            className="inkahsubs-settings__button -transparent -minus"
            onClick={decreaseSubsFontSize}
          />
          <div className="inkahsubs-settings__font-size__text">
            {subsFontSize}%
          </div>
          <div
            className="inkahsubs-settings__button -transparent -plus"
            onClick={increaseSubsFontSize}
          />
        </div>
      </div>
    </div>
  );
}
subsFontSizeStore.on(
  setSubsFontSize,
  (state: any, fontSize: number) => fontSize
);

export default SubsFontSize;
