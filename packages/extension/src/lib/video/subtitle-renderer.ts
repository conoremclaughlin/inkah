import type { SubtitleCue, VideoService } from './types';
import type { Settings } from '../../data/settings';
import { isChineseCharacter } from '../parse-chinese';
import { isKoreanLetter } from '../parse-korean';

/**
 * Renders tokenized subtitle overlay on video with hoverable words.
 * Hides native subtitles and syncs custom overlay to video time.
 */
export class SubtitleRenderer {
  private service: VideoService;
  private settings: Settings;
  private cues: SubtitleCue[] = [];
  private overlay: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private currentText = '';
  private animFrame = 0;
  private onWordHover: ((text: string, rect: DOMRect) => void) | null = null;
  private onWordLeave: (() => void) | null = null;

  constructor(
    service: VideoService,
    settings: Settings,
    callbacks: {
      onWordHover: (text: string, rect: DOMRect) => void;
      onWordLeave: () => void;
    },
  ) {
    this.service = service;
    this.settings = settings;
    this.onWordHover = callbacks.onWordHover;
    this.onWordLeave = callbacks.onWordLeave;
  }

  updateSettings(settings: Settings) {
    this.settings = settings;
  }

  async start() {
    this.injectStyles();

    // Listen for subtitle changes
    window.addEventListener(
      'inkahsubsSubtitlesChanged',
      this.handleSubtitleChange,
    );
    window.addEventListener(
      'inkahsubsVideoReady',
      this.handleVideoReady,
    );
  }

  stop() {
    cancelAnimationFrame(this.animFrame);
    this.removeOverlay();
    this.removeStyles();
    window.removeEventListener(
      'inkahsubsSubtitlesChanged',
      this.handleSubtitleChange,
    );
    window.removeEventListener(
      'inkahsubsVideoReady',
      this.handleVideoReady,
    );
  }

  private handleVideoReady = () => {
    this.cues = [];
    this.currentText = '';
    this.removeOverlay();
  };

  private handleSubtitleChange = async (e: Event) => {
    const language = (e as CustomEvent).detail?.language ?? (e as CustomEvent).detail ?? '';
    if (!language) {
      this.cues = [];
      this.currentText = '';
      this.removeOverlay();
      return;
    }

    try {
      this.cues = await this.service.getSubs(language);
      if (this.cues.length > 0) {
        this.ensureOverlay();
        this.startTimeSync();
      }
    } catch {
      this.cues = [];
    }
  };

  private ensureOverlay() {
    if (this.overlay) return;

    const video = this.service.findVideo();
    if (!video) return;

    // Find the video's container
    const container = this.findVideoContainer(video);
    if (!container) return;

    // Make container positioned for overlay
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'inkah-subs';
    container.appendChild(this.overlay);
  }

  private removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private findVideoContainer(video: HTMLVideoElement): HTMLElement | null {
    // Netflix
    const netflixContainer = document.querySelector('.watch-video');
    if (netflixContainer) return netflixContainer as HTMLElement;

    // YouTube
    const ytContainer = document.getElementById('movie_player');
    if (ytContainer) return ytContainer as HTMLElement;

    // Fallback: video's parent
    return video.parentElement;
  }

  private startTimeSync() {
    const tick = () => {
      this.animFrame = requestAnimationFrame(tick);
      const video = this.service.findVideo();
      if (!video || !this.overlay) return;

      const time = video.currentTime;
      const activeCues = this.cues.filter(
        (c) => c.start <= time && time <= c.end,
      );
      const text = activeCues.map((c) => c.text).join('\n');

      if (text !== this.currentText) {
        this.currentText = text;
        this.renderSubtitleText(text);
      }
    };
    cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(tick);
  }

