import { sendToBackground } from '../messaging/client';
import { isChineseCharacter } from '../lib/parse-chinese';
import { isKoreanLetter } from '../lib/parse-korean';
import type { Settings } from '../data/settings';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    // Keepalive port — keeps the service worker alive while this tab exists.
    // Reconnects automatically if the service worker restarts.
    function connectKeepalive() {
      const port = chrome.runtime.connect({ name: 'keepalive' });
      port.onDisconnect.addListener(() => {
        // Service worker restarted — reconnect after a short delay
        setTimeout(connectKeepalive, 1000);
      });
    }
    connectKeepalive();

    let settings: Settings;
    let isEnabled = true;

    try {
      settings = await sendToBackground<Settings>('settings/get');
      isEnabled = settings.isEnabled ?? true;
    } catch {
      // Extension may not be ready yet
      return;
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.isEnabled) {
        isEnabled = changes.isEnabled.newValue;
      }
      if (changes.targetLanguage) {
        settings = { ...settings, targetLanguage: changes.targetLanguage.newValue };
      }
    });

    // Hover detection
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastPopup: HTMLElement | null = null;

    function removePopup() {
      if (lastPopup) {
        lastPopup.remove();
        lastPopup = null;
      }
    }

    function isTargetLanguageChar(charCode: number): boolean {
      const lang = settings?.targetLanguage ?? 'zh';
      return lang === 'zh'
        ? isChineseCharacter(charCode)
        : isKoreanLetter(charCode);
    }

    function getCharAtPoint(x: number, y: number): { char: string; text: string } | null {
      // Use caretRangeFromPoint / caretPositionFromPoint
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

      // Get a reasonable substring for lookup (up to 12 chars forward)
      const lookupText = textContent.substring(rangeOffset, rangeOffset + 12);
      return { char: textContent[rangeOffset], text: lookupText };
    }

    function createPopupElement(
      definitions: WordDefinitions[],
      x: number,
      y: number,
    ): HTMLElement {
      const container = document.createElement('div');
      container.id = 'inkah-popup';
      container.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        left: ${x}px;
        top: ${y + 20}px;
        max-width: 400px;
        max-height: 300px;
        overflow-y: auto;
        background: ${settings?.isDarkModeOn ? '#1a1a2e' : '#ffffff'};
        color: ${settings?.isDarkModeOn ? '#e0e0e0' : '#333333'};
        border: 1px solid ${settings?.isDarkModeOn ? '#444' : '#ddd'};
        border-radius: 8px;
        padding: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;

      for (const def of definitions.slice(0, 5)) {
        const entry = document.createElement('div');
        entry.style.cssText = 'margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(128,128,128,0.2);';

        const wordSpan = document.createElement('div');
        const word = def.word;
        const wordText = 'hangul' in word
          ? (word as { hangul: string }).hangul
          : `${(word as { traditional: string }).traditional} ${(word as { simplified: string }).simplified}`;
        wordSpan.style.cssText = 'font-size: 18px; font-weight: bold; margin-bottom: 2px;';
        wordSpan.textContent = wordText;
        entry.appendChild(wordSpan);

        if (def.transliteration?.pinyin) {
          const pinyinSpan = document.createElement('div');
          pinyinSpan.style.cssText = 'font-size: 12px; color: #888; margin-bottom: 4px;';
          pinyinSpan.textContent = def.transliteration.pinyin;
          entry.appendChild(pinyinSpan);
        }

        for (const d of def.definitions.slice(0, 3)) {
          const defSpan = document.createElement('div');
          defSpan.style.cssText = 'font-size: 13px; margin-left: 4px;';
          defSpan.textContent = `• ${d}`;
          entry.appendChild(defSpan);
        }

        container.appendChild(entry);
      }

      // Keep popup visible on mouseenter
      container.addEventListener('mouseenter', () => {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
      });

      container.addEventListener('mouseleave', removePopup);

      return container;
    }

    async function handleMouseMove(e: MouseEvent) {
      if (!isEnabled) return;

      // Check if target is an input/textarea
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

        try {
          const definitions = await sendToBackground<WordDefinitions[] | null>(
            'search/text',
            { text: result.text },
          );

          if (definitions && definitions.length > 0) {
            removePopup();
            lastPopup = createPopupElement(
              definitions,
              e.clientX,
              e.clientY,
            );
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

    console.log('[inkah] Content script loaded');
  },
});
