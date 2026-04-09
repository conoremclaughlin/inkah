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
    if (!language) {
      this.cues = [];
      this.currentText = '';
      this.unmountAll();
      return;
    }

    try {
      this.cues = await this.service.getSubs(language);

      if (this.cues.length > 0) {
        this.mountAll();
        this.startTimeSync();
      }
    } catch (err) {
      console.warn('[inkah] Failed to fetch subtitles:', err);
    }
  };

  // === Mounting ===

  /** Mount settings icon as soon as the controls bar is available */
  private mountSettingsWhenReady() {
    // Try immediately
    this.mountSettings();
    // Also observe for controls appearing later
    if (!this.settingsEl) {
      this.observeForControls();
    }
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
    this.settingsEl?.remove();
    this.settingsEl = null;
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

  private mountSettings() {
    if (this.settingsEl) return;

    let parentNode: Element | null = null;
    if (isNetflix()) {
      parentNode = document.querySelector('[data-uia="controls-standard"]');
    } else if (isYouTube()) {
      parentNode = document.querySelector('.ytp-right-controls');
    }

    if (!parentNode) {
      // Controls may not be visible yet — observe for them
      this.observeForControls();
      return;
    }

    this.settingsEl = document.createElement('div');
    this.settingsEl.className = 'inkahsubs-settings medium';

    // Inkah logo icon — styled to match Netflix's control buttons
    const iconBtn = document.createElement('button');
    iconBtn.className = 'inkahsubs-settings-btn';
    iconBtn.setAttribute('aria-label', 'Inkah Dictionary');
    const icon = document.createElement('img');
    icon.className = 'inkahsubs-settings-icon';
    icon.src = chrome.runtime.getURL('/images/inkah-logo-48.png');
    icon.alt = 'Inkah';
    iconBtn.appendChild(icon);
    this.settingsEl.appendChild(iconBtn);

    // Settings dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'inkahsubs-settings-wrapper';

    const makeToggle = (
      label: string,
      checked: boolean,
      onChange: (v: boolean) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'inkahsubs-settings-row';

      const lbl = document.createElement('span');
      lbl.className = 'inkahsubs-settings-label';
      lbl.textContent = label;
      row.appendChild(lbl);

      const toggle = document.createElement('label');
      toggle.className = 'inkahsubs-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      const track = document.createElement('span');
      track.className = 'inkahsubs-toggle-track';
      const thumb = document.createElement('span');
      thumb.className = 'inkahsubs-toggle-thumb';
      toggle.append(input, track, thumb);
      row.appendChild(toggle);

      return row;
    };

    dropdown.appendChild(
      makeToggle('Right Panel', this.showRightPanel, (v) => {
        this.showRightPanel = v;
        this.renderRightPanel();
      }),
    );

    dropdown.appendChild(
      makeToggle('Background', this.showBackground, (v) => {
        this.showBackground = v;
        this.currentText = ''; // force re-render
      }),
    );

    this.settingsEl.appendChild(dropdown);

    // Insert into player controls
    if (isNetflix()) {
      // Insert before the fullscreen button for consistent placement
      const fullscreenBtn = parentNode.querySelector('[data-uia="control-fullscreen-enter"], [data-uia="control-fullscreen-exit"]');
      if (fullscreenBtn) {
        // The button is wrapped in a div.medium container — insert before that
        const btnContainer = fullscreenBtn.closest('.medium, [class*="1dcjcj4"]') ?? fullscreenBtn;
        btnContainer.parentElement?.insertBefore(this.settingsEl, btnContainer);
      } else {
        parentNode.appendChild(this.settingsEl);
      }
    } else {
      parentNode.prepend(this.settingsEl);
    }
  }

  /** Observe DOM for Netflix/YouTube controls to appear, then mount settings icon */
  private observeForControls() {
    const selector = isNetflix()
      ? '[data-uia="controls-standard"]'
      : '.ytp-right-controls';

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el && !this.settingsEl) {
        observer.disconnect();
        this.mountSettings();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Stop observing after 60s to avoid leaks
    setTimeout(() => observer.disconnect(), 60000);
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
