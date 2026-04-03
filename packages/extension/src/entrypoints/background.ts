import { SearchComposer } from '../search/search-composer';
import { createMessageHandler } from '../messaging/handler';
import { importDictionariesIfNeeded } from '../data/import-dictionaries';
import { warmDictionaryCache } from '../data/schema';
import { userGet, userCreate } from '../data/user';

export default defineBackground(() => {
  const search = new SearchComposer();
  const handleMessage = createMessageHandler(search);

  // Initialize search composer
  search.init();

  // On install: import dictionaries and create anonymous user
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[inkah] Extension installed/updated:', details.reason);

    const user = await userGet();
    if (!user.anonymousId) {
      await userCreate();
    }

    try {
      await importDictionariesIfNeeded();
    } catch (err) {
      console.error('[inkah] Dictionary import failed:', err);
    }
  });

  // Warm the IndexedDB cache on every service worker startup
  // (service workers are ephemeral in MV3 — this runs each time one spins up)
  warmDictionaryCache().catch((err) => {
    console.warn('[inkah] Cache warm failed (dicts may not be imported yet):', err);
  });

  // Message handler for content scripts and popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  });

  // Keepalive: maintain port connections from content scripts.
  // While any port is open, the service worker stays alive.
  const activePorts = new Set<chrome.runtime.Port>();
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepalive') {
      activePorts.add(port);
      port.onDisconnect.addListener(() => activePorts.delete(port));
    }
  });

  // Badge management — show "On"/"Off" on the extension icon
  const updateBadge = async (isEnabled?: boolean) => {
    if (isEnabled === undefined) {
      const result = await chrome.storage.local.get(['isEnabled']);
      isEnabled = result.isEnabled ?? true;
    }
    await chrome.action.setBadgeText({ text: isEnabled ? 'On' : 'Off' });
    await chrome.action.setBadgeBackgroundColor({
      color: isEnabled ? '#177ddc' : '#999',
    });
  };

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.isEnabled) {
      updateBadge(changes.isEnabled.newValue);
    }
  });

  updateBadge();

  console.log('[inkah] Background service worker initialized');
});
