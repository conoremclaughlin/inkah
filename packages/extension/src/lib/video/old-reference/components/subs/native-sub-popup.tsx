import { useStore } from 'effector-react';
import { CSSTransition } from 'react-transition-group';
import { t } from '../../../../dx-code-convenience/globals';

import { nativeSubsStore } from '../../store';
import {
  getSubForStartEndTime,
  getCleanSubText,
} from '../../subtitle-utilities';

function NativeSubPopup(props: {
  subtitleStart: number;
  subtitleEnd: number;
  topPosition: number;
  prevSubtitleEnd?: number;
  nextSubtitleStart?: number;
}) {
  const nativeSubs = useStore(nativeSubsStore);

  const toShowSubs = getSubForStartEndTime(
    props.subtitleStart,
    props.subtitleEnd,
    nativeSubs,
    props.prevSubtitleEnd,
    props.nextSubtitleStart
  );

  if (!toShowSubs) return null;

  const joined = toShowSubs.map((subtitleType) => subtitleType.text).join(' ');
  const textToShow = getCleanSubText(joined);

  return (
    <CSSTransition appear={true} in={true} timeout={200} classNames="in_fadeIn">
      <div
        className="inkahsubs-translate-container -full-sub in_rightPanel_nativeSub"
        style={{
          position: 'absolute',
          top: props.topPosition + 2,
          right: 435, // 415px width of the right panel + 10px scroll bar + 10px space
        }}
      >
        <div className="inkahsubs-translate-result">
          {textToShow ? (
            textToShow
          ) : (
            <span className="text-sm italic">{t('not available')}</span>
          )}
        </div>
      </div>
    </CSSTransition>
  );
}

export default NativeSubPopup;
