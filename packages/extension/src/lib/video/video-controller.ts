import type { SubtitleCue, VideoService } from './types';
import type { Settings } from '../../data/settings';
import { VIDEO_OVERLAY_CSS } from './video-styles';
import {
  getCleanSubText,
  getSubsForCurrentTime,
  getNativeSubsForTimeRange,
  tokenizeSubtitle,
  getLookupText,
  isNetflix,
  isYouTube,
} from './subtitle-utilities';
// Purple Inkah logo loaded from extension assets

type LookupFn = (text: string) => Promise<WordDefinitions[] | null>;
type PopupFn = (definitions: WordDefinitions[], rect: DOMRect) => void;
type RemovePopupFn = () => void;

interface VideoControllerCallbacks {
  lookup: LookupFn;
  showPopup: PopupFn;
  removePopup: RemovePopupFn;
  precacheSubtitle?: (text: string) => Promise<void> | void;
  getTransliterationForText?: (text: string) => Map<number, string>;
}

/**
 * Full video subtitle controller.
 * Manages: center subs overlay, right panel, settings icon, progress bar.
 * Mounts UI into Netflix/YouTube player containers.
 */
export class VideoController {
  private service: VideoService;
  private settings: Settings;
  private callbacks: VideoControllerCallbacks;

  private cues: SubtitleCue[] = [];
  private nativeCues: SubtitleCue[] = [];
  private currentText = '';
  private animFrame = 0;
  private styleEl: HTMLStyleElement | null = null;

  // Mounted elements
  private subsContainer: HTMLElement | null = null;
  private rightPanel: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;

  // State
  private showRightPanel = false;
  private showBackground = true;
  private showNativeDoubled = false;
  private nativeLanguage = navigator.language.split('-')[0];
  private subFontSize = 125;
  private autoPause = true;
  private wasAutoPaused = false;
  private enabled = true;
  private showTransliteration = false;
  private isHoveringSubWord = false; // Prevent re-render while hovering
  private currentSubIndex = -1;
  private userScrolledTime = 0;
  private ignoreNextScroll = false;
  private static PAUSE_AUTO_SCROLL_TIME = 20000;

