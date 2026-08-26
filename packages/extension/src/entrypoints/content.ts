import { sendToBackground } from '../messaging/client';
import {
  isChineseCharacter,
  toIndexesFromToneSuffix,
  toPinyinFromToneSuffix,
  toZhuyinFromToneSuffix,
} from '../lib/parse-chinese';
import { isKoreanLetter } from '../lib/parse-korean';
import type { Settings } from '../data/settings';
import { NetflixService } from '../lib/video/netflix-service';
import { YouTubeService } from '../lib/video/youtube-service';
import { VideoController } from '../lib/video/video-controller';

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
    // Reconnects aggressively on disconnect (SPA navigations on Netflix/YouTube
    // can cause the port to close).
    function connectKeepalive() {
      try {
        const port = chrome.runtime.connect({ name: 'keepalive' });
        port.onDisconnect.addListener(() => {
          setTimeout(connectKeepalive, 500);
        });
      } catch {
        // Extension context invalidated — stop trying
      }
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

    // --- Definition cache for instant subtitle hover ---
    const defCache = new Map<string, WordDefinitions[] | null>();

    /** Pre-cache definitions for all character positions in a subtitle line.
     *  Uses batch endpoint for a single round-trip instead of N individual calls. */
    function precacheSubtitle(text: string): Promise<void> {
      const texts: string[] = [];
      for (let i = 0; i < text.length; i++) {
        const ch = text.codePointAt(i);
        if (!ch) continue;
        const lang = settings?.targetLanguage ?? 'zh';
        const isCJK = lang === 'zh' ? isChineseCharacter(ch) : isKoreanLetter(ch);
        if (!isCJK) continue;

        const substr = text.substring(i, i + 15);
        if (!defCache.has(substr)) {
          texts.push(substr);
        }
      }
      if (texts.length === 0) return Promise.resolve();

      return sendToBackground<Record<string, WordDefinitions[] | null>>(
        'search/batch', { texts },
      )
        .then((results) => {
          for (const [key, defs] of Object.entries(results)) {
            defCache.set(key, defs);
          }
        })
        .catch(() => {});
    }

    /** Build a position-indexed transliteration map for ruby annotations.
     *  Walks through text doing greedy longest-match from defCache, mapping
     *  each character position to its pinyin/zhuyin syllable. */
    function getTransliterationForText(text: string): Map<number, string> {
      const result = new Map<number, string>();
      const lang = settings?.targetLanguage ?? 'zh';
      let i = 0;
      while (i < text.length) {
        const ch = text.codePointAt(i);
        if (!ch) { i++; continue; }
        const isCJK = lang === 'zh' ? isChineseCharacter(ch) : isKoreanLetter(ch);
        if (!isCJK) { i++; continue; }

        const substr = text.substring(i, i + 15);
        const defs = defCache.get(substr);
        if (defs && defs.length > 0) {
          const def = defs[0];
          const word = 'hangul' in def.word
            ? (def.word as { hangul: string }).hangul
            : (def.word as { simplified: string }).simplified;
          const pinyin = def.transliteration?.pinyin;
          if (pinyin) {
            const translitType = settings?.transliteration?.zh ?? 'pinyin';
            const formatted = translitType === 'zhuyin'
              ? toZhuyinFromToneSuffix(pinyin)
              : toPinyinFromToneSuffix(pinyin);
            const syllables = formatted.split(' ');
            for (let j = 0; j < word.length && j < syllables.length; j++) {
              result.set(i + j, syllables[j]);
            }
            i += word.length;
          } else {
            i++;
          }
        } else {
          i++;
        }
      }
      return result;
    }

    // --- Hover detection state ---
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastPopup: HTMLElement | null = null;
    // Track the currently hovered text position so popup stays fixed
    let lockedRangeNode: Node | null = null;
    let lockedRangeOffset = -1;
    // True only while the current browser Selection is OUR hover highlight.
    // A selection the user made themselves must never be cleared by us.
    let hoverSelectionActive = false;
    // The exact range we set as the hover highlight. Before clearing we
    // verify the live selection still matches it — if the user replaced or
    // extended it (Cmd/Ctrl+A, Shift+Arrow), the selection is theirs now.
    let ownedRange: {
      startContainer: Node;
      startOffset: number;
      endContainer: Node;
      endOffset: number;
    } | null = null;
    // Bumped whenever the user takes over (mousedown) or a newer hover
    // supersedes an older one — in-flight lookups check it after awaiting
    // so stale async work can never render into a user selection.
    let hoverGeneration = 0;
    // Video controller ref — set later if on Netflix/YouTube
    let activeVideoController: VideoController | null = null;

    function removePopup() {
      if (lastPopup) {
        lastPopup.remove();
        lastPopup = null;
      }
      lockedRangeNode = null;
      lockedRangeOffset = -1;

      // Clear hover highlight (old code: selection.empty()) — but only
      // when the selection is one WE made. Clearing unconditionally wiped
      // user text selections on every mousemove (copy/paste was impossible).
      // Verify the live selection still EXACTLY matches the range we set:
      // if the user extended or replaced it (Cmd/Ctrl+A, Shift+Arrow), it
      // belongs to them now and must survive.
      if (hoverSelectionActive) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount === 1 && ownedRange) {
          const r = sel.getRangeAt(0);
          const stillOurs =
            r.startContainer === ownedRange.startContainer &&
            r.startOffset === ownedRange.startOffset &&
            r.endContainer === ownedRange.endContainer &&
            r.endOffset === ownedRange.endOffset;
          if (stillOurs) {
            sel.empty();
          }
        }
        hoverSelectionActive = false;
        ownedRange = null;
      }

      // Auto-pause is now handled by mouseenter/mouseleave on the subs container
    }

    /** Highlight the matched word using browser selection (from old setHoverSelection) */
    /**
     * Highlight the matched word using browser Selection.
     * Ported from old code's setHoverSelection — uses selectedNodes
     * to find which text node the highlight end falls in.
     */
    function highlightMatchedWord(
      startNode: Node,
      startOffset: number,
      def: WordDefinitions,
      text: string,
      selectedNodes: SelectedNode[],
    ) {
      try {
        const word = 'hangul' in def.word
          ? (def.word as { hangul: string }).hangul
          : (def.word as { simplified: string }).simplified;
        const matchLength = word.length;

        // Compute highlight length accounting for zero-width chars (old code pattern)
        let highlightLength = 0;
        for (let i = 0; i < matchLength; i++) {
          while (
            text[highlightLength] === '\u200c' ||
            text[highlightLength] === '\u200b'
          ) {
            highlightLength++;
          }
          highlightLength++;
        }

        // Find which node the end of the highlight falls in
        let endNode: Node | null = null;
        let endOffset = 0;
        let totalOffset = 0;

        for (const sn of selectedNodes) {
          const nextBoundary = totalOffset + sn.offset;
          if (nextBoundary >= highlightLength + startOffset) {
            endNode = sn.node;
            endOffset = startOffset + highlightLength - totalOffset;
            break;
          }
          totalOffset = nextBoundary;
        }

        if (!endNode) return;

        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        selection.removeAllRanges();
        selection.addRange(range);
        hoverSelectionActive = true;
        ownedRange = {
          startContainer: range.startContainer,
          startOffset: range.startOffset,
          endContainer: range.endContainer,
          endOffset: range.endOffset,
        };
      } catch {
        // Silently fail if range creation fails
      }
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
      selectedNodes: SelectedNode[];
    }

    /**
     * Find the next text node in document order after `previous`,
     * starting from `root`. Uses NodeIterator to walk the DOM tree.
     * Ported from old code's findNextTextNode.
     */
    function findNextTextNode(
      root: Node | null,
      previous: Node,
    ): Node | null {
      if (root === null) return null;

      const nodeIterator = document.createNodeIterator(
        root,
        NodeFilter.SHOW_TEXT,
        null,
      );

      let node = nodeIterator.nextNode();
      while (node !== previous) {
        node = nodeIterator.nextNode();
        if (node === null) {
          return findNextTextNode(root.parentNode, previous);
        }
      }

      const result = nodeIterator.nextNode();
      if (result !== null) {
        return result;
      } else {
        return findNextTextNode(root.parentNode, previous);
      }
    }

    /**
     * Collect forward-looking text from a text node + offset, walking
     * across sibling text nodes via NodeIterator. Returns both the
     * collected text and the list of nodes touched (for highlighting).
     * Ported from old code's getHoveredText + getTextFromSingleNode.
     */
    interface SelectedNode {
      node: Node;
      offset: number;
    }

    function getHoveredText(
      startNode: Node,
      offset: number,
      maxLength: number,
    ): { text: string; selectedNodes: SelectedNode[] } {
      const selectedNodes: SelectedNode[] = [];

      if (startNode.nodeType !== Node.TEXT_NODE) {
        return { text: '', selectedNodes };
      }

      const startData = startNode.textContent ?? '';
      const endIndex = Math.min(startData.length, offset + maxLength);
      let text = startData.substring(offset, endIndex);
      selectedNodes.push({ node: startNode, offset: endIndex });

      let nextNode: Node | null = startNode;
      while (
        text.length < maxLength &&
        (nextNode = findNextTextNode(
          nextNode.parentNode,
          nextNode,
        )) !== null
      ) {
        if (nextNode.nodeName === '#text') {
          const nodeData = nextNode.textContent ?? '';
          const nodeEnd = Math.min(maxLength - text.length, nodeData.length);
          selectedNodes.push({ node: nextNode, offset: nodeEnd });
          text += nodeData.substring(0, nodeEnd);
        }
      }

      return { text, selectedNodes };
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

      // Old code fix: if rangeOffset is past end of node, go back one character
      // This happens when hovering the right half of the last character in a node
      if (rangeOffset > 0 && rangeOffset >= textContent.length) {
        rangeOffset = textContent.length - 1;
      }

      if (rangeOffset >= textContent.length) return null;

      let charCode = textContent.codePointAt(rangeOffset);

      // Old code fix: caretRangeFromPoint shifts hitbox left by ~half a character.
      // If we didn't find a CJK char, try again at x adjusted by half char width
      if (!charCode || !isTargetLanguageChar(charCode)) {
        const parentEl = rangeNode.parentElement;
        if (parentEl) {
          const font = getComputedStyle(parentEl).font;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx && font) {
            ctx.font = font;
            const highlighted = textContent[rangeOffset] ?? '';
            const charWidth = ctx.measureText(highlighted).width;
            const adjustedX = x - charWidth / 2;

            // Retry at adjusted position
            if (document.caretRangeFromPoint) {
              const r2 = document.caretRangeFromPoint(adjustedX, y);
              if (r2) {
                const node2 = r2.startContainer;
                let offset2 = r2.startOffset;
                if (node2.nodeType === Node.TEXT_NODE) {
                  const text2 = node2.textContent ?? '';
                  if (offset2 > 0 && offset2 >= text2.length) offset2 = text2.length - 1;
                  if (offset2 < text2.length) {
                    const code2 = text2.codePointAt(offset2);
                    if (code2 && isTargetLanguageChar(code2)) {
                      rangeNode = node2;
                      rangeOffset = offset2;
                      range = r2;
                      charCode = code2;
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (!charCode || !isTargetLanguageChar(charCode)) return null;

      // Get the bounding rect of the hovered character for stable positioning
      let rect: DOMRect;
      if (range) {
        range.setStart(rangeNode, rangeOffset);
        range.setEnd(rangeNode, Math.min(rangeOffset + 1, (rangeNode.textContent ?? '').length));
        rect = range.getBoundingClientRect();
      } else {
        rect = new DOMRect(x, y, 0, 16);
      }

      // Collect up to 15 characters of forward-looking text, walking across
      // sibling text nodes. Old code used maxLength=15 in parseTextNodes.
      const { text: lookupText, selectedNodes } = getHoveredText(rangeNode, rangeOffset, 15);
      return {
        char: (rangeNode.textContent ?? '')[rangeOffset],
        text: lookupText,
        rangeNode,
        rangeOffset,
        rect,
        selectedNodes,
      };
    }

    // --- Tone coloring ---
    function getToneColor(toneIndex: number): string | null {
      if (!settings?.isColorEnabled) return null;
      const colorMode = settings?.isDarkModeOn ? 'dark' : 'light';
      const colors = settings?.toneColors?.[colorMode];
      if (!colors || toneIndex < 0 || toneIndex >= TONE_KEYS.length)
        return null;
      return colors[TONE_KEYS[toneIndex]] ?? null;
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

      // Position popup relative to hovered text, with edge flipping.
      // Render offscreen first to measure actual height, then position.
      const popupWidth = 420;
      const viewWidth = document.documentElement.clientWidth;
      const viewHeight = window.innerHeight;
      const gap = 10; // px gap between text and popup

      // Right panel detection: constrain popup width when in right panel
      let constrainedWidth = popupWidth;
      if (document.querySelector('.watch-video__hasRightPanel')) {
        const rightPanel = document.querySelector('#inRightPanel') as HTMLElement | null;
        if (rightPanel && rect.left > rightPanel.offsetLeft) {
          constrainedWidth = rightPanel.offsetWidth - 20;
        }
      }

      // Base styles (positioned offscreen for measurement)
      container.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        left: -9999px;
        top: -9999px;
        max-width: ${constrainedWidth}px;
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

      // Store the anchor rect for positioning after DOM append
      container.dataset.anchorTop = String(rect.top);
      container.dataset.anchorBottom = String(rect.bottom);
      container.dataset.anchorLeft = String(rect.left);
      container.dataset.anchorRight = String(rect.right);

      return container;
    }

    /** Position a popup element after it's been appended to the DOM,
     *  so we can measure its actual height for bottom-edge flipping. */
    function positionPopup(popup: HTMLElement) {
      const viewWidth = document.documentElement.clientWidth;
      const viewHeight = window.innerHeight;
      const gap = 10;
      const popupWidth = 420;

      const anchorTop = Number(popup.dataset.anchorTop);
      const anchorBottom = Number(popup.dataset.anchorBottom);
      const anchorLeft = Number(popup.dataset.anchorLeft);
      const anchorRight = Number(popup.dataset.anchorRight);

      const popupHeight = popup.offsetHeight;

      // Horizontal: left-align, flip to right-align if near right edge
      let leftPos: number;
      if (anchorLeft + popupWidth + 16 > viewWidth) {
        leftPos = Math.max(8, anchorRight - popupWidth);
      } else {
        leftPos = Math.max(8, anchorLeft);
      }

      // Right panel constraint
      if (document.querySelector('.watch-video__hasRightPanel')) {
        const rightPanel = document.querySelector('#inRightPanel') as HTMLElement | null;
        if (rightPanel && anchorLeft > rightPanel.offsetLeft) {
          const constrainedWidth = rightPanel.offsetWidth - 20;
          leftPos = viewWidth - constrainedWidth - 30;
        }
      }

      // Vertical: prefer below, flip above if it would go off-screen
      let topPos: number;
      if (anchorBottom + gap + popupHeight > viewHeight) {
        // Position above the text line — top of popup at (anchorTop - gap - popupHeight)
        topPos = Math.max(8, anchorTop - gap - popupHeight);
      } else {
        // Position below the text line
        topPos = anchorBottom + gap;
      }

      // Final clamp — never let the popup extend past the viewport edges
      const actualWidth = popup.offsetWidth;
      leftPos = Math.max(8, Math.min(leftPos, viewWidth - actualWidth - 8));
      topPos = Math.max(8, Math.min(topPos, viewHeight - popupHeight - 8));

      popup.style.left = `${leftPos}px`;
      popup.style.top = `${topPos}px`;
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
      if (isTranslitEnabled && def.transliteration?.pinyin) {
        const translitSpan = document.createElement('span');
        translitSpan.style.cssText = `font-size: ${Math.max(fontSize - 4, 12)}px; color: ${isDark ? '#999' : '#666'};`;
        translitSpan.textContent = def.transliteration.pinyin;
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
      const target = e.target as HTMLElement;
      const isSubtitleHover = !!target?.closest?.('.inkahsubs-word');
      if (!isSubtitleHover && !isHoverKeyPressed(e)) return;

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

      // Never run hover lookups while the user is drag-selecting text,
      // or while they hold a selection of their own (copy/paste flow) —
      // the hover highlight is rendered via the Selection API and would
      // destroy their selection.
      if (e.buttons !== 0) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        return;
      }
      const currentSel = window.getSelection();
      if (currentSel && !currentSel.isCollapsed && !hoverSelectionActive) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        return;
      }

      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      const delay = settings?.lookUpDelay ?? 20;
      const gen = ++hoverGeneration;

      hoverTimeout = setTimeout(async () => {
        // Re-check at fire time: a timer scheduled just before mousedown
        // must not run mid-drag and clobber the user's growing selection
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && !hoverSelectionActive) return;

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
          // Check pre-cache first for instant subtitle hover
          let definitions = defCache.get(result.text) ?? null;
          if (!definitions) {
            definitions = await sendToBackground<
              WordDefinitions[] | null
            >('search/text', { text: result.text });
            defCache.set(result.text, definitions);
          }

          // Invalidate stale async work: the lookup may have been in
          // flight while the user took over (mousedown bumps the
          // generation) or while they made a selection of their own —
          // rendering now would destroy their selection.
          if (gen !== hoverGeneration) return;
          const selNow = window.getSelection();
          if (selNow && !selNow.isCollapsed && !hoverSelectionActive) return;

          if (definitions && definitions.length > 0) {
            removePopup();
            lockedRangeNode = result.rangeNode;
            lockedRangeOffset = result.rangeOffset;
            lastPopup = createPopupElement(definitions, result.rect);
            // Append inside the fullscreen element when active — nodes outside
          // it don't render while fullscreen
          ((document.fullscreenElement as HTMLElement | null) ?? document.body).appendChild(lastPopup);
            positionPopup(lastPopup);

            // Highlight the matched word in the text (old code's setHoverSelection)
            highlightMatchedWord(
              result.rangeNode,
              result.rangeOffset,
              definitions[0],
              result.text,
              result.selectedNodes,
            );
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
    // The user pressing the mouse button takes ownership of the selection:
    // whatever selection exists after this point is theirs, not our
    // hover highlight (the browser collapses/replaces it on mousedown).
    // Bumping the generation also invalidates any in-flight hover lookup.
    document.addEventListener('mousedown', (e) => {
      if (!lastPopup?.contains(e.target as Node)) {
        hoverSelectionActive = false;
        ownedRange = null;
        hoverGeneration++;
      }
    });

    // --- Netflix dark mode auto-detection ---
    const isNetflix = window.location.hostname.includes('netflix.com');
    const isYouTube = window.location.hostname.includes('youtube.com');

    if (isNetflix && !(settings?.isDarkModeOn)) {
      // Auto-enable dark mode on Netflix
      settings = { ...settings, isDarkModeOn: true };
    }

    // --- Video subtitle integration (Netflix / YouTube) ---
    if (isNetflix || isYouTube) {
      const videoService = isNetflix
        ? new NetflixService()
        : new YouTubeService();

      const videoController = new VideoController(videoService, settings, {
        lookup: async (text: string) => {
          return sendToBackground<WordDefinitions[] | null>(
            'search/text',
            { text },
          );
        },
        showPopup: (definitions: WordDefinitions[], rect: DOMRect) => {
          removePopup();
          lastPopup = createPopupElement(definitions, rect);
          // Append inside the fullscreen element when active — nodes outside
          // it don't render while fullscreen
          ((document.fullscreenElement as HTMLElement | null) ?? document.body).appendChild(lastPopup);
          positionPopup(lastPopup);
        },
        removePopup,
        precacheSubtitle,
        getTransliterationForText,
      });

      videoService.init();
      videoController.start();
      activeVideoController = videoController;

      // Update controller when settings change
      chrome.storage.onChanged.addListener(() => {
        videoController.updateSettings(settings);
      });
    }

    // --- Selection mode ---
    // On text selection, look up selected CJK text
    document.addEventListener('mouseup', async () => {
      if (!(settings?.isEnabled ?? true)) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length > 50) return;

      // Check if selection contains target language characters
      const lang = settings?.targetLanguage ?? 'zh';
      const hasTargetLang = [...selectedText].some((ch) => {
        const code = ch.codePointAt(0)!;
        return lang === 'zh'
          ? isChineseCharacter(code)
          : isKoreanLetter(code);
      });
      if (!hasTargetLang) return;

      // Don't trigger if selecting inside our own popup
      const anchorNode = selection.anchorNode?.parentElement;
      if (anchorNode && lastPopup?.contains(anchorNode)) return;

      try {
        const definitions = await sendToBackground<
          WordDefinitions[] | null
        >('search/text', { text: selectedText });

        if (definitions && definitions.length > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          removePopup();
          lastPopup = createPopupElement(definitions, rect);
          // Append inside the fullscreen element when active — nodes outside
          // it don't render while fullscreen
          ((document.fullscreenElement as HTMLElement | null) ?? document.body).appendChild(lastPopup);
          positionPopup(lastPopup);
        }
      } catch {}
    });

    // --- Save word shortcut (s or b key while popup is visible) ---
    document.addEventListener('keydown', async (e) => {
      if (e.key !== 's' && e.key !== 'b') return;
      if (!lastPopup) return;
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      // Save the first definition's word
      // The popup data is not stored, so we re-lookup from the locked range
      // This is a basic implementation — sends the currently hovered text
      if (lockedRangeNode && lockedRangeOffset >= 0) {
        const textContent = lockedRangeNode.textContent ?? '';
        const lookupText = textContent.substring(
          lockedRangeOffset,
          lockedRangeOffset + 12,
        );

        const lang = settings?.targetLanguage ?? 'zh';
        const script =
          lang === 'zh'
            ? (settings?.characterType?.startsWith('traditional')
                ? 'traditional'
                : 'simplified')
            : 'hangul';

        try {
          const definitions = await sendToBackground<
            WordDefinitions[] | null
          >('search/text', { text: lookupText });

          if (definitions && definitions.length > 0) {
            const def = definitions[0];
            const word =
              'hangul' in def.word
                ? (def.word as { hangul: string }).hangul
                : (def.word as Record<string, string>)[script];

            // Detect source type
            let sourceType: SourceOptions = 'others';
            if (window.location.hostname.includes('netflix.com'))
              sourceType = 'netflix';
            else if (window.location.hostname.includes('youtube.com'))
              sourceType = 'youtube';

            await sendToBackground('words/toggleSave', {
              word,
              language: lang,
              script,
              definitions: def.definitions,
              transliteration: def.transliteration?.pinyin ?? '',
              writtenAlternatives: def.word,
              sourceUrl: window.location.href,
            });
          }
        } catch {}
      }
    });
  },
});
