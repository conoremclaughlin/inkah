export interface User {
  anonymousId?: string;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function userGet(): Promise<User> {
  const result = await chrome.storage.local.get(['user']);
  return result?.user ?? {};
}

export async function userCreate(): Promise<User> {
  const dateTime = new Date();
  const anonymousId = crypto.randomUUID();
  const record: User = {
    anonymousId,
    createdAt: dateTime,
    updatedAt: dateTime,
  };

  await chrome.storage.local.set({ user: record });
  return record;
}
