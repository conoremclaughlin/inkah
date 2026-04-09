import React, { useRef, useLayoutEffect, useState } from 'react';

import NativeSubPopup from './native-sub-popup';
import { ReadOutlined, CaretRightOutlined } from '@ant-design/icons';

import appComposer, { useComposer } from '../../../app-exists/app-composer';
import { resultsComposer } from '../../../dictionaries-search/results-composer';
import { isFirefox } from '../../../app-exists/webext-polyfill';

var cx = require('classnames');

function SubtitleLine(props: {
  text: string; // c: raw text used for parsing for selections, etc.
  words: any[];
  isActive: boolean;
  relativeSize: string;
  subtitleStart: number;
  subtitleEnd: number;
  marginBottom: number;
  isCenter?: boolean;
  prevSubtitleEnd?: number;
  nextSubtitleStart?: number;
}) {
  const thisRef = useRef(null);
  const [topPosition, setTopPosition] = useState(0);
  const { isPending, composer } = useComposer(resultsComposer, { appComposer });
  const { results, ui } = composer.useUseCases();

  const computedStyle = {
    fontSize: props.relativeSize,
    display: 'flex',
  };

  const outerComputedStyle = {
    marginBottom: props.marginBottom ?? 4,
    userSelect: 'text',
  };

  if (props.isCenter) {
    const shadowSize = (Number.parseFloat(props.relativeSize) / 100) * 0.72;

    Object.assign(computedStyle, {
      WebkitTextStrokeColor: '#303030',
      WebkitTextStrokeWidth: shadowSize,
      fontWeight: 600,
      textShadow: 'rgb(0 0 0) 0px 0px 1px, rgb(0 0 0 / 40%) 0px 0px 18px',
    });
  }

  const [shouldShowNative, setShouldShowNative] = useState(false);

  function handleOnMouseLeave() {
    setShouldShowNative(false);
  }

  function handleOnMouseEnter() {
    setShouldShowNative(true);
  }

  useLayoutEffect(() => {
    // exue: Calculate absolute positioning for native sub.
    // Cannot use relative positioning due to being unable to set
    // overflow-x: visible and overflow-y: scroll separately. Once we set overflow-y: scroll,
    // it forces overflow-x to be auto, and thus cuts off the native sub box
    // https://stackoverflow.com/questions/6421966/css-overflow-x-visible-and-overflow-y-hidden-causing-scrollbar-issue
    if (shouldShowNative && thisRef.current) {
      const top = thisRef.current?.getBoundingClientRect().top;
      setTopPosition(Math.max(0, top));
    }
  }, [shouldShowNative, thisRef]);

  const showSentenceTranslation = async (e) => {
    e.stopPropagation();

    const bound = thisRef.current?.getBoundingClientRect();

    const offset = {
      height: bound.height,
      width: bound.width,
      left: bound.left,
      right: bound.right,
      top: bound.top,
      bottom: bound.bottom,
    };

    const selection = {
      text: props.text,
      sentence: props.text,
      paragraph: props.text,
    };

    ui.setSelectedOffset(offset);
    results.setSelection(selection);

    const tokens = await appComposer.bl.publishAction('search/tokenize', {
      payload: selection,
    });
    results.setTokens(tokens);
  };

  // Show caret on hover as well, to allow user to seek
  const shouldShowPlayButton =
    props.isActive || (!props.isCenter && shouldShowNative);

  return (
    <div
      className={cx('inkahsubs-subtitles__sub', {
        current: props.isActive,
        in_subtitle__isCurrent: props.isActive,
      })}
      onMouseLeave={handleOnMouseLeave}
      onMouseEnter={handleOnMouseEnter}
      ref={thisRef}
      style={outerComputedStyle}
    >
      <div style={computedStyle}>
        {!props.isCenter && (
          <div
            style={{
              width: 36,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexShrink: 0,
              marginRight: -4,
            }}
          >
            {shouldShowPlayButton && (
              <CaretRightOutlined
                className={cx('in_playCaret', {
                  in_playCaret__firefox: isFirefox,
                })}
                onClick={(event) => {
                  results.videoSeek(props.subtitleStart);
                }}
                disabled={isFirefox}
              />
            )}
          </div>
        )}
        <div style={{ paddingRight: 4, flexGrow: 1 }}>{props.words}</div>
        {!props.isCenter && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: 40,
              flexShrink: 0,
            }}
          >
            <ReadOutlined
              className="in_sidePanel_rightAction"
              onClick={showSentenceTranslation}
            />
          </div>
        )}
      </div>

      {!props.isCenter &&
        shouldShowNative &&
        props.subtitleStart != null &&
        props.subtitleEnd != null && (
          <NativeSubPopup
            subtitleStart={props.subtitleStart}
            subtitleEnd={props.subtitleEnd}
            prevSubtitleEnd={props.prevSubtitleEnd}
            nextSubtitleStart={props.nextSubtitleStart}
            topPosition={topPosition}
          />
        )}
    </div>
  );
}

// c(todo): CRITICAL for only re-rendering upon prop changes to the subtitle
// lines. Especially important for long lists of subtitles
export default React.memo(SubtitleLine);
