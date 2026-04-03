import { sendToBackground } from '../messaging/client';
import {
  isChineseCharacter,
  toIndexesFromToneSuffix,
  toPinyinFromToneSuffix,
  toZhuyinFromToneSuffix,
} from '../lib/parse-chinese';
import { isKoreanLetter } from '../lib/parse-korean';
import type { Settings } from '../data/settings';

const TONE_KEYS = [
  'firstTone',
  'secondTone',
  'thirdTone',
  'fourthTone',
  'fifthTone',
] as const;

const FONT_SIZES: Record<number, number> = {
  1: 15,
  2: 17,
  3: 20,
  4: 24,
  5: 27,
};

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    // Keepalive port — keeps the service worker alive while this tab exists.
    function connectKeepalive() {
      const port = chrome.runtime.connect({ name: 'keepalive' });
      port.onDisconnect.addListener(() => {
        setTimeout(connectKeepalive, 1000);
      });
    }
    connectKeepalive();

    let settings: Settings;

    try {
      settings = await sendToBackground<Settings>('settings/get');
    } catch {
      return;
    }

    // Listen for all settings changes reactively
    chrome.storage.onChanged.addListener((changes) => {
      const patch: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(changes)) {
        patch[key] = change.newValue;
      }
      settings = { ...settings, ...patch } as Settings;
    });

    // --- Hover detection state ---
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastPopup: HTMLElement | null = null;
    // Track the currently hovered text position so popup stays fixed
    let lockedRangeNode: Node | null = null;
    let lockedRangeOffset = -1;

    function removePopup() {
      if (lastPopup) {
        lastPopup.remove();
        lastPopup = null;
      }
      lockedRangeNode = null;
      lockedRangeOffset = -1;
    }

    function isHoverKeyPressed(e: MouseEvent): boolean {
      const key = settings?.hoverKey ?? 'noKey';
      switch (key) {
        case 'ctrl':
          return e.ctrlKey;
        case 'option':
          return e.altKey;
        case 'command':
          return e.metaKey;
        case 'shift':
          return e.shiftKey;
        case 'noKey':
        default:
          return true;
      }
    }

    function isTargetLanguageChar(charCode: number): boolean {
      const lang = settings?.targetLanguage ?? 'zh';
      return lang === 'zh'
        ? isChineseCharacter(charCode)
        : isKoreanLetter(charCode);
    }

    interface CharAtPointResult {
      char: string;
      text: string;
      rangeNode: Node;
      rangeOffset: number;
      rect: DOMRect;
    }

    function getCharAtPoint(
      x: number,
      y: number,
    ): CharAtPointResult | null {
      let range: Range | null = null;
      let rangeNode: Node | null = null;
      let rangeOffset = 0;

      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (!r) return null;
        range = r;
        rangeNode = r.startContainer;
        rangeOffset = r.startOffset;
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(x, y);
        if (!pos) return null;
        rangeNode = pos.offsetNode;
        rangeOffset = pos.offset;
      }

      if (!rangeNode || rangeNode.nodeType !== Node.TEXT_NODE) return null;
      const textContent = rangeNode.textContent ?? '';
      if (rangeOffset >= textContent.length) return null;

      const charCode = textContent.codePointAt(rangeOffset);
      if (!charCode || !isTargetLanguageChar(charCode)) return null;

      // Get the bounding rect of the hovered character for stable positioning
      let rect: DOMRect;
      if (range) {
        range.setStart(rangeNode, rangeOffset);
        range.setEnd(rangeNode, Math.min(rangeOffset + 1, textContent.length));
        rect = range.getBoundingClientRect();
      } else {
        // Fallback: use cursor position
        rect = new DOMRect(x, y, 0, 16);
      }

      const lookupText = textContent.substring(rangeOffset, rangeOffset + 12);
      return {
        char: textContent[rangeOffset],
        text: lookupText,
        rangeNode,
        rangeOffset,
        rect,
      };
    }

    // --- Tone coloring ---
    function getToneColor(toneIndex: number): string | null {
      if (!settings?.isColorEnabled) return null;
      const colorMode = settings?.isDarkModeOn ? 'dark' : 'light';
      const colors = settings?.toneColors?.[colorMode];
      if (!colors || toneIndex < 0 || toneIndex >= TONE_KEYS.length)
        return null;
      return (colors as Record<string, string>)[TONE_KEYS[toneIndex]] ?? null;
    }

    // --- Popup rendering ---
    function createPopupElement(
      definitions: WordDefinitions[],
      rect: DOMRect,
    ): HTMLElement {
      const isDark = settings?.isDarkModeOn ?? false;
      const charFontSize = FONT_SIZES[settings?.fontSize ?? 2] ?? 16;

      const container = document.createElement('div');
      container.id = 'inkah-popup';

      // Position below the hovered text line, with right-edge flip
      const popupWidth = 420;
      const vw = window.innerWidth;
      const anchorLeft = rect.left;
      const anchorBottom = rect.bottom + 10; // 10px gap below text

      let leftPos: number;
      if (anchorLeft + popupWidth + 16 > vw) {
        // Near right edge — align popup's right edge to the text
        leftPos = Math.max(8, rect.right - popupWidth);
      } else {
        leftPos = Math.max(8, anchorLeft);
      }
      const topPos = anchorBottom;

      container.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        left: ${leftPos}px;
        top: ${topPos}px;
        max-width: ${popupWidth}px;
        min-width: 280px;
        max-height: calc(50vh - 28px);
        overflow-y: auto;
        background: ${isDark ? '#262626' : '#ffffff'};
        color: ${isDark ? '#e0e0e0' : '#333333'};
        border: 1px solid ${isDark ? '#444' : '#ccc'};
        border-radius: 6px;
        padding: 8px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        box-shadow: 0 4px 12px rgba(0,0,0,${isDark ? '0.4' : '0.15'});
      `;

      const lang = settings?.targetLanguage ?? 'zh';
      const count = Math.min(definitions.length, 5);

      for (let i = 0; i < count; i++) {
        const def = definitions[i];
        const entry = document.createElement('div');
        entry.style.cssText = `padding: 4px 0;${
          i < count - 1
            ? ` border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};`
            : ''
        }`;

        if (lang === 'zh') {
          renderChineseEntry(entry, def, charFontSize, isDark);
        } else {
          renderKoreanEntry(entry, def, charFontSize, isDark);
        }

        container.appendChild(entry);
      }

      container.addEventListener('mouseenter', () => {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
      });
      container.addEventListener('mouseleave', removePopup);

      return container;
    }

    function renderChineseEntry(
      entry: HTMLElement,
      def: WordDefinitions,
      fontSize: number,
      isDark: boolean,
    ) {
      const word = def.word as { traditional: string; simplified: string };
      const charType = settings?.characterType ?? 'simplified_traditional';
      const pinyin = def.transliteration?.pinyin ?? '';
      const toneIndexes = toIndexesFromToneSuffix(pinyin);

      // Build character array based on character type setting
      let characters: string[];
      switch (charType) {
        case 'simplified':
          characters = [...word.simplified];
          break;
        case 'traditional':
          characters = [...word.traditional];
          break;
        case 'simplified_traditional':
          characters = [...word.simplified, ' ', ...word.traditional];
          break;
        case 'traditional_simplified':
          characters = [...word.traditional, ' ', ...word.simplified];
          break;
        default:
          characters = [...word.simplified, ' ', ...word.traditional];
      }

      // Header: tone-colored characters + transliteration
      const header = document.createElement('div');
      header.style.cssText =
        'display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px;';

      // Characters
      const charSpan = document.createElement('span');
      charSpan.style.cssText = `font-size: ${fontSize}px; font-weight: bold; margin-right: 6px; line-height: 1.3;`;

      for (let i = 0; i < characters.length; i++) {
        const ch = characters[i];
        if (ch === ' ') {
          charSpan.appendChild(document.createTextNode(' '));
          continue;
        }
        const color = getToneColor(toneIndexes[i]);
        if (color) {
          const span = document.createElement('span');
          span.style.color = color;
          span.textContent = ch;
          charSpan.appendChild(span);
        } else {
          charSpan.appendChild(document.createTextNode(ch));
        }
      }
      header.appendChild(charSpan);

      // Transliteration (pinyin or zhuyin), tone-colored
      const isTranslitEnabled =
        settings?.isTransliterationEnabled?.zh ?? true;
      if (isTranslitEnabled && pinyin) {
        const translitType = settings?.transliteration?.zh ?? 'pinyin';
        const translitText =
          translitType === 'zhuyin'
            ? toZhuyinFromToneSuffix(pinyin)
            : toPinyinFromToneSuffix(pinyin);
        const translitWords = translitText.split(' ');

        const translitSpan = document.createElement('span');
        translitSpan.style.cssText = `font-size: ${Math.max(fontSize - 2, 13)}px;`;

        for (let i = 0; i < translitWords.length; i++) {
          const color = getToneColor(toneIndexes[i]);
          const span = document.createElement('span');
          span.style.cssText = `margin-right: 3px;${color ? ` color: ${color};` : ''}`;
          span.textContent = translitWords[i];
          translitSpan.appendChild(span);
        }
        header.appendChild(translitSpan);
      }

      entry.appendChild(header);

      // Definitions — semicolon-separated
      const defsDiv = document.createElement('div');
      defsDiv.style.cssText = `font-size: 14px; color: ${isDark ? '#d0d0d0' : '#444'}; margin-top: 1px;`;
      defsDiv.textContent = toPinyinFromToneSuffix(
        def.definitions.join('; '),
      );
      entry.appendChild(defsDiv);
    }

    function renderKoreanEntry(
      entry: HTMLElement,
      def: WordDefinitions,
      fontSize: number,
      isDark: boolean,
    ) {
      const word = (def.word as { hangul: string }).hangul;

      const header = document.createElement('div');
      header.style.cssText =
        'display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px;';

      const wordSpan = document.createElement('span');
      wordSpan.style.cssText = `font-size: ${fontSize}px; font-weight: bold; line-height: 1.3;`;
      wordSpan.textContent = word;
      header.appendChild(wordSpan);

      // Romanization
      const isTranslitEnabled =
        settings?.isTransliterationEnabled?.ko ?? false;
      if (isTranslitEnabled && def.transliteration?.romanization) {
        const translitSpan = document.createElement('span');
        translitSpan.style.cssText = `font-size: ${Math.max(fontSize - 4, 12)}px; color: ${isDark ? '#999' : '#666'};`;
        translitSpan.textContent = def.transliteration.romanization;
        header.appendChild(translitSpan);
      }

      entry.appendChild(header);

      // Definitions — semicolon-separated
      const defsDiv = document.createElement('div');
      defsDiv.style.cssText = `font-size: 14px; color: ${isDark ? '#d0d0d0' : '#444'}; margin-top: 1px;`;
      defsDiv.textContent = def.definitions.join('; ');
      entry.appendChild(defsDiv);
    }

    // --- Event handlers ---
    async function handleMouseMove(e: MouseEvent) {
      if (!(settings?.isEnabled ?? true)) return;
      if (!isHoverKeyPressed(e)) return;

      const target = e.target as HTMLElement;
      if (target) {
        const tagName = target.tagName?.toLowerCase();
        if (
          tagName === 'textarea' ||
          tagName === 'input' ||
          target.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }

      // Don't re-lookup if hovering inside our own popup
      if (lastPopup?.contains(target)) return;

      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      const delay = settings?.lookUpDelay ?? 20;

      hoverTimeout = setTimeout(async () => {
        const result = getCharAtPoint(e.clientX, e.clientY);
        if (!result) {
          removePopup();
          return;
        }

        // If still hovering the same text node + offset, keep popup fixed
        if (
          lastPopup &&
          lockedRangeNode === result.rangeNode &&
          lockedRangeOffset === result.rangeOffset
        ) {
          return;
        }

        try {
          const definitions = await sendToBackground<
            WordDefinitions[] | null
          >('search/text', { text: result.text });

          if (definitions && definitions.length > 0) {
            removePopup();
            lockedRangeNode = result.rangeNode;
            lockedRangeOffset = result.rangeOffset;
            lastPopup = createPopupElement(definitions, result.rect);
            document.body.appendChild(lastPopup);
          } else {
            removePopup();
          }
        } catch {
          // Silently fail on lookup errors
        }
      }, delay);
    }

    function handleClick() {
      removePopup();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        removePopup();
      }
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
  },
});
