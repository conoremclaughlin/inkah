export type MessageType =
  | 'settings/get'
  | 'settings/update'
  | 'words/query'
  | 'words/paginated'
  | 'words/delete'
  | 'words/toggleSave'
  | 'sentences/query'
  | 'sentences/paginated'
  | 'sentences/delete'
  | 'sentences/toggleSave'
  | 'tags/query'
  | 'user/me'
  | 'user/create'
  | 'search/text'
  | 'search/batch'
  | 'search/tokenize';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface ExtensionResponse<T = unknown> {
  data?: T;
  error?: string;
}
