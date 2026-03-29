# Inkah

Chinese & Korean pop-up dictionary browser extension. Hover over characters on any webpage to see definitions, transliterations, and more.

## Features

- **Pop-up dictionary** — hover over Chinese or Korean text to see definitions, pinyin/romanization, and tone information
- **Word saving** — save words to a local database for later review
- **Greedy longest-match tokenization** — intelligently segments text to find the longest matching dictionary entries
- **Korean lemma resolution** — looks up conjugated Korean forms via lemma tables and the Vicon inflection dictionary
- **Tone coloring** — configurable tone color schemes for Chinese pinyin (Pleco, MDBG, Hanping, Nathan)
- **Zhuyin/Bopomofo** — optional Zhuyin display for Chinese
- **Dark mode** — full dark mode support for the popup dictionary
- **Instant language swap** — switch between Chinese and Korean without reloading

## Supported Languages

| Language | Dictionary | Entries | Features |
|----------|-----------|---------|----------|
| Chinese (zh) | CC-CEDICT | 191K | Pinyin, Zhuyin, tone colors, traditional + simplified |
| Korean (ko) | KEDict + Vicon | 1M+ | Revised Romanization, lemma resolution, conjugation lookup |

## Install

```bash
npm install
```

## Development

```bash
# Start dev server with hot reload (opens Chrome with extension loaded)
npm run dev

# Build for production
npm run build

# Build for Firefox
npm run build:firefox
```

### Load in Chrome manually

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `.output/chrome-mv3` directory

## Testing

```bash
# Unit tests (61 tests)
npm test

# E2E tests (headless Chrome with extension loaded)
npm run test:e2e

# Type checking
npm run typecheck
```

## Architecture

Built with [WXT](https://wxt.dev/) (Vite-based extension framework) targeting **Manifest V3**.

```
src/
  entrypoints/
    background.ts        # Service worker — message handler, dict import, keepalive
    content.ts           # Content script — hover detection, popup rendering
    popup/               # Browser action popup — settings panel
  data/
    schema.ts            # Dexie 4 IndexedDB schema + cache warming
    dict-cache.ts        # In-memory read-through cache for dictionary lookups
    import-dictionaries.ts  # One-time JSON → IndexedDB batch import
    settings.ts          # Settings CRUD via chrome.storage
    words.ts             # Word save/delete/query via Dexie
    sentences.ts         # Sentence save/delete/query via Dexie
  search/
    search-chinese.ts    # Greedy longest-match with bulkGet batching
    search-korean.ts     # 3-source lookup (main + vicon + lemma) with batching
    search-composer.ts   # Language-aware search dispatcher
  messaging/
    handler.ts           # Background message router
    client.ts            # Content script sendToBackground helper
    types.ts             # Message type definitions
  lib/
    parse-chinese.ts     # Unicode detection, pinyin ↔ tone conversion, zhuyin
    parse-korean.ts      # Hangul detection, Revised Romanization
    parse-language.ts    # Language detection, tokenization helpers
    available-languages.ts  # Language config and tone presets
```

### Dictionary Storage

Dictionaries are stored in IndexedDB via Dexie 4 (not in memory). On first install, JSON files are batch-imported into indexed tables. An in-memory read-through cache ensures sub-millisecond repeat lookups. The service worker stays alive via keepalive port connections from content scripts.

| Metric | Value |
|--------|-------|
| First install import | ~10s (1.3M entries) |
| Cold lookup (first access) | ~300ms |
| Warm lookup (cached) | <1ms |
| Language swap | 1-3ms |
| Build time | ~1.5s |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on commits, branching, and code style.

## License

[MIT](./LICENSE)
