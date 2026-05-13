import type { ExtensionMessage, ExtensionResponse } from './types';
import { settingsGet, settingsUpdate } from '../data/settings';
import {
  wordsQuery,
  paginatedWords,
  wordsDelete,
  wordsToggleSave,
} from '../data/words';
import {
  sentencesQuery,
  paginatedSentences,
  sentencesDelete,
  sentencesToggleSave,
} from '../data/sentences';
import { tagsQuery } from '../data/tags';
import { userGet, userCreate } from '../data/user';
import type { SearchComposer } from '../search/search-composer';

export function createMessageHandler(search: SearchComposer) {
  return async function handleMessage(
    message: ExtensionMessage,
  ): Promise<ExtensionResponse> {
    try {
      const { type, payload } = message;
      let data: unknown;

      switch (type) {
        case 'settings/get':
          data = await settingsGet();
          break;
        case 'settings/update':
          data = await settingsUpdate(payload as Parameters<typeof settingsUpdate>[0]);
          break;
        case 'words/query': {
          const p = payload as { words: string[]; language?: string };
          data = await wordsQuery(p.words, p.language);
          break;
        }
        case 'words/paginated': {
          const p = payload as {
            language: string;
            pageSize?: number;
            pageNum?: number;
          };
          data = await paginatedWords(p.language, p.pageSize, p.pageNum);
          break;
        }
        case 'words/delete':
          data = await wordsDelete(payload as Parameters<typeof wordsDelete>[0]);
          break;
        case 'words/toggleSave':
          data = await wordsToggleSave(
            payload as Parameters<typeof wordsToggleSave>[0],
            search,
          );
          break;
        case 'sentences/query': {
          const p = payload as { sentences: string[]; language?: string };
          data = await sentencesQuery(p.sentences, p.language);
          break;
        }
        case 'sentences/paginated': {
          const p = payload as {
            language: string;
            pageSize?: number;
            pageNum?: number;
            sourceType?: SourceQueryOptions;
          };
          data = await paginatedSentences(
            p.language,
            p.pageSize,
            p.pageNum,
            p.sourceType,
          );
          break;
        }
        case 'sentences/delete':
          data = await sentencesDelete(
            payload as Parameters<typeof sentencesDelete>[0],
          );
          break;
        case 'sentences/toggleSave':
          data = await sentencesToggleSave(
            payload as Parameters<typeof sentencesToggleSave>[0],
          );
          break;
        case 'tags/query': {
          const p = payload as { word: string };
          data = await tagsQuery(p.word);
          break;
        }
        case 'user/me':
          data = await userGet();
          break;
        case 'user/create':
          data = await userCreate();
          break;
        case 'search/text':
          data = await search.handleSearchText(
            payload as { text: string; language?: SupportedLanguages },
          );
          break;
        case 'search/batch':
          data = await search.handleSearchBatch(
            payload as { texts: string[] },
          );
          break;
        case 'search/tokenize':
          data = await search.handleTokenize(
            payload as { text: string },
          );
          break;
        default:
          return { error: `Unknown message type: ${type}` };
      }

      return { data };
    } catch (err) {
      console.error('[inkah] Message handler error:', err);
      return { error: String(err) };
    }
  };
}
