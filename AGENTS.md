# Agent Guidelines

This is the **canonical reference** for all AI agents working in this repository. If you're Claude, Gemini, GPT, or any other model: this file is for you.

## Project Overview

Inkah is an open-source Chinese & Korean pop-up dictionary. The repo is an npm workspaces monorepo:

- **`packages/extension`** — Chrome/Firefox browser extension (WXT + Manifest V3 + Dexie 4)
- **`packages/web`** — Marketing site and docs (Next.js, static export)

## Architecture

```
packages/
  extension/
    src/
      entrypoints/
        background.ts        # MV3 service worker
        content.ts           # Content script (injected on all pages)
        popup/               # Browser action popup (settings)
      data/
        schema.ts            # Dexie schema + cache warming
        dict-cache.ts        # In-memory read-through cache
        import-dictionaries.ts  # JSON → IndexedDB import pipeline
        settings.ts          # chrome.storage settings CRUD
        words.ts             # Word storage (Dexie)
        sentences.ts         # Sentence storage (Dexie)
      search/
        search-chinese.ts    # Chinese lookup (cedict, greedy longest-match)
        search-korean.ts     # Korean lookup (kedict + vicon + lemmas)
        search-composer.ts   # Language dispatcher
      messaging/
        handler.ts           # Service worker message router
        client.ts            # Content script → background helper
        types.ts             # Message type definitions
      lib/                   # Pure utility functions (parse, detect, convert)
      test/                  # Unit tests
    e2e/                     # Playwright E2E tests
  web/
    src/app/                 # Next.js App Router pages
```

### Key Design Decisions

1. **Dictionaries in IndexedDB, not memory.** MV3 service workers are ephemeral — we can't hold 110MB in memory like MV2's persistent background page. Dexie 4 tables with an in-memory read-through cache (`data/dict-cache.ts`) give us sub-ms warm lookups.

2. **Simple message passing.** Content scripts communicate with the service worker via `chrome.runtime.sendMessage`. No GraphQL, no port-based pub/sub — just typed messages dispatched in `messaging/handler.ts`.

3. **Service worker keepalive.** Content scripts maintain a `keepalive` port connection that keeps the service worker (and its in-memory cache) alive as long as any tab is open.

4. **Preferred language imports first.** On install, the user's saved language is imported before the other, so search works within seconds.

## Coding Conventions

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full reference on coding style, git conventions, and PR process. Key points:

- Strict TypeScript, avoid `any`
- Angular commit convention: `feat(scope): description`
- Do not squash commits on merge
- Co-locate tests in `packages/extension/src/test/`

## Development Commands

```bash
# Root (delegates to packages)
npm install            # Install all workspaces
npm run dev            # Extension dev server with hot reload
npm run dev:web        # Next.js dev server
npm run build          # Extension production build (Chrome MV3)
npm run build:web      # Next.js static export
npm run build:all      # Build everything
npm test               # Extension unit tests (Vitest)
npm run test:e2e       # Extension E2E tests (Playwright)
npm run typecheck      # Extension type checking

# Package-scoped
npm -w @inkah/extension run build:firefox   # Firefox build
npm -w @inkah/web run dev                   # Web dev server
```

## Testing

### Unit Tests (Vitest)

Tests live in `packages/extension/src/test/`. They use `fake-indexeddb` for Dexie operations and mock `chrome.*` APIs.

```bash
npm test                          # Run all
npm -w @inkah/extension exec vitest run src/test/search-chinese.test.ts  # Run specific
```

### E2E Tests (Playwright)

Tests live in `packages/extension/e2e/`. They build the extension, launch headless Chrome with `--headless=new` (supports extensions), and test the full pipeline.

```bash
npm run build && npm run test:e2e
```

## Dictionary Format

**Chinese (CC-CEDICT):** Each entry is `key → "traditional simplified [pinyin] /def1/def2/"`. Stored in the `cedict` Dexie table.

**Korean (KEDict):** Each entry is `key → ["hangul [romanization] /definition/\n", ...]`. Stored in `kedict`. Korean also uses:
- `vicon` table — inflected/conjugated forms (707K entries)
- `lemmas` table — maps conjugated forms back to base lemmas

## Search Algorithm

Both Chinese and Korean use **greedy longest-match-first tokenization**:
1. From the current cursor position, try substrings of increasing length (1 to max)
2. Batch-lookup all candidates via `bulkGet` (single IndexedDB transaction)
3. Take the longest match, advance cursor, repeat
4. Results are returned longest-first so the best match is always first

Max word lengths: Chinese = 8 characters, Korean = 12 characters. Input capped at 250 characters.

## Common Tasks

### Adding a New Language

1. Add language config to `packages/extension/src/lib/available-languages.ts`
2. Create `search-<lang>.ts` in `packages/extension/src/search/` with the lookup algorithm
3. Add Unicode detection function to `packages/extension/src/lib/parse-<lang>.ts`
4. Register in `search-composer.ts`
5. Add Dexie table in `data/schema.ts` and import logic in `data/import-dictionaries.ts`
6. Add cache functions in `data/dict-cache.ts`
7. Add tests

### Adding a New Message Type

1. Add the type to `messaging/types.ts`
2. Add the handler case in `messaging/handler.ts`
3. Call from content script or popup via `sendToBackground('your/type', payload)`
