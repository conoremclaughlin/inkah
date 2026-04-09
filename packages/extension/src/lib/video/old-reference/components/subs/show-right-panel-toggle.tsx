import { useStore } from 'effector-react';
import React, { useEffect } from 'react';
import cx from 'classnames';
import { toggleShowRightPanel } from '../../event';
import { showRightPanelState } from '../../store';

import { Tooltip, Button } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

function ShowRightPanelToggle() {
  const shouldShowRightPanel = useStore(showRightPanelState) as boolean;
  addEnableClass(shouldShowRightPanel);

  useEffect(() => {
    addEnableClass(shouldShowRightPanel);

    const handleSubtitlesChanged = (e) => {
      onLanguageChange(e);
    };

    window.addEventListener(
      'inkahsubsSubtitlesChanged',
      handleSubtitlesChanged
    );

    return () => {
      window.removeEventListener(
        'inkahsubsSubtitlesChanged',
        handleSubtitlesChanged
      );
    };
  });

  const onLanguageChange = (event: any) => {
    if (!event.detail) {
      changeShowState(false);
    }
  };

  function changeShowState(isShown: boolean) {
    toggleShowRightPanel(isShown);
    addEnableClass(isShown);
  }

  function addEnableClass(showed: boolean) {
    document.documentElement.classList.toggle(
      'inkahsubs-enable-right-panel',
      showed
    );
  }

  function handleMouseDown(e: React.MouseEvent) {
    changeShowState(!shouldShowRightPanel);
    e.preventDefault();
  }

  return (
    // c(todo): styling doesn't work on Netflix and causes the tooltip to pop up
    // on the home page
    // <Tooltip placement="bottom" title={`Show & hide the subtitles view`}>
    <Button
      type="primary"
      shape="circle"
      className={'in_sidePanelButton'}
      icon={
        shouldShowRightPanel ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
      }
      onMouseDown={handleMouseDown}
    />
    // </Tooltip>
  );
}
showRightPanelState.on(
  toggleShowRightPanel,
  (state: any, showed: boolean) => showed
);

export default ShowRightPanelToggle;
