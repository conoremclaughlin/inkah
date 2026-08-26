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
  isDarkModeOn: false,
};

const WO_DEFINITION = {
  word: { traditional: '我', simplified: '我' },
  transliteration: { pinyin: 'wo3' },
  definitions: ['I; me'],
} as unknown as WordDefinitions;

let searchResult: WordDefinitions[] | null = null;
// When set, search/text responses are held until this promise resolves —
// used to simulate a lookup already in flight when the user starts selecting
let searchGate: Promise<void> | null = null;

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
          if (searchGate) await searchGate;
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
  searchGate = null;
  SETTINGS.hoverKey = 'noKey';
  SETTINGS.targetLanguage = 'zh';
  SETTINGS.isDarkModeOn = false;
  delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
  document.getElementById('inkah-popup')?.remove();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '<p id="text">The quick brown fox jumps</p>';
});

/** Point the caret hit-test at the given node/offset (null = no hit). */
function stubCaretHit(getRange: () => Range | null) {
  (document as unknown as Record<string, unknown>).caretRangeFromPoint =
    getRange;
}

function caretAt(node: Node, offset: number): () => Range {
  return () => {
    const r = document.createRange();
    r.setStart(node, offset);
    r.setEnd(node, offset);
    return r;
  };
}

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

  it('does not clear a user selection when the popup is dismissed by click or Escape', async () => {
    const sel = selectText(textNode(), 0, 3);

    // click → handleClick → removePopup; must leave the user selection alone
    mouse('click');
    await settle();
    expect(sel.isCollapsed).toBe(false);

    // Escape → handleKeyDown → removePopup; same rule
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('The');
  });

  it('does not replace a held user selection even when hovering matchable target text', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    // The user holds their own selection; the hover lookup WOULD succeed
    const sel = selectText(zhNode, 2, 5);
    expect(sel.toString()).toBe('要汪星');

    mouse('mousemove', { buttons: 0 });
    await settle();

    // No popup, and the selection was not replaced by our '我' highlight
    expect(document.getElementById('inkah-popup')).toBeNull();
    expect(sel.toString()).toBe('要汪星');
  });

  it('a hover timer scheduled before the user selects must not fire into their selection', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    // Timer is scheduled with no selection present...
    mouse('mousemove', { buttons: 0 });
    // ...and the user selects text in the same tick, before it fires
    const sel = selectText(zhNode, 2, 5);
    await settle();

    expect(document.getElementById('inkah-popup')).toBeNull();
    expect(sel.toString()).toBe('要汪星');
  });

  it('keeps the selection AND shows the popup when the user selects target text (selection mode)', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];

    const sel = selectText(zhNode, 0, 3);
    mouse('mouseup');
    await settle();

    // Selection-mode popup appears without eating the selection
    expect(document.getElementById('inkah-popup')).not.toBeNull();
    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('我只要');
  });

  it('hands selection ownership back to the user on mousedown after our highlight', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    // Our hover highlight becomes active
    mouse('mousemove', { buttons: 0 });
    await settle();
    expect(window.getSelection()!.toString()).toBe('我');

    // The user mousedowns and drag-selects their own text
    mouse('mousedown', { buttons: 1 });
    const sel = selectText(zhNode, 2, 5);
    mouse('mouseup');
    await settle();

    // Cursor then moves around → the selection now belongs to the user
    // and must survive any popup cleanup (without the mousedown handoff,
    // the stale ownership flag would let removePopup clear it)
    stubCaretHit(() => null);
    mouse('mousemove', { buttons: 0, clientX: 300 });
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('要汪星');
  });

  it('respects a configured hover key: no lookup without it, lookup with it', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));
    SETTINGS.hoverKey = 'ctrl';

    mouse('mousemove', { buttons: 0 });
    await settle();
    expect(document.getElementById('inkah-popup')).toBeNull();

    mouse('mousemove', { buttons: 0, ctrlKey: true });
    await settle();
    expect(document.getElementById('inkah-popup')).not.toBeNull();
    expect(window.getSelection()!.toString()).toBe('我');
  });

  it('a lookup already in flight when the user selects must not render into their selection', async () => {
    // Unique text: the content script's defCache persists across tests, and
    // a cache hit would skip the awaited lookup this test needs to gate
    document.body.innerHTML = '<p id="text">看电影很有趣</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    // Hold the search response so the lookup sits mid-await
    let release!: () => void;
    searchGate = new Promise<void>((r) => {
      release = r;
    });

    mouse('mousemove', { buttons: 0 });
    await settle(10); // hover timer fired; lookup is awaiting the gate

    // The user takes over and selects while the lookup is in flight
    mouse('mousedown', { buttons: 1 });
    const sel = selectText(zhNode, 2, 5);

    release();
    await settle();

    // The stale lookup must not render a popup or replace the selection
    expect(document.getElementById('inkah-popup')).toBeNull();
    expect(sel.toString()).toBe('影很有');
  });

  it('does not clear a selection the user extended via keyboard (Cmd+A / Shift+Arrow)', async () => {
    document.body.innerHTML = '<p id="text">我只要汪星人</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    // Our hover highlight becomes active
    mouse('mousemove', { buttons: 0 });
    await settle();
    const sel = window.getSelection()!;
    expect(sel.toString()).toBe('我');

    // The user replaces it with a keyboard selection — no mouse involved,
    // so only exact-range verification can detect the ownership change
    selectText(zhNode, 0, 6);

    // Popup dismissal must leave the user's keyboard selection intact
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle();

    expect(document.getElementById('inkah-popup')).toBeNull();
    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('我只要汪星人');
  });

  it('a matchable hover after keyboard extension must not replace the user selection', async () => {
    // Lumen's repro: own highlight 天 → keyboard-extend to 天地玄黃 →
    // hover the next matchable target. The stale ownership flag must not
    // let the new lookup's highlightMatchedWord replace the user's range.
    document.body.innerHTML = '<p id="text">天地玄黃宇宙</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    mouse('mousemove', { buttons: 0 });
    await settle();
    const sel = window.getSelection()!;
    expect(sel.toString()).toBe('天'); // our highlight

    // Keyboard-extend (Shift+Arrow equivalent) — the selection is theirs now
    selectText(zhNode, 0, 4);

    // Hover a different matchable character
    stubCaretHit(caretAt(zhNode, 1));
    mouse('mousemove', { buttons: 0, clientX: 70 });
    await settle();

    expect(sel.isCollapsed).toBe(false);
    expect(sel.toString()).toBe('天地玄黃');
  });

  it('korean headword carries an explicit light color in dark mode (host CSS cannot darken it)', async () => {
    SETTINGS.targetLanguage = 'ko';
    SETTINGS.isDarkModeOn = true;
    document.body.innerHTML = '<p id="text">사람이다</p>';
    const koNode = textNode();
    searchResult = [
      {
        word: { hangul: '사람' },
        transliteration: { pinyin: 'saram' },
        definitions: ['person'],
      } as unknown as WordDefinitions,
    ];
    stubCaretHit(caretAt(koNode, 0));

    mouse('mousemove', { buttons: 0 });
    await settle();

    const popup = document.getElementById('inkah-popup');
    expect(popup).not.toBeNull();
    const headword = [...popup!.querySelectorAll('span')].find(
      (s) => s.style.fontWeight === 'bold',
    )!;
    expect(headword.textContent).toBe('사람');
    // Inline color must be set — inherited color loses to host-page span
    // rules, which rendered the hangul dark-on-dark in dark mode
    expect(['#e0e0e0', 'rgb(224, 224, 224)']).toContain(headword.style.color);
  });

  it('chinese headword carries an explicit color when tone coloring is off', async () => {
    SETTINGS.isDarkModeOn = true;
    document.body.innerHTML = '<p id="text">日月盈昃</p>';
    const zhNode = textNode();
    searchResult = [WO_DEFINITION];
    stubCaretHit(caretAt(zhNode, 0));

    mouse('mousemove', { buttons: 0 });
    await settle();

    const popup = document.getElementById('inkah-popup');
    expect(popup).not.toBeNull();
    const headword = [...popup!.querySelectorAll('span')].find(
      (s) => s.style.fontWeight === 'bold',
    )!;
    expect(['#e0e0e0', 'rgb(224, 224, 224)']).toContain(headword.style.color);
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
