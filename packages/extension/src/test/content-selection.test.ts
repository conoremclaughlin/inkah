/**
 * @vitest-environment happy-dom
 * @vitest-environment-options {"url": "https://example.com/article"}
 *
 * Regression tests: the hover highlight is rendered via the browser
 * Selection API, and v2.0.0 shipped a bug where removePopup() cleared ANY
 * non-collapsed selection on every mousemove — making it impossible to
 * select text for copy/paste on any page while Inkah was enabled.
 *
 * These pin the ownership rules:
 * 1. A selection the user made must survive mousemoves over non-target text
 * 2. A selection must survive while drag-selecting (mouse button held)
 * 3. removePopup (e.g. via click) must not clear a user-made selection
 * 4. Our own hover highlight must still be created and cleaned up
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const SETTINGS = {
  id: 1,
  targetLanguage: 'zh',
  hoverKey: 'noKey',
  isEnabled: true,
  lookUpDelay: 0,
};

const WO_DEFINITION = {
  word: { traditional: '我', simplified: '我' },
  transliteration: { pinyin: 'wo3' },
  definitions: ['I; me'],
} as unknown as WordDefinitions;

let searchResult: WordDefinitions[] | null = null;

/** Let the hover setTimeout(0) + async lookup settle. */
async function settle(ms = 40) {
  await new Promise((r) => setTimeout(r, ms));
}

function selectText(node: Node, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

function mouse(type: string, init: MouseEventInit = {}) {
  // Dispatch on the paragraph so e.target is an Element (as in a real
  // browser) and the event bubbles up to the document-level listeners
  document.getElementById('text')!.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: 50, clientY: 50, ...init }),
  );
}

beforeAll(async () => {
  // content.ts is a WXT entrypoint — stub the auto-imported global and
  // run its main() directly against the happy-dom document
  (globalThis as unknown as Record<string, unknown>).defineContentScript = (
    def: { main: () => Promise<void> },
  ) => def;

  (chrome.runtime as unknown as Record<string, unknown>).connect = () => ({
    onDisconnect: { addListener: () => {} },
  });
  (chrome.runtime as unknown as Record<string, unknown>).sendMessage = vi.fn(
    async (message: { type: string }) => {
      switch (message.type) {
        case 'settings/get':
          return { data: SETTINGS };
        case 'search/text':
          return { data: searchResult };
        case 'search/batch':
          return { data: {} };
        default:
          return { data: null };
      }
    },
  );

  const mod = await import('../entrypoints/content');
  await (mod.default as unknown as { main: () => Promise<void> }).main();
});

beforeEach(() => {
  searchResult = null;
  delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
  document.getElementById('inkah-popup')?.remove();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '<p id="text">The quick brown fox jumps</p>';
});

function textNode(): Node {
  return document.getElementById('text')!.firstChild!;
}

describe('user text selection survives Inkah hover (copy/paste regression)', () => {
  it('keeps a finished selection intact across mousemoves over non-target text', async () => {
    const sel = selectText(textNode(), 0, 9);
    expect(sel.toString()).toBe('The quick');

    mouse('mousemove', { buttons: 0 });
    await settle();
    mouse('mousemove', { buttons: 0, clientX: 80 });
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('The quick');
  });

  it('does not destroy the selection mid-drag (mouse button held)', async () => {
    const sel = selectText(textNode(), 4, 15);

    mouse('mousemove', { buttons: 1 });
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('quick brown');
  });

  it('does not clear a user selection when the popup is dismissed by click', async () => {
    const sel = selectText(textNode(), 0, 3);

    // click → handleClick → removePopup; must leave the user selection alone
    mouse('click');
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('The');
  });

  it('still creates and cleans up its OWN hover highlight on target text', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];

    // Simulate the caret hit-test resolving to the first CJK character,
    // then to nothing (cursor moved off the text)
    let hit = true;
    (document as unknown as Record<string, unknown>).caretRangeFromPoint =
      () => {
        if (!hit) return null;
        const r = document.createRange();
        r.setStart(zhNode, 0);
        r.setEnd(zhNode, 0);
        return r;
      };

    mouse('mousemove', { buttons: 0 });
    await settle();

    // Popup shown and OUR highlight selects the matched word
    expect(document.getElementById('inkah-popup')).not.toBeNull();
    const sel = window.getSelection()!;
    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('我');

    // Cursor moves off the text → popup goes away AND our highlight is
    // cleared (this is the path that must NOT fire for user selections)
    hit = false;
    mouse('mousemove', { buttons: 0, clientX: 200 });
    await settle();

    expect(document.getElementById('inkah-popup')).toBeNull();
    expect(sel.isCollapsed).toBe(true);
  });
});
