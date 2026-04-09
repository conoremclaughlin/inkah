import { useStore } from 'effector-react';
import React, { useEffect, useState } from 'react';
import { showProgressBarState, subsStore } from '../../store';

import { subTitleType } from 'subtitle';
import Utils from '../../utils';
import Video from '../../video';

import { findActiveVideo } from '../../subtitle-utilities';

const TIME_PERIOD = 30000;

function ProgressBar() {
  const showProgressBar = useStore(showProgressBarState);
  const subs = useStore(subsStore);

  useEffect(() => {
    Utils.addKeyboardEventsListeners();

    return () => {
      Utils.removeKeyboardEventsListeners();
    };
  }, [subs]);

  if (!showProgressBar) return null;
  return <ProgressBarContent />;
}

function ProgressBarContent() {
  const subs = useStore(subsStore);

  const [videoElement] = useState(findActiveVideo());
  const [progressBarElement] = useState(
    document.querySelector('.inkahsubs-progress-bar')
  );
  const [elements, updateElements] = useState([]);
  const animateRef = React.useRef(null);

  const animate = () => {
    if (subs.length === 0) return;
    updateProgressBar();
    animateRef.current = requestAnimationFrame(animate);
  };

  function updateProgressBar() {
    const time = Utils.getVideoCurrentTime(videoElement);
    const leftBorder = time + TIME_PERIOD / 2;
    const rightBorder = time - TIME_PERIOD / 2;
    const msInPx = progressBarElement.clientWidth / TIME_PERIOD;

    const subsInDuration = subs.filter(
      (sub: subTitleType) =>
        (sub.end > rightBorder && sub.end < leftBorder) ||
        (sub.start > rightBorder && sub.start < leftBorder)
    );

    updateElements(
      subsInDuration.map((sub: subTitleType) => {
        const subWidth =
          msInPx * (Utils.castSubTime(sub.end) - Utils.castSubTime(sub.start));
        const x = msInPx * (Utils.castSubTime(sub.start) - rightBorder);
        return (
          <div
            className="inkahsubs-progress-bar-element"
            style={{ width: `${subWidth}px`, transform: `translateX(${x}px)` }}
            key={`id${sub.start}-${sub.end}-${sub.text}`}
          />
        );
      })
    );
  }

  function handleClick(event: any) {
    const time = Utils.getVideoCurrentTime(videoElement);
    const leftBorder = time - TIME_PERIOD / 2;
    const msInPx = TIME_PERIOD / progressBarElement.clientWidth;
    const moveTime = leftBorder + event.nativeEvent.offsetX * msInPx;
    Video.moveToTime(videoElement, moveTime);
  }

  useEffect(() => {
    animateRef.current = requestAnimationFrame(animate);
    // Utils.addKeyboardEventsListeners();

    return () => {
      cancelAnimationFrame(animateRef.current);
      // Utils.removeKeyboardEventsListeners();
      updateElements([]);
    };
  }, [subs]);

  return (
    <div className="inkahsubs-progress-bar-container" onClick={handleClick}>
      {elements}
    </div>
  );
}

export default ProgressBar;
