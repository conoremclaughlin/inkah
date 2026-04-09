import { useStore } from 'effector-react';
import React, { useEffect, useState, useRef } from 'react';
import { userLanguageStore } from '../../store';
import Utils from '../../utils';
import TranslateAlternatives from './translate-alternatives';

interface Props {
  word: string;
  context: string;
}

interface Translate {
  original: string;
  main: string;
  alternatives: [];
}

function TranslateWordPopup(props: Props) {
  const [translation, changeTranslation] = useState<Translate>({
    alternatives: [],
    main: '',
    original: '',
  });
  const language = useStore(userLanguageStore);
  const isUnmounted = useRef(false);

  useEffect(() => {
    // TODO(exue) this stuff is all using the Google Translate APIs,
    // which is hidden in their backend at background.ts
    // Since we don't need to do any of this, we can turn it off

    chrome.runtime.sendMessage(
      {
        contentScriptQuery: 'getSingleTranslation',
        lang: language,
        text: Utils.clearWord(props.word),
      },
      (response) => {
        if (isUnmounted.current) return;

        const main: string = response[0][0][0];
        const alternatives: [] = response[1] || [];

        changeTranslation({
          alternatives: alternatives,
          main: main,
          original: Utils.clearWord(props.word),
        });
      }
    );

    return () => {
      isUnmounted.current = true;
    };
  }, []);

  if (translation.original !== '') {
    return (
      <div className="inkahsubs-translate-container">
        <div className="inkahsubs-translate-result">{translation.main}</div>
        <hr />
        <div className="inkahsubs-translate-original">
          {translation.original}
        </div>
        <TranslateAlternatives
          alternativesGroups={translation.alternatives}
          word={props.word}
          context={props.context}
        />
      </div>
    );
  }
  return null;
}

export default TranslateWordPopup;
