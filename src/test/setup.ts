import 'fake-indexeddb/auto';

// Mock chrome APIs for testing
const storage: Record<string, unknown> = {};

const chromeStorageMock = {
  local: {
    get: async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in storage) {
          result[key] = storage[key];
        }
      }
      return result;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    },
  },
  onChanged: {
    addListener: () => {},
    removeListener: () => {},
  },
};

const chromeRuntimeMock = {
  getURL: (path: string) => `chrome-extension://test-id${path}`,
  sendMessage: async () => ({}),
  onMessage: {
    addListener: () => {},
    removeListener: () => {},
  },
  onInstalled: {
    addListener: () => {},
  },
};

const chromeActionMock = {
  setBadgeText: async () => {},
  setBadgeBackgroundColor: async () => {},
};

// @ts-expect-error - mock
globalThis.chrome = {
  storage: chromeStorageMock,
  runtime: chromeRuntimeMock,
  action: chromeActionMock,
};
