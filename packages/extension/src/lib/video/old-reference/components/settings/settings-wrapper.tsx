import React, { useRef, useState, useLayoutEffect } from 'react';
import Utils from '../../utils';
import Logo1x from '../../../design/icons/inkah-logo-soft-1x.svg';
import Logo from '../../../design/icons/inkah-logo';

import Content from './content';
import Portal from './portal';

// c(WARNING): this only works if we inject settings-wrapper a _single_ time in a page
// if this becomes an issue with Youtube, we'll need to revisit and potentially migrate
// the state management to mobx
let transitionHandler: Timeout | null = null;

function SettingsPanel({
  boundingRect,
  shouldShowSettings,
  toggleShowSettings,
}: {
  boundingRect?: any;
  shouldShowSettings: boolean;
  toggleShowSettings: any;
}) {
  return (
    <div style={{ display: shouldShowSettings ? 'block' : 'none' }}>
      <Content
        boundingRect={boundingRect}
        shouldDisplay={shouldShowSettings}
        toggleShowSettings={toggleShowSettings}
        onMouseEnter={() => {
          if (transitionHandler) {
            clearTimeout(transitionHandler);
            transitionHandler = null;
          }
        }}
        onMouseLeave={(event) => {
          // c(fix): Firefox calls onMouseLeave prematurely when we click on the select.
          // Works in Chrome. Ignore the event if it's coming from the native language select
          if (
            (event.target?.classList?.includes &&
              event.target?.classList?.includes('select')) ||
            event.target?.nodeName?.toLowerCase() === 'select'
          ) {
            return;
          }

          if (toggleShowSettings) toggleShowSettings(false);
        }}
      />
    </div>
  );
}

function SettingsWrapper(props: { settingsContentSelector?: string | null }) {
  const [showSettings, toggleShowSettings] = useState(false);
  const iconRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    // exue: Calculate absolute positioning for native sub.
    // Cannot use relative positioning due to being unable to set
    // overflow-x: visible and overflow-y: scroll separately. Once we set overflow-y: scroll,
    // it forces overflow-x to be auto, and thus cuts off the native sub box
    // https://stackoverflow.com/questions/6421966/css-overflow-x-visible-and-overflow-y-hidden-causing-scrollbar-issue
    if (iconRef.current) {
      const boundingRect = iconRef.current?.getBoundingClientRect();
      setPosition(boundingRect);
      // const top = boundingRect.top;
      // const left = boundingRect.left;
      // setTopPosition(Math.max(0, top));
    }
  }, [iconRef]);

  return (
    <div className="inkahsubs-settings-container">
      <div
        className="inkahsubs-settings-container-logo"
        ref={iconRef}
        onClick={() => toggleShowSettings(!showSettings)}
        onMouseEnter={() => {
          if (transitionHandler) {
            clearTimeout(transitionHandler);
            transitionHandler = null;
          }

          toggleShowSettings(true);
        }}
        onMouseLeave={() => {
          transitionHandler = setTimeout(() => {
            if (showSettings) toggleShowSettings(false);
          }, 750);
        }}
      >
        {Utils.isNetflix() ? <Logo /> : <Logo1x />}
      </div>
      <SettingsPanel
        shouldShowSettings={showSettings}
        toggleShowSettings={toggleShowSettings}
      />
      {/* )} */}
    </div>
  );
}

export default SettingsWrapper;
