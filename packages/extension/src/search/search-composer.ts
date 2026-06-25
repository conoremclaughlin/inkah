import { SearchChineseUseCase } from './search-chinese';
import { SearchKoreanUseCase } from './search-korean';

export class SearchComposer {
  searchChinese: SearchChineseUseCase;
  searchKorean: SearchKoreanUseCase;
  private searchUseCase: SearchChineseUseCase | SearchKoreanUseCase;

  constructor() {
    this.searchChinese = new SearchChineseUseCase();
    this.searchKorean = new SearchKoreanUseCase();
    this.searchUseCase = this.searchChinese;
  }

  async init(): Promise<void> {
    const result = await chrome.storage.local.get(['targetLanguage']);
    const targetLanguage = result.targetLanguage ?? 'zh';
    this.setSearchUseCase(targetLanguage);

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.targetLanguage) {
        this.setSearchUseCase(changes.targetLanguage.newValue);
      }
    });
  }

  setSearchUseCase(targetLanguage: SupportedLanguages): void {
    switch (targetLanguage) {
      case 'ko':
        this.searchUseCase = this.searchKorean;
        break;
      case 'zh':
      default:
        this.searchUseCase = this.searchChinese;
        break;
    }
  }

  async handleSearchText(payload: {
    text: string;
    language?: SupportedLanguages;
  }): Promise<WordDefinitions[] | null> {
    if (payload.language) {
      switch (payload.language) {
        case 'ko':
          return this.searchKorean.search(payload.text);
        case 'zh':
          return this.searchChinese.search(payload.text);
      }
    }
    return this.searchUseCase.search(payload.text);
  }

  /** Batch lookup: run multiple search/text calls in one round-trip */
  async handleSearchBatch(payload: {
    texts: string[];
  }): Promise<Record<string, WordDefinitions[] | null>> {
    const results: Record<string, WordDefinitions[] | null> = {};
    // Run all lookups in parallel within the service worker
    await Promise.all(
      payload.texts.map(async (text) => {
        results[text] = await this.searchUseCase.search(text);
      }),
    );
    return results;
  }

  async handleTokenize(payload: {
    text: string;
  }): Promise<WordDefinitions[] | null> {
    return this.searchUseCase.parseTokens(payload.text);
  }
}
