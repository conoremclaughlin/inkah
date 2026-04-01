import type { ExtensionMessage, ExtensionResponse, MessageType } from './types';

export async function sendToBackground<T = unknown>(
  type: MessageType,
  payload?: unknown,
): Promise<T> {
  const message: ExtensionMessage = { type, payload };
  const response: ExtensionResponse<T> = await chrome.runtime.sendMessage(message);

  if (response?.error) {
    throw new Error(response.error);
  }

  return response?.data as T;
}