  private renderSubtitleText(text: string) {
    if (!this.overlay) return;

    if (!text) {
      this.overlay.innerHTML = '';
      return;
    }

    const isDark = this.settings.isDarkModeOn ?? false;
    const lang = this.settings.targetLanguage ?? 'zh';

    this.overlay.innerHTML = '';

    const lines = text.split('\n');
    for (const line of lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'inkah-sub-line';

      // Tokenize based on language
      const tokens = this.tokenize(line, lang);

      for (const token of tokens) {
        const span = document.createElement('span');
        span.className = 'inkah-sub-word';
        span.textContent = token;

        span.addEventListener('mouseenter', () => {
          span.classList.add('inkah-sub-word--hover');
          // Get a forward-looking chunk for dictionary lookup
          const lookupText = this.getLookupText(line, token, tokens);
          const rect = span.getBoundingClientRect();
          this.onWordHover?.(lookupText, rect);
        });

        span.addEventListener('mouseleave', () => {
          span.classList.remove('inkah-sub-word--hover');
          this.onWordLeave?.();
        });

        lineEl.appendChild(span);
      }

      this.overlay.appendChild(lineEl);
    }
  }

  /** Tokenize subtitle text into hoverable segments */
  private tokenize(text: string, lang: SupportedLanguages): string[] {
    const tokens: string[] = [];
    let i = 0;

    while (i < text.length) {
      const code = text.codePointAt(i)!;
      const isCjk =
        lang === 'zh'
          ? isChineseCharacter(code)
          : isKoreanLetter(code);

      if (isCjk) {
        // CJK: each character is a separate token for granular lookup
        tokens.push(text[i]);
        i++;
      } else if (/\s/.test(text[i])) {
        // Whitespace: collect as one token
        let ws = '';
        while (i < text.length && /\s/.test(text[i])) {
          ws += text[i];
          i++;
        }
        tokens.push(ws);
      } else {
        // Non-CJK word: collect until space or CJK
        let word = '';
        while (i < text.length) {
          const c = text.codePointAt(i)!;
          const nextIsCjk =
            lang === 'zh'
              ? isChineseCharacter(c)
              : isKoreanLetter(c);
          if (/\s/.test(text[i]) || nextIsCjk) break;
          word += text[i];
          i++;
        }
        tokens.push(word);
      }
    }

    return tokens;
  }

  /** Get forward-looking text from the hovered token for dictionary lookup */
  private getLookupText(
    line: string,
    token: string,
    tokens: string[],
  ): string {
    const idx = tokens.indexOf(token);
    if (idx === -1) return token;

    // For CJK, collect up to 12 chars forward for longest-match
    let text = '';
    for (let i = idx; i < tokens.length && text.length < 12; i++) {
      text += tokens[i];
    }
    return text;
  }

  private injectStyles() {
    if (this.styleEl) return;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = `
      /* Hide native subtitles */
      .player-timedtext { display: none !important; }
      .image-based-subtitles { display: none !important; }
      .captions-text { display: none !important; }
      .ytp-caption-segment { display: none !important; }
      .ytp-caption-window-container { display: none !important; }

      /* Inkah subtitle overlay */
      #inkah-subs {
        position: absolute;
        bottom: 12%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        text-align: center;
        pointer-events: auto;
        max-width: 85%;
        font-size: 28px;
        line-height: 1.4;
      }

      .inkah-sub-line {
        background: rgba(0, 0, 0, 0.75);
        border-radius: 4px;
        padding: 4px 10px;
        margin-bottom: 2px;
        display: inline-block;
      }

      .inkah-sub-word {
        color: #fff;
        cursor: pointer;
        transition: color 0.1s;
        position: relative;
      }

      .inkah-sub-word--hover {
        color: #1296ba;
      }

      /* YouTube fullscreen */
      .ytp-fullscreen #inkah-subs {
        bottom: 15%;
        font-size: 36px;
      }

      /* Netflix responsive */
      @media (max-height: 800px) {
        #inkah-subs { bottom: 15%; }
      }
    `;
    document.head.appendChild(this.styleEl);
  }

  private removeStyles() {
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
