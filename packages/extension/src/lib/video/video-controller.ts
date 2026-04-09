import type { SubtitleCue, VideoService } from './types';
import type { Settings } from '../../data/settings';
import { VIDEO_OVERLAY_CSS } from './video-styles';
import {
  getCleanSubText,
  getSubsForCurrentTime,
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
  private subFontSize = 100;
  private currentSubIndex = -1;

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

  async start() {
    this.injectStyles();

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
      this.currentText = '';
      this.unmountAll();
      return;
    }

    try {
      this.cues = await this.service.getSubs(language);
      console.log('[inkah] Fetched', this.cues.length, 'subtitle cues');

      if (this.cues.length > 0) {
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
    container.appendChild(this.subsContainer);
  }

  private renderCenterSubs(activeCues: SubtitleCue[]) {
    if (!this.subsContainer) return;

    const text = activeCues.map((c) => getCleanSubText(c.text)).join('\n');
    if (text === this.currentText) return;
    this.currentText = text;

    this.subsContainer.innerHTML = '';
    if (!text) return;

    const lang = this.settings.targetLanguage ?? 'zh';
    const wrapper = document.createElement('div');
    wrapper.className = 'inkahsubs-subtitles';

    const lines = text.split('\n');
    for (const line of lines) {
      const lineEl = document.createElement('div');
      lineEl.className = `inkahsubs-subtitles__sub${this.showBackground ? ' inkahsubs-show-subtitles-background' : ''}`;

      const tokens = tokenizeSubtitle(line, lang);
      for (let ti = 0; ti < tokens.length; ti++) {
        const token = tokens[ti];
        if (/^\s+$/.test(token)) {
          lineEl.appendChild(document.createTextNode(token));
          continue;
        }

        const span = document.createElement('span');
        span.className = 'inkahsubs-word';
        span.textContent = token;

        const lookupText = getLookupText(tokens, ti);
        span.addEventListener('mouseenter', async () => {
          span.style.color = '#1296ba';
          try {
            const defs = await this.callbacks.lookup(lookupText);
            if (defs && defs.length > 0) {
              const rect = span.getBoundingClientRect();
              this.callbacks.showPopup(defs, rect);
            }
          } catch {}
        });
        span.addEventListener('mouseleave', () => {
          span.style.color = '';
        });

        lineEl.appendChild(span);
      }

      wrapper.appendChild(lineEl);
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

    if (!this.showRightPanel || this.cues.length === 0) {
      this.rightPanel.classList.remove('inkahsubs-show');
      return;
    }

    this.rightPanel.classList.add('inkahsubs-show');

    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i];
      const row = document.createElement('div');
      row.className = 'inkahsubs-right-sub';
      row.dataset.index = String(i);

      const textEl = document.createElement('div');
      textEl.className = 'inkahsubs-right-sub-text';
      textEl.textContent = getCleanSubText(cue.text);
      row.appendChild(textEl);

      // Click to seek
      row.addEventListener('click', () => {
        const video = this.service.findVideo();
        if (video) {
          video.currentTime = cue.start;
        }
      });

      this.rightPanel.appendChild(row);
    }
  }

  private updateRightPanelHighlight(index: number) {
    if (!this.rightPanel || index === this.currentSubIndex) return;
    this.currentSubIndex = index;

    const rows = this.rightPanel.querySelectorAll('.inkahsubs-right-sub');
    rows.forEach((row, i) => {
      row.classList.toggle('current', i === index);
    });

    // Auto-scroll to current
    if (index >= 0 && index < rows.length) {
      rows[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    // Navigate up to find the right insertion parent
    // Old code: referenceNode = node.parentNode, parentNode = referenceNode.parentNode
    // Then: parentNode.insertBefore(settingNode, referenceNode)
    const referenceNode = anchorNode.parentElement;
    if (!referenceNode) return;
    const parentNode = referenceNode.parentElement;
    if (!parentNode) return;

    // Create settings container
    this.settingsEl = document.createElement('div');
    this.settingsEl.className = 'inkahsubs-settings';

    // Build logo + dropdown
    this.buildSettingsContent(this.settingsEl);

    // Insert BEFORE the fullscreen button's container (old code's exact pattern)
    parentNode.insertBefore(this.settingsEl, referenceNode);
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
    content.appendChild(this.makeSettingsToggle('Enable', true, (_v) => {}));

    // Show native double subtitles
    content.appendChild(this.makeSettingsToggle('Show native double subtitles', false, (_v) => {}));

    // Show transliteration
    content.appendChild(this.makeSettingsToggle('Show transliteration', false, (_v) => {}));

    // Auto-pause
    content.appendChild(this.makeSettingsToggle('Auto pause when hovering subtitles', false, (_v) => {}));

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
        this.currentText = '';
      });
      document.getElementById('inkah-font-plus')?.addEventListener('click', () => {
        this.subFontSize = Math.min(200, this.subFontSize + 5);
        const el = document.getElementById('inkah-font-value');
        if (el) el.textContent = `${this.subFontSize}%`;
        this.currentText = '';
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
        if (video) video.currentTime = cue.start;
      });

      this.progressBar.appendChild(el);
    }
  }

  // === Time sync loop ===

  private startTimeSync() {
    const tick = () => {
      this.animFrame = requestAnimationFrame(tick);
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
