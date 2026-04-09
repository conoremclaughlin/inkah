/** All video overlay CSS — injected once when video subtitles are active */
export const VIDEO_OVERLAY_CSS = `
/* === Hide native subtitles === */
.player-timedtext { display: none !important; }
.image-based-subtitles { display: none !important; }
.captions-text { display: none !important; }
.ytp-caption-segment { display: none !important; }
.ytp-caption-window-container { display: none !important; }

/* === Center subtitle overlay === */
#inkahsubs {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  text-align: center;
  pointer-events: auto;
  max-width: 85%;
  font-size: 28px;
  line-height: 1.4;
  user-select: text;
  -webkit-user-select: text;
}

.inkahsubs-subtitles {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.inkahsubs-subtitles__sub {
  white-space: pre-line;
  margin-top: 2px;
  padding: 4px 12px;
  border-radius: 4px;
  display: inline-block;
}

.inkahsubs-subtitles__sub.inkahsubs-show-subtitles-background {
  background: rgba(0, 0, 0, 0.75);
}

.inkahsubs-word {
  color: #fff;
  cursor: pointer;
  transition: color 0.1s;
  position: relative;
}

.inkahsubs-word:hover {
  color: #1296ba;
}

/* === Right panel === */
#inRightPanel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 415px;
  background: rgba(0, 0, 0, 0.85);
  overflow-y: auto;
  z-index: 5;
  display: none;
  padding: 10px 0;
  scrollbar-width: thin;
  scrollbar-color: #555 transparent;
}

#inRightPanel.inkahsubs-show {
  display: block;
}

.inkahsubs-right-sub {
  padding: 8px 16px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}

.inkahsubs-right-sub:hover {
  background: rgba(255, 255, 255, 0.05);
}

.inkahsubs-right-sub.current {
  border-left-color: #1296ba;
  background: rgba(18, 150, 186, 0.1);
}

.inkahsubs-right-sub-text {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
}

.inkahsubs-right-sub.current .inkahsubs-right-sub-text {
  color: #fff;
}

.inkahsubs-right-sub-native {
  color: #888;
  font-size: 12px;
  margin-top: 2px;
}

/* === Settings (ported from old extension's settings.scss) === */
.inkahsubs-settings {
  line-height: 1.5;
  color: #fff;
  z-index: 1000;
  width: 44px;
  height: 44px;
  display: inline-block;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.inkahsubs-settings label { color: #fff; }

.inkahsubs-settings-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.inkahsubs-settings-container-logo {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inkahsubs-settings-container-logo img {
  width: 32px;
  height: 32px;
  opacity: 1;
  transition: transform 0.15s;
}

.inkahsubs-settings-container-logo:hover img {
  transform: scale(1.1);
}

/* Netflix sizing */
#netflix .inkahsubs-settings {
  height: 5.2rem;
  width: 5.2rem;
  font-size: 2.5rem;
  margin-left: -0.3rem;
  margin-right: 2.7rem;
  line-height: inherit;
}

#netflix .inkahsubs-settings-container-logo img {
  width: 1.6em;
  height: 1.6em;
}

/* YouTube sizing */
#youtube .inkahsubs-settings { width: 36px; height: 36px; }
#youtube .ytp-fullscreen .inkahsubs-settings { width: 54px; height: 54px; }

/* Settings dropdown wrapper */
.inkahsubs-settings-wrapper {
  position: absolute;
  bottom: 57px;
  min-width: 320px;
  width: max-content;
  right: 0;
  background: #262a32;
  border-radius: 5px;
  overflow: hidden;
  z-index: 100;
  font-size: 14px;
  transition: opacity 0.15s ease-in;
}

.inkahsubs-settings-close {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 18px;
  height: 18px;
  opacity: 0.3;
  cursor: pointer;
}
.inkahsubs-settings-close:hover { opacity: 1; }
.inkahsubs-settings-close:before,
.inkahsubs-settings-close:after {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  content: ' ';
  height: 18px;
  width: 2px;
  background-color: #fff;
}
.inkahsubs-settings-close:before { transform: rotate(45deg); }
.inkahsubs-settings-close:after { transform: rotate(-45deg); }

.inkahsubs-settings-header {
  padding: 12px 15px;
  background: #21252b;
  font-size: 14px;
}

.inkahsubs-settings__content {
  padding: 15px;
}

.inkahsubs-settings__content__header {
  line-height: 20px;
  margin-top: 20px;
  font-size: 12px;
  text-transform: uppercase;
  border-bottom: 1px solid #6b6b6b;
  color: #6b6b6b;
}
.inkahsubs-settings__content__header:first-child { margin-top: 0; }

.inkahsubs-settings__item {
  display: flex;
  flex-direction: row;
  margin-top: 15px;
  width: 100%;
}
.inkahsubs-settings__item:first-child { margin-top: 0; }

/* Force content area to be vertical column layout */
.inkahsubs-settings__content {
  display: flex;
  flex-direction: column;
}

.inkahsubs-settings__item__left-side {
  flex: 2;
  text-align: right;
  margin-right: 10px;
  align-self: center;
}

.inkahsubs-settings__item__right-side {
  flex: 1 0;
  text-align: left;
  align-self: center;
}

/* Font size +/- buttons */
.inkahsubs-settings__font-size {
  display: flex;
  align-items: center;
}
.inkahsubs-settings__font-size > div { margin-right: 10px; }
.inkahsubs-settings__font-size__text {
  font-weight: 600;
  min-width: 45px;
  text-align: center;
}

.inkahsubs-settings__button {
  position: relative;
  background: rgba(255,255,255,0.2);
  border-radius: 5px;
  padding: 0 8px;
  line-height: 20px;
  display: inline-block;
  cursor: pointer;
}
.inkahsubs-settings__button.-transparent { background: none; }
.inkahsubs-settings__button.-plus,
.inkahsubs-settings__button.-minus {
  background: none;
  width: 20px;
  height: 20px;
  padding: 0;
}
.inkahsubs-settings__button.-plus:before,
.inkahsubs-settings__button.-plus:after,
.inkahsubs-settings__button.-minus:before,
.inkahsubs-settings__button.-minus:after {
  position: absolute;
  display: block;
  height: 2px;
  width: 10px;
  background: #fff;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
  border-radius: 4px;
  content: '';
}
.inkahsubs-settings__button.-plus:after {
  transform: translateX(-50%) translateY(-50%) rotate(90deg);
}

/* Select dropdown */
.inkahsubs-settings__select {
  background: rgba(255,255,255,0.2);
  border: none;
  font-size: 14px;
  color: #fff;
  height: auto;
  width: 100%;
  -webkit-appearance: none;
  border-radius: 5px;
  padding: 0 8px;
  line-height: 20px;
  background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+Cjxwb2x5Z29uIHN0eWxlPSJmaWxsOiAjZmZmZmZmOyIgb3BhY2l0eT0iMC43IiBwb2ludHM9IjAsNCAxNiw0IDgsMTIiLz4KPC9zdmc+Cg==');
  background-repeat: no-repeat;
  background-position: calc(100% - 8px) 50%;
  background-size: 12px;
}
.inkahsubs-settings__select option { color: initial; }

/* === Toggle switch (ported verbatim from old toggle.scss) === */
.inkahsubs-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  font-weight: normal;
}

.inkahsubs-label .toggle {
  isolation: isolate;
  position: relative;
  height: 20px;
  width: 40px;
  border-radius: 15px;
  background: #d6d6d6;
  overflow: hidden;
}

.inkahsubs-label .toggle-inner {
  z-index: 2;
  position: absolute;
  top: 1px;
  left: 1px;
  height: 18px;
  width: 38px;
  border-radius: 15px;
  overflow: hidden;
}

.inkahsubs-label .active-bg {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 200%;
  background: #1296ba;
  transform: translate3d(-100%, 0, 0);
  transition: transform 0.05s linear 0.17s;
}

.inkahsubs-label .toggle-state { display: none; }

.inkahsubs-label .indicator {
  height: 100%;
  width: 200%;
  background: white;
  border-radius: 13px;
  transform: translate3d(-75%, 0, 0);
  transition: transform 0.35s cubic-bezier(0.85, 0.05, 0.18, 1.35);
}

.inkahsubs-label .toggle-state:checked ~ .active-bg {
  transform: translate3d(-50%, 0, 0);
}

.inkahsubs-label .toggle-state:checked ~ .toggle-inner .indicator {
  transform: translate3d(25%, 0, 0);
}

.inkahsubs-settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.inkahsubs-settings-label {
  color: #ccc;
}

/* === Progress bar === */
.inkahsubs-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 15px;
  background: #171717;
  z-index: 11;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.inkahsubs-progress-indicator {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #1296ba;
  z-index: 1;
}

.inkahsubs-progress-cue {
  position: absolute;
  height: 8px;
  background: #555;
  border-radius: 1px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
}

.inkahsubs-progress-cue:hover {
  background: #888;
}

/* === Toggle switch === */
.inkahsubs-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  cursor: pointer;
}

.inkahsubs-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.inkahsubs-toggle-track {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #555;
  border-radius: 20px;
  transition: background 0.2s;
}

.inkahsubs-toggle input:checked + .inkahsubs-toggle-track {
  background: #1296ba;
}

.inkahsubs-toggle-thumb {
  position: absolute;
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.inkahsubs-toggle input:checked ~ .inkahsubs-toggle-thumb {
  transform: translateX(16px);
}

/* === Netflix-specific === */
html[id="netflix"] .inkahsubs-enable #inkahsubs {
  bottom: 15vh;
}

@media (max-height: 800px) {
  html[id="netflix"] .inkahsubs-enable #inkahsubs {
    bottom: 18vh;
  }
}

html[id="netflix"] .watch-video.watch-video__hasRightPanel .watch-video--player-view {
  width: calc(100% - 425px);
}

/* === YouTube-specific === */
.ytp-fullscreen #inkahsubs {
  bottom: 110px;
  font-size: 36px;
}

#youtube #inRightPanel {
  position: relative;
  width: 100%;
  height: 380px;
  right: auto;
  top: auto;
  bottom: auto;
}

@media (min-width: 1100px) {
  #youtube #inRightPanel {
    height: 525px;
  }
}

/* === Scrollbar === */
#inRightPanel::-webkit-scrollbar {
  width: 8px;
}
#inRightPanel::-webkit-scrollbar-track {
  background: transparent;
}
#inRightPanel::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}
`;
