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

/* === Settings icon === */
.inkahsubs-settings {
  position: relative;
  display: inline-flex;
  align-items: center;
  z-index: 100;
}

.inkahsubs-settings-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
}

.inkahsubs-settings-icon {
  width: 24px;
  height: 24px;
  opacity: 0.85;
  transition: opacity 0.2s;
  filter: brightness(10); /* Make white to match Netflix's icon style */
}

.inkahsubs-settings-btn:hover .inkahsubs-settings-icon {
  opacity: 1;
}

.inkahsubs-settings-wrapper {
  display: none;
  position: absolute;
  bottom: 55px;
  right: -10px;
  background: #262a32;
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  color: #fff;
  font-size: 13px;
}

.inkahsubs-settings:hover .inkahsubs-settings-wrapper {
  display: block;
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
