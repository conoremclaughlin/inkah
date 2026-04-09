import React, { useRef, useState } from 'react';
import { updateSubs } from '../../event';
import { parse } from 'subtitle';
import { toast } from 'react-toastify';
import { t } from '../../../../../../dx-code-convenience/globals';

function CustomSubs() {
  const inputFile = useRef(null);

  function handleFileSelect(event: any) {
    event.preventDefault();
    inputFile.current.click();
  }

  function handleOnChange(event: any) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const data: string = reader.result as string;

      updateSubs(parse(data));
      (toast as any).info(t('Custom subtitles loaded'));
    };
    reader.readAsText(file);
    inputFile.current.value = null;
  }

  return (
    <div className="inkahsubs-settings__custom-subs inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <span>{t`Custom subtitles`}</span>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <input
          type="file"
          accept=".vtt,.srt"
          id="file"
          ref={inputFile}
          onChange={handleOnChange}
          style={{ display: 'none' }}
        />
        <div className="inkahsubs-settings__button" onClick={handleFileSelect}>
          {t`Select file`}
        </div>
      </div>
    </div>
  );
}

export default CustomSubs;