  constructor(
    service: VideoService,
    settings: Settings,
    callbacks: VideoControllerCallbacks,
  ) {
    this.service = service;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(settings: Settings) {
    this.settings = settings;
  }

  /** Pause video — Netflix uses button clicks, YouTube uses direct API */
  private pauseVideo() {
    if (isNetflix()) {
      const pauseBtn = document.querySelector(
        '[data-uia="control-play-pause-pause"]',
      ) as HTMLElement | null;
      if (pauseBtn) pauseBtn.click();
    } else {
      const video = document.querySelector('video');
      if (video && !video.paused) video.pause();
    }
  }

  /** Resume video — Netflix uses button clicks, YouTube uses direct API */
  private playVideo() {
    if (isNetflix()) {
      const playBtn = document.querySelector(
        '[data-uia="control-play-pause-play"]',
      ) as HTMLElement | null;
      if (playBtn) playBtn.click();
    } else {
      const video = document.querySelector('video');
      if (video?.paused) video.play();
    }
  }

  async start() {
    this.injectStyles();
    document.documentElement.classList.add('inkahsubs-enable');

    // Set HTML id for Netflix/YouTube CSS targeting
    if (isNetflix()) {
      document.documentElement.id = 'netflix';
    } else if (isYouTube()) {
      document.documentElement.id = 'youtube';
    }

    window.addEventListener(
      'inkahsubsSubtitlesChanged',
      this.handleSubtitleChange as EventListener,
    );
    window.addEventListener(
      'inkahsubsVideoReady',
      this.handleVideoReady as EventListener,
    );

    // Mount settings icon immediately (don't wait for subtitles)
    this.mountSettingsWhenReady();

    // Signal to MAIN world that content script is ready —
    // the MAIN world script may have already fired subtitle data
    // before we were listening. Request a re-fire.
    window.dispatchEvent(new CustomEvent('inkahContentReady'));
  }

  stop() {
    cancelAnimationFrame(this.animFrame);
    document.documentElement.classList.remove('inkahsubs-enable');
    this.unmountAll();
    this.removeStyles();
    window.removeEventListener(
      'inkahsubsSubtitlesChanged',
      this.handleSubtitleChange as EventListener,
    );
    window.removeEventListener(
      'inkahsubsVideoReady',
      this.handleVideoReady as EventListener,
    );
  }

  // === Event handlers ===

  private handleVideoReady = () => {
    this.cues = [];
    this.nativeCues = [];
    this.currentText = '';
    this.currentSubIndex = -1;
    this.unmountAll();
  };

  private handleSubtitleChange = async (e: CustomEvent) => {
    const language = e.detail?.language ?? e.detail ?? '';
    console.log('[inkah] Subtitle language changed:', language);

    if (!language) {
      this.cues = [];
      this.nativeCues = [];
      this.currentText = '';
      this.unmountAll();
      return;
    }

    try {
      this.cues = await this.service.getSubs(language);
      console.log('[inkah] Fetched', this.cues.length, 'subtitle cues');

      // Fetch double subtitle cues in the user's selected language
      if (this.nativeLanguage !== language) {
        try {
          this.nativeCues = await this.service.getSubs(this.nativeLanguage);
          console.log('[inkah] Fetched', this.nativeCues.length, 'native subtitle cues (' + this.nativeLanguage + ')');
        } catch {
          this.nativeCues = [];
        }
      }

      if (this.cues.length > 0 && this.enabled) {
        this.mountAll();
        this.startTimeSync();
        this.renderRightPanel();
      }
    } catch (err) {
      console.warn('[inkah] Failed to fetch subtitles:', err);
    }
  };

  // === Mounting ===

  /** Mount settings icon and set up observer for re-mounting */
  private mountSettingsWhenReady() {
    this.mountSettings();
    this.setupPlayerObserver();
  }

  private mountAll() {
    const video = this.service.findVideo();
    if (!video) return;

    const playerContainer = this.findPlayerContainer();
    if (!playerContainer) return;

    // Ensure container is positioned
    const style = getComputedStyle(playerContainer);
    if (style.position === 'static') {
      playerContainer.style.position = 'relative';
    }

    this.mountCenterSubs(playerContainer);
    this.mountRightPanel(playerContainer);
    this.mountSettings(); // no-op if already mounted
    this.mountProgressBar(playerContainer);
  }

  private unmountAll() {
    cancelAnimationFrame(this.animFrame);
    this.subsContainer?.remove();
    this.subsContainer = null;
    this.rightPanel?.remove();
    this.rightPanel = null;
    // Don't remove settings — they persist across subtitle changes
    this.progressBar?.remove();
    this.progressBar = null;
  }

  private findPlayerContainer(): HTMLElement | null {
    if (isNetflix()) {
      return document.querySelector('.watch-video') as HTMLElement;
    }
    if (isYouTube()) {
      return document.getElementById('movie_player');
    }
    return null;
  }

  // === Center Subtitles ===

  private mountCenterSubs(container: HTMLElement) {
    if (this.subsContainer) return;
    this.subsContainer = document.createElement('div');
    this.subsContainer.id = 'inkahsubs';

    // Auto-pause: mouseenter/mouseleave on the subtitle container
    // (old code: center-subs.tsx lines 258-293, 333-335)
    this.subsContainer.addEventListener('mouseenter', () => {
      if (!this.autoPause) return;
      const video = document.querySelector('video');
      if (video && !video.paused) {
        this.wasAutoPaused = true;
        this.pauseVideo();
      }
    });
    this.subsContainer.addEventListener('mouseleave', () => {
      if (this.wasAutoPaused) {
        this.wasAutoPaused = false;
        this.playVideo();
      }
    });

    container.appendChild(this.subsContainer);
  }

  /** Compute responsive font size from percentage and video width (old code pattern) */
  private computeFontSize(): number {
    const video = this.service.findVideo();
    const clientWidth = video?.clientWidth ?? 1024;
    const minFontSize = clientWidth > 1000 ? 28 : 24;
    return Math.round(
      Math.max(
        ((clientWidth / 100) * this.subFontSize) / 43,
        minFontSize * (this.subFontSize / 100),
      ),
    );
  }

  private renderCenterSubs(activeCues: SubtitleCue[]) {
    if (!this.subsContainer) return;

    const text = activeCues.map((c) => getCleanSubText(c.text)).join('\n');
    if (text === this.currentText) return;

    // Don't destroy DOM while a popup is visible over the subtitles
    const popup = document.getElementById('inkah-popup');
    if (popup) return;

    this.currentText = text;

    this.subsContainer.innerHTML = '';
    if (!text) return;

    // Pre-cache definitions for the current subtitle line so hover is instant
    const cacheResult = this.callbacks.precacheSubtitle?.(text);
    if (this.showTransliteration && cacheResult && typeof (cacheResult as Promise<void>).then === 'function') {
      (cacheResult as Promise<void>).then(() => {
        if (this.showTransliteration && this.currentText === text) {
          this.currentText = '';
        }
      });
    }

    // Build transliteration map (position → pinyin) for ruby annotations
    const translitMap = this.showTransliteration
      ? this.callbacks.getTransliterationForText?.(text) ?? null
      : null;

    const lang = this.settings.targetLanguage ?? 'zh';
    const fontSize = this.computeFontSize();
    const wrapper = document.createElement('div');
    wrapper.className = 'inkahsubs-subtitles';
    wrapper.style.fontSize = `${fontSize}px`;

    // Target language subtitle lines (120% relative — old code pattern)
    const targetDiv = document.createElement('div');
    targetDiv.style.fontSize = '120%';

    const lines = text.split('\n');
    let globalPos = 0;
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineEl = document.createElement('div');
      lineEl.className = `inkahsubs-subtitles__sub${this.showBackground ? ' inkahsubs-show-subtitles-background' : ''}`;

      const tokens = tokenizeSubtitle(line, lang);
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          lineEl.appendChild(document.createTextNode(token));
          globalPos += token.length;
          continue;
        }
        const span = document.createElement('span');
        span.className = 'inkahsubs-word';

        const translit = translitMap?.get(globalPos) ?? null;
        if (translit) {
          const ruby = document.createElement('ruby');
          ruby.appendChild(document.createTextNode(token));
          const rt = document.createElement('rt');
          rt.className = 'inkahsubs-translit';
          rt.textContent = translit;
          ruby.appendChild(rt);
          span.appendChild(ruby);
        } else {
          span.textContent = token;
        }

        lineEl.appendChild(span);
        globalPos += token.length;
      }
      targetDiv.appendChild(lineEl);
      if (lineIdx < lines.length - 1) globalPos++; // '\n' separator
    }
    wrapper.appendChild(targetDiv);

    // Native double subtitles (75% relative — old code: center-subs.tsx line 349)
    if (this.showNativeDoubled && activeCues.length > 0) {
      const start = activeCues[0].start;
      const end = activeCues[activeCues.length - 1].end;
      const nativeMatches = getNativeSubsForTimeRange(this.nativeCues, start, end);
      if (nativeMatches.length > 0) {
        const nativeDiv = document.createElement('div');
        nativeDiv.className = `inkahsubs-native-line inkahsubs-subtitles__sub${this.showBackground ? ' inkahsubs-show-subtitles-background' : ''}`;
        nativeDiv.style.fontSize = '75%';
        nativeDiv.textContent = nativeMatches.map((c) => getCleanSubText(c.text)).join(' ');
        wrapper.appendChild(nativeDiv);
      }
    }

    this.subsContainer.appendChild(wrapper);
  }


  // === Right Panel ===

  private mountRightPanel(container: HTMLElement) {
    if (this.rightPanel) return;
    this.rightPanel = document.createElement('div');
    this.rightPanel.id = 'inRightPanel';

    if (isNetflix()) {
      container.appendChild(this.rightPanel);
    } else if (isYouTube()) {
      const secondary = document.getElementById('secondary-inner');
      if (secondary) {
        secondary.prepend(this.rightPanel);
      } else {
        container.appendChild(this.rightPanel);
      }
    }

    this.renderRightPanel();
  }

  private renderRightPanel() {
    if (!this.rightPanel) return;
    this.rightPanel.innerHTML = '';

    // Add/remove hasRightPanel class on player container to shift video over
    const playerContainer = this.findPlayerContainer();
    if (playerContainer) {
      if (this.showRightPanel && this.cues.length > 0) {
        playerContainer.classList.add('watch-video__hasRightPanel');
      } else {
        playerContainer.classList.remove('watch-video__hasRightPanel');
      }
    }

    if (!this.showRightPanel || this.cues.length === 0) {
      this.rightPanel.classList.remove('inkahsubs-show');
      return;
    }

    this.rightPanel.classList.add('inkahsubs-show');

    // Scroll container (for scroll tracking)
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'in_rightPanel_scrollContainer';

    // Scroll-to-center floating button (old code: VerticalAlignMiddleOutlined)
    const scrollBtnContainer = document.createElement('div');
    scrollBtnContainer.className = 'in_scrollMiddleButtonContainer';
    const scrollBtn = document.createElement('button');
    scrollBtn.className = 'in_scrollMiddleButton';
    // SVG icon: vertical-align-middle (matches old antd VerticalAlignMiddleOutlined)
    scrollBtn.innerHTML = '<svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M859.9 474H164.1c-4.5 0-8.1 3.6-8.1 8v60c0 4.4 3.6 8 8.1 8h695.8c4.5 0 8.1-3.6 8.1-8v-60c0-4.4-3.6-8-8.1-8zm-353.6-74.7c2.9 3.7 8.5 3.7 11.3 0l100.8-127.5c3.7-4.7.4-11.7-5.7-11.7H550V104c0-4.4-3.6-8-8-8h-60c-4.4 0-8 3.6-8 8v156.1H411.2c-6 0-9.4 7-5.7 11.7l100.8 127.5zm11.4 225.4a7.14 7.14 0 00-11.3 0L405.6 752.3c-3.7 4.7-.4 11.7 5.7 11.7H474V920c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V764h62.8c6 0 9.4-7 5.7-11.7L517.7 624.7z"/></svg>';
    scrollBtn.title = 'Scroll to current subtitle';
    scrollBtn.addEventListener('click', () => {
      const current = scrollContainer.querySelector('.inkahsubs-right-sub.current');
      if (current) {
        this.ignoreNextScroll = true;
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    scrollBtnContainer.appendChild(scrollBtn);
    scrollContainer.appendChild(scrollBtnContainer);

    // Manual scroll detection — pause auto-scroll for 20s (old code pattern)
    scrollContainer.addEventListener('scroll', () => {
      if (this.ignoreNextScroll) {
        this.ignoreNextScroll = false;
      } else {
        this.userScrolledTime = Date.now();
      }
    });

    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i];

      // Time-gap margin (old code: marginBottom ranges [6, 42]px based on gap)
      let marginBottom = 4;
      if (i < this.cues.length - 1) {
        const timeGap = this.cues[i + 1].start - cue.end;
        marginBottom = Math.min(42, timeGap * 6 + 6);
      }

      const row = document.createElement('div');
      row.className = 'inkahsubs-right-sub';
      row.dataset.index = String(i);
      row.style.marginBottom = `${marginBottom}px`;
      row.style.userSelect = 'text';

      // Play caret (shows on hover and for active subtitle)
      const caretCol = document.createElement('div');
      caretCol.className = 'inkahsubs-right-sub-caret';
      caretCol.innerHTML = '&#9654;'; // ▶
      caretCol.addEventListener('click', (e) => {
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent('inkahsubsSeek', { detail: cue.start * 1000 }),
        );
      });
      row.appendChild(caretCol);

      // Text content
      const textEl = document.createElement('div');
      textEl.className = 'inkahsubs-right-sub-text';
      textEl.textContent = getCleanSubText(cue.text);
      textEl.style.flexGrow = '1';
      textEl.style.paddingRight = '4px';
      row.appendChild(textEl);

      // Click row to seek
      row.addEventListener('click', () => {
        window.dispatchEvent(
          new CustomEvent('inkahsubsSeek', { detail: cue.start * 1000 }),
        );
      });

      scrollContainer.appendChild(row);
    }

    this.rightPanel.appendChild(scrollContainer);
  }

  private updateRightPanelHighlight(index: number) {
    if (!this.rightPanel || index === this.currentSubIndex) return;
    this.currentSubIndex = index;

    const rows = this.rightPanel.querySelectorAll('.inkahsubs-right-sub');
    rows.forEach((row, i) => {
      row.classList.toggle('current', i === index);
    });

    // Auto-scroll — pause for 20s after manual scroll (old code pattern)
    const shouldAutoScroll =
      Date.now() - this.userScrolledTime > VideoController.PAUSE_AUTO_SCROLL_TIME;

    if (shouldAutoScroll && index >= 0 && index < rows.length) {
      const currentRow = rows[index] as HTMLElement;
      const container = this.rightPanel.querySelector('.in_rightPanel_scrollContainer');
      if (container && currentRow) {
        // Check if element is in viewport of the scroll container
        const containerRect = container.getBoundingClientRect();
        const rowRect = currentRow.getBoundingClientRect();
        const isVisible =
          rowRect.bottom >= containerRect.top &&
          rowRect.top <= containerRect.bottom;

        if (!isVisible) {
          this.ignoreNextScroll = true;
          currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  // === Settings Icon ===
  // Matches the old extension's exact pattern: MutationObserver on the player
  // element to re-mount when Netflix/YouTube destroys and recreates controls.

  private settingsTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private playerObserver: MutationObserver | null = null;

  /** Idempotent mount — safe to call repeatedly from MutationObserver */
  private mountSettings() {
    // Idempotent: don't create duplicates
    const existing = document.querySelector('.inkahsubs-settings');
    if (existing) return;

    // Find the fullscreen button as our anchor point (matches old code exactly)
    let anchorNode: Element | null = null;

    if (isNetflix()) {
      anchorNode =
        document.querySelector('[data-uia="control-fullscreen-enter"]') ??
        document.querySelector('[data-uia="control-fullscreen-exit"]') ??
        document.querySelector('[aria-label="Full screen"]') ??
        document.querySelector('[aria-label="Exit full screen"]');
    } else if (isYouTube()) {
      anchorNode = document.querySelector('.ytp-fullscreen-button');
    }

    if (!anchorNode) return;

    // Create settings container
    this.settingsEl = document.createElement('div');
    this.settingsEl.className = 'inkahsubs-settings';

    // Build logo + dropdown
    this.buildSettingsContent(this.settingsEl);

    if (isYouTube()) {
      // YouTube: insert directly inside .ytp-right-controls, before the fullscreen button
      const rightControls = anchorNode.parentElement;
      if (!rightControls) return;
      rightControls.insertBefore(this.settingsEl, anchorNode);
    } else {
      // Netflix: go two levels up — fullscreen button → wrapper div → controls bar
      const referenceNode = anchorNode.parentElement;
      if (!referenceNode) return;
      const parentNode = referenceNode.parentElement;
      if (!parentNode) return;
      parentNode.insertBefore(this.settingsEl, referenceNode);
    }
  }

  private buildSettingsContent(container: HTMLElement) {
    // Outer container matching old extension structure
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'inkahsubs-settings-container';

    // Logo — purple Inkah icon
    const logoContainer = document.createElement('div');
    logoContainer.className = 'inkahsubs-settings-container-logo';
    const logoImg = document.createElement('img');
    logoImg.src = chrome.runtime.getURL('/images/inkah-logo-48.png');
    logoImg.alt = 'Inkah';
    logoImg.draggable = false;
    logoContainer.appendChild(logoImg);

    // Settings dropdown — uses exact old class names
    const dropdown = document.createElement('div');
    dropdown.className = 'inkahsubs-settings-wrapper';
    dropdown.style.display = 'none';
    dropdown.style.opacity = '0';

    // --- Show/hide with 750ms delay (old code's exact behavior) ---
    const showDropdown = () => {
      if (this.settingsTransitionTimer) {
        clearTimeout(this.settingsTransitionTimer);
        this.settingsTransitionTimer = null;
      }
      dropdown.style.display = 'block';
      // Trigger opacity transition on next frame
      requestAnimationFrame(() => { dropdown.style.opacity = '1'; });
    };

    const hideDropdown = () => {
      this.settingsTransitionTimer = setTimeout(() => {
        dropdown.style.opacity = '0';
        setTimeout(() => { dropdown.style.display = 'none'; }, 150);
      }, 750);
    };

    logoContainer.addEventListener('mouseenter', showDropdown);
    logoContainer.addEventListener('mouseleave', hideDropdown);
    logoContainer.addEventListener('click', () => {
      if (dropdown.style.display === 'none') showDropdown();
      else { dropdown.style.opacity = '0'; setTimeout(() => dropdown.style.display = 'none', 150); }
    });

    dropdown.addEventListener('mouseenter', () => {
      if (this.settingsTransitionTimer) {
        clearTimeout(this.settingsTransitionTimer);
        this.settingsTransitionTimer = null;
      }
    });
    dropdown.addEventListener('mouseleave', (e) => {
      // Old code: ignore mouseleave from select elements (Firefox fix)
      const target = e.target as HTMLElement;
      if (target?.tagName?.toLowerCase() === 'select') return;
      hideDropdown();
    });

    // Close button (X with CSS pseudo-elements)
    const closeBtn = document.createElement('div');
    closeBtn.className = 'inkahsubs-settings-close';
    closeBtn.addEventListener('click', () => {
      dropdown.style.opacity = '0';
      setTimeout(() => dropdown.style.display = 'none', 150);
    });
    dropdown.appendChild(closeBtn);

    // Header
    const header = document.createElement('div');
    header.className = 'inkahsubs-settings-header';
    header.textContent = isNetflix() ? 'Inkah Netflix settings' : 'Inkah YouTube BETA settings';
    dropdown.appendChild(header);

    // Content area
    const content = document.createElement('div');
    content.className = 'inkahsubs-settings__content';

    // Hint
    const hint = document.createElement('div');
    hint.className = 'inkahsubs-settings__item';
    hint.style.maxWidth = '280px';
    hint.innerHTML = `<div>Hover and press 's' or 'b' to save a word</div>`;
    content.appendChild(hint);

    // Section: Settings header
    const settingsHeader = document.createElement('div');
    settingsHeader.className = 'inkahsubs-settings__content__header';
    settingsHeader.textContent = isNetflix() ? 'Inkah Netflix settings' : 'Inkah YouTube BETA settings';
    content.appendChild(settingsHeader);

    // Enable toggle
    content.appendChild(this.makeSettingsToggle('Enable', true, (v) => {
      this.enabled = v;
      if (v) {
        document.documentElement.classList.add('inkahsubs-enable');
        this.currentText = '';
        if (this.showRightPanel) {
          const pc = this.findPlayerContainer();
          if (pc) pc.classList.add('watch-video__hasRightPanel');
        }
        if (this.cues.length > 0) {
          this.startTimeSync();
        }
      } else {
        document.documentElement.classList.remove('inkahsubs-enable');
        cancelAnimationFrame(this.animFrame);
        if (this.subsContainer) this.subsContainer.innerHTML = '';
        this.currentText = '';
        this.callbacks.removePopup();
        const pc = this.findPlayerContainer();
        if (pc) pc.classList.remove('watch-video__hasRightPanel');
      }
    }));

    // Show double subtitles
    content.appendChild(this.makeSettingsToggle('Show double subtitles', this.showNativeDoubled, (v) => {
      this.showNativeDoubled = v;
      this.currentText = ''; // force re-render
    }));

    // Show transliteration
    content.appendChild(this.makeSettingsToggle('Show transliteration', this.showTransliteration, (v) => {
      this.showTransliteration = v;
      this.currentText = '';
    }));

    // Auto-pause
    content.appendChild(this.makeSettingsToggle('Auto pause when hovering subtitles', this.autoPause, (v) => {
      this.autoPause = v;
    }));

    // Show progress bar
    content.appendChild(this.makeSettingsToggle('Show progress bar', true, (_v) => {}));

    // Right panel
    content.appendChild(
      this.makeSettingsToggle('Show right panel', this.showRightPanel, (v) => {
        this.showRightPanel = v;
        this.renderRightPanel();
      }),
    );

    // Section: Subtitles header
    const subsHeader = document.createElement('div');
    subsHeader.className = 'inkahsubs-settings__content__header';
    subsHeader.textContent = 'Subtitles';
    content.appendChild(subsHeader);

    // Subtitle background
    content.appendChild(
      this.makeSettingsToggle('Subtitles background', this.showBackground, (v) => {
        this.showBackground = v;
        this.currentText = '';
      }),
    );

    // Font size
    const fontRow = document.createElement('div');
    fontRow.className = 'inkahsubs-settings__learning-service inkahsubs-settings__item';
    fontRow.innerHTML = `
      <div class="inkahsubs-settings__item__left-side"><span>Subtitles size</span></div>
      <div class="inkahsubs-settings__item__right-side">
        <div class="inkahsubs-settings__font-size">
          <div class="inkahsubs-settings__button -transparent -minus" id="inkah-font-minus"></div>
          <div class="inkahsubs-settings__font-size__text" id="inkah-font-value">${this.subFontSize}%</div>
          <div class="inkahsubs-settings__button -transparent -plus" id="inkah-font-plus"></div>
        </div>
      </div>`;
    content.appendChild(fontRow);

    // Wire up font buttons after DOM insertion
    setTimeout(() => {
      document.getElementById('inkah-font-minus')?.addEventListener('click', () => {
        this.subFontSize = Math.max(60, this.subFontSize - 5);
        const el = document.getElementById('inkah-font-value');
        if (el) el.textContent = `${this.subFontSize}%`;
        this.currentText = ''; // force re-render with new size
      });
      document.getElementById('inkah-font-plus')?.addEventListener('click', () => {
        this.subFontSize = Math.min(200, this.subFontSize + 5);
        const el = document.getElementById('inkah-font-value');
        if (el) el.textContent = `${this.subFontSize}%`;
        this.currentText = ''; // force re-render with new size
      });
    }, 0);

    // Double subtitles language selector (old code: language.tsx)
    const langRow = document.createElement('div');
    langRow.className = 'inkahsubs-settings-language inkahsubs-settings__item';
    langRow.innerHTML = `
      <div class="inkahsubs-settings__item__left-side"><span>Double subtitles language</span></div>
      <div class="inkahsubs-settings__item__right-side">
        <select class="inkahsubs-settings__select" id="inkah-native-lang-select"></select>
      </div>`;
    content.appendChild(langRow);

    // Populate language selector after DOM insertion
    setTimeout(() => {
      const select = document.getElementById('inkah-native-lang-select') as HTMLSelectElement | null;
      if (!select) return;

      const available = this.service.getAvailableLanguages();
      const langs = available.length > 0 ? available : Object.keys(LANGUAGE_MAP);

      for (const lang of langs.sort((a, b) => {
        const nameA = LANGUAGE_MAP[a] ?? a;
        const nameB = LANGUAGE_MAP[b] ?? b;
        return nameA.localeCompare(nameB);
      })) {
        const opt = document.createElement('option');
        opt.value = lang;
        const ccIndex = lang.indexOf('[cc]');
        const normalizedLang = ccIndex !== -1 ? lang.substring(0, ccIndex) : lang;
        opt.textContent = ccIndex !== -1
          ? `${LANGUAGE_MAP[normalizedLang] ?? normalizedLang} (cc)`
          : LANGUAGE_MAP[normalizedLang] ?? lang;
        if (lang === this.nativeLanguage) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener('change', async () => {
        this.nativeLanguage = select.value;
        try {
          this.nativeCues = await this.service.getSubs(this.nativeLanguage);
          this.currentText = ''; // force re-render
        } catch {
          this.nativeCues = [];
        }
      });
    }, 0);

    dropdown.appendChild(content);
    settingsContainer.appendChild(logoContainer);
    settingsContainer.appendChild(dropdown);
    container.appendChild(settingsContainer);
  }

  /** Create a settings toggle row matching old extension's DOM structure */
  private makeSettingsToggle(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ): HTMLElement {
    const item = document.createElement('label');
    item.className = 'inkahsubs-label inkahsubs-settings__item';
    item.innerHTML = `
      <div class="inkahsubs-settings__item__left-side">
        <div class="inkahsubs-label-text">${label}</div>
      </div>
      <div class="inkahsubs-settings__item__right-side">
        <div class="toggle">
          <input class="toggle-state setting-toggle" type="checkbox" name="check" ${checked ? 'checked' : ''}>
          <div class="toggle-inner"><div class="indicator"></div></div>
          <div class="active-bg"></div>
        </div>
      </div>`;

    const input = item.querySelector('input') as HTMLInputElement;
    const toggleDiv = item.querySelector('.toggle') as HTMLElement;
    toggleDiv?.addEventListener('click', () => {
      input.checked = !input.checked;
      onChange(input.checked);
    });

    return item;
  }


  /**
   * Set up MutationObserver on the player element to re-mount settings
   * when Netflix/YouTube destroys and recreates the controls DOM.
   * This is the exact pattern from the old extension.
   */
  private setupPlayerObserver() {
    if (this.playerObserver) return;

    let playerEl: Element | null = null;
    if (isNetflix()) {
      playerEl = document.querySelector('[data-uia="player"]');
      // Fallback: observe the watch-video container
      if (!playerEl) playerEl = document.querySelector('.watch-video');
    } else if (isYouTube()) {
      playerEl = document.querySelector('.html5-video-container');
      if (!playerEl) playerEl = document.getElementById('movie_player');
    }

    if (!playerEl) {
      // Player not in DOM yet — observe body for it
      const bodyObserver = new MutationObserver(() => {
        const el = isNetflix()
          ? document.querySelector('.watch-video')
          : document.getElementById('movie_player');
        if (el) {
          bodyObserver.disconnect();
          this.setupPlayerObserver();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => bodyObserver.disconnect(), 60000);
      return;
    }

    this.playerObserver = new MutationObserver(() => {
      // Netflix/YouTube changed player attributes — re-mount settings
      this.mountSettings();
    });

    this.playerObserver.observe(playerEl, { attributes: true, subtree: true, childList: true });
  }

  // === Progress Bar ===

  private mountProgressBar(container: HTMLElement) {
    if (this.progressBar) return;
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'inkahsubs-progress-bar';

    // Center indicator
    const indicator = document.createElement('div');
    indicator.className = 'inkahsubs-progress-indicator';
    this.progressBar.appendChild(indicator);

    container.appendChild(this.progressBar);
  }

  private updateProgressBar(currentTime: number) {
    if (!this.progressBar || this.cues.length === 0) return;

    // Show 30-second window centered on current time
    const windowSize = 30;
    const start = currentTime - windowSize / 2;
    const end = currentTime + windowSize / 2;
    const barWidth = this.progressBar.offsetWidth;

    // Remove old cue markers (keep indicator)
    const oldCues = this.progressBar.querySelectorAll('.inkahsubs-progress-cue');
    oldCues.forEach((el) => el.remove());

    for (const cue of this.cues) {
      if (cue.end < start || cue.start > end) continue;

      const leftPct = ((cue.start - start) / windowSize) * 100;
      const widthPct = ((cue.end - cue.start) / windowSize) * 100;

      const el = document.createElement('div');
      el.className = 'inkahsubs-progress-cue';
      el.style.left = `${Math.max(0, leftPct)}%`;
      el.style.width = `${Math.min(100 - leftPct, widthPct)}%`;

      el.addEventListener('click', () => {
        const video = this.service.findVideo();
        if (video) // Use Netflix/YouTube player API via MAIN world — direct video.currentTime crashes Netflix
          window.dispatchEvent(
            new CustomEvent('inkahsubsSeek', { detail: cue.start * 1000 }),
          );
      });

      this.progressBar.appendChild(el);
    }
  }

  // === Time sync loop ===

  private startTimeSync() {
    const tick = () => {
      this.animFrame = requestAnimationFrame(tick);
      if (!this.enabled) return;
      const video = this.service.findVideo();
      if (!video) return;

      const time = video.currentTime;
      const { activeCues, firstIndex } = getSubsForCurrentTime(
        this.cues,
        time,
      );

      this.renderCenterSubs(activeCues);
      this.updateRightPanelHighlight(firstIndex);
      this.updateProgressBar(time);
    };

    cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(tick);
  }

  // === Styles ===

  private injectStyles() {
    if (this.styleEl) return;
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = VIDEO_OVERLAY_CSS;
    document.head.appendChild(this.styleEl);
  }

  private removeStyles() {
    this.styleEl?.remove();
    this.styleEl = null;
  }
}

// Ported from old code: language.tsx languageMap
const LANGUAGE_MAP: Record<string, string> = {
  af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ar: 'Arabic',
  hy: 'Armenian', az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian',
  bn: 'Bengali', bs: 'Bosnian', bg: 'Bulgarian', ca: 'Catalan',
  ceb: 'Cebuano', 'zh-CN': 'Chinese (Simplified)', 'zh-Hans': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', 'zh-Hant': 'Chinese (Traditional)',
  co: 'Corsican', hr: 'Croatian', cs: 'Czech', da: 'Danish',
  nl: 'Dutch', en: 'English', eo: 'Esperanto', et: 'Estonian',
  fi: 'Finnish', fr: 'French', fy: 'Frisian', gl: 'Galician',
  ka: 'Georgian', de: 'German', el: 'Greek', gu: 'Gujarati',
  ht: 'Haitian Creole', ha: 'Hausa', haw: 'Hawaiian', he: 'Hebrew',
  hi: 'Hindi', hmn: 'Hmong', hu: 'Hungarian', is: 'Icelandic',
  ig: 'Igbo', id: 'Indonesian', ga: 'Irish', it: 'Italian',
  ja: 'Japanese', jv: 'Javanese', kn: 'Kannada', kk: 'Kazakh',
  km: 'Khmer', ko: 'Korean', ku: 'Kurdish', ky: 'Kyrgyz',
  lo: 'Lao', la: 'Latin', lv: 'Latvian', lt: 'Lithuanian',
  lb: 'Luxembourgish', mk: 'Macedonian', mg: 'Malagasy', ms: 'Malay',
  ml: 'Malayalam', mt: 'Maltese', mi: 'Maori', mr: 'Marathi',
  mn: 'Mongolian', my: 'Myanmar (Burmese)', ne: 'Nepali', no: 'Norwegian',
  ny: 'Nyanja (Chichewa)', ps: 'Pashto', fa: 'Persian', pl: 'Polish',
  pt: 'Portuguese', pa: 'Punjabi', ro: 'Romanian', ru: 'Russian',
  sm: 'Samoan', gd: 'Scots Gaelic', sr: 'Serbian', st: 'Sesotho',
  sn: 'Shona', sd: 'Sindhi', si: 'Sinhala', sk: 'Slovak',
  sl: 'Slovenian', so: 'Somali', es: 'Spanish', su: 'Sundanese',
  sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog (Filipino)', tg: 'Tajik',
  ta: 'Tamil', te: 'Telugu', th: 'Thai', tr: 'Turkish',
  uk: 'Ukrainian', ur: 'Urdu', uz: 'Uzbek', vi: 'Vietnamese',
  cy: 'Welsh', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu',
  zh: 'Chinese',
};
