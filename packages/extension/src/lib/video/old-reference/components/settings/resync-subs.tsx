import { useStore } from 'effector-react';
import React, { useState } from 'react';
import { updateSubs } from '../../event';
import { subsStore } from '../../store';
import { resync } from 'subtitle';
import { t } from '../../../../../../src/dx-code-convenience/globals';

function ResyncSubs() {
  const subs = useStore(subsStore);
  const [delay, setDelay] = useState(0);

  function increaseSubsDelay(event: any) {
    event.stopPropagation();
    const timeDelayStep = getTimeDelayStep(event);
    setDelay(delay + timeDelayStep);
    updateSubs(resync(subs, timeDelayStep));
  }

  function decreaseSubsTimeGap(event: any) {
    event.stopPropagation();
    const timeDelayStep = getTimeDelayStep(event);
    setDelay(delay - timeDelayStep);
    updateSubs(resync(subs, -1 * timeDelayStep));
  }

  function getTimeDelayStep(event: any) {
    if (event.altKey) return 1000;
    if (event.shiftKey) return 5000;
    return 250;
  }

  return (
    <div className="inkahsubs-settings__learning-service inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <span>{t`Subtitles delay`}</span>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <div className="inkahsubs-settings__delay">
          <div
            className="inkahsubs-settings__button -transparent -minus"
            onClick={decreaseSubsTimeGap}
          />
          <div className="inkahsubs-settings__delay__text">{delay / 1000}s</div>
          <div
            className="inkahsubs-settings__button -transparent -plus"
            onClick={increaseSubsDelay}
          />
        </div>
      </div>
    </div>
  );
}

export default ResyncSubs;
