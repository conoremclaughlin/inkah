import React, { useEffect, useState, useCallback } from 'react';
import type { PaginatedWords } from '../../data/words';
import type { PaginatedSentences } from '../../data/sentences';

type Tab = 'words' | 'sentences';

export default function BookmarksApp() {
  const [tab, setTab] = useState<Tab>('words');
  const [language, setLanguage] = useState<SupportedLanguages>('zh');
  const [wordsData, setWordsData] = useState<PaginatedWords | null>(null);
  const [sentencesData, setSentencesData] = useState<PaginatedSentences | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      if (tab === 'words') {
        const res = await chrome.runtime.sendMessage({
          type: 'words/paginated',
          payload: { language, pageSize: 50, pageNum: page },
        });
        if (res?.data) setWordsData(res.data);
      } else {
        const res = await chrome.runtime.sendMessage({
          type: 'sentences/paginated',
          payload: { language, pageSize: 50, pageNum: page, sourceType: 'all' },
        });
        if (res?.data) setSentencesData(res.data);
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  }, [tab, language, page]);

  useEffect(() => { load(); }, [load]);

  const deleteWord = async (word: string) => {
    await chrome.runtime.sendMessage({
      type: 'words/delete',
      payload: { word, language },
    });
    load();
  };

  const deleteSentence = async (sentence: string) => {
    await chrome.runtime.sendMessage({
      type: 'sentences/delete',
      payload: { sentence, language },
    });
    load();
  };

  const exportCsv = () => {
    if (tab === 'words' && wordsData) {
      const bom = '\uFEFF';
      const header = 'Word,Variations,Transliteration,Definitions,Created\n';
      const rows = wordsData.items.map((w) => {
        const alts = w.writtenAlternatives
          ? Object.values(w.writtenAlternatives).join(' / ')
          : '';
        const defs = (w.definitions ?? []).join('; ');
        const date = w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '';
        return `"${w.word}","${alts}","${w.transliteration ?? ''}","${defs}","${date}"`;
      });
      downloadCsv(bom + header + rows.join('\n'), `inkah-${language}-words.csv`);
    } else if (tab === 'sentences' && sentencesData) {
      const bom = '\uFEFF';
      const header = 'Sentence,Definitions,Source,Created\n';
      const rows = sentencesData.items.map((s) => {
        const defs = (s.definitions ?? []).join('; ');
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
        return `"${s.sentence}","${defs}","${s.sourceUrl ?? ''}","${date}"`;
      });
      downloadCsv(bom + header + rows.join('\n'), `inkah-${language}-sentences.csv`);
    }
  };

  const wordCount = wordsData?.pagination.total ?? 0;
  const sentenceCount = sentencesData?.pagination.total ?? 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Inkah Bookmarks</h1>
          <button onClick={() => window.close()} style={styles.closeBtn}>X</button>
        </div>

        <p style={styles.hint}>
          Press 's' or 'b' while hovering a word to save. Click the star next to
          sentences or words to also save.
        </p>

        {/* Tabs */}
        <div style={styles.tabRow}>
          <div style={{ display: 'flex', gap: 16 }}>
            <TabButton label="Words" active={tab === 'words'} onClick={() => { setTab('words'); setPage(1); }} />
            <TabButton label="Sentences" active={tab === 'sentences'} onClick={() => { setTab('sentences'); setPage(1); }} />
          </div>
          <span style={styles.countText}>
            {wordCount} Words / {sentenceCount} Sentences Bookmarked
          </span>
        </div>

        {/* Controls */}
        <div style={styles.controlRow}>
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value as SupportedLanguages); setPage(1); }}
            style={styles.select}
          >
            <option value="zh">Chinese</option>
            <option value="ko">Korean</option>
          </select>
          <button onClick={exportCsv} style={styles.exportBtn}>Export</button>
        </div>

        {/* Table */}
        {tab === 'words' ? (
          <WordsTable data={wordsData} onDelete={deleteWord} />
        ) : (
          <SentencesTable data={sentencesData} onDelete={deleteSentence} />
        )}

        {/* Pagination */}
        {((tab === 'words' && wordsData?.pagination.hasMore) ||
          (tab === 'sentences' && sentencesData?.pagination.hasMore)) && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <button onClick={() => setPage((p) => p + 1)} style={styles.loadMoreBtn}>
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WordsTable({ data, onDelete }: { data: PaginatedWords | null; onDelete: (w: string) => void }) {
  if (!data || data.items.length === 0) {
    return <EmptyState />;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Word</th>
          <th style={styles.th}>Variations</th>
          <th style={styles.th}>Transliteration</th>
          <th style={styles.th}>Definitions</th>
          <th style={styles.th}>Added</th>
          <th style={styles.th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((w) => (
          <tr key={w.word + w.language} style={styles.tr}>
            <td style={styles.td}>{w.word}</td>
            <td style={styles.td}>
              {w.writtenAlternatives ? Object.values(w.writtenAlternatives).join(' / ') : ''}
            </td>
            <td style={styles.td}>{w.transliteration ?? ''}</td>
            <td style={styles.td}>{(w.definitions ?? []).join('; ')}</td>
            <td style={styles.td}>
              {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : ''}
            </td>
            <td style={styles.td}>
              <button onClick={() => onDelete(w.word)} style={styles.deleteBtn}>Remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SentencesTable({ data, onDelete }: { data: PaginatedSentences | null; onDelete: (s: string) => void }) {
  if (!data || data.items.length === 0) {
    return <EmptyState />;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Sentence</th>
          <th style={styles.th}>Definitions</th>
          <th style={styles.th}>Source</th>
          <th style={styles.th}>Added</th>
          <th style={styles.th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((s) => (
          <tr key={s.sentence + s.language} style={styles.tr}>
            <td style={styles.td}>{s.sentence}</td>
            <td style={styles.td}>{(s.definitions ?? []).join('; ')}</td>
            <td style={styles.td}>
              {s.sourceUrl ? (
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#177ddc' }}>
                  {new URL(s.sourceUrl).hostname}
                </a>
              ) : ''}
            </td>
            <td style={styles.td}>
              {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}
            </td>
            <td style={styles.td}>
              <button onClick={() => onDelete(s.sentence)} style={styles.deleteBtn}>Remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState() {
  return (
    <div style={styles.empty}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>No Data</div>
      <p style={{ color: '#999' }}>Save words or sentences while browsing to see them here.</p>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #177ddc' : '2px solid transparent',
        color: active ? '#177ddc' : '#666',
        fontWeight: active ? 600 : 400,
        fontSize: 15,
        padding: '8px 0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 1000,
    margin: '0 auto',
    padding: '24px 32px',
  },
  container: {},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 600, margin: 0 },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#666',
  },
  hint: { fontSize: 13, color: '#888', margin: '0 0 16px' },
  tabRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #eee',
    marginBottom: 12,
  },
  countText: { fontSize: 12, color: '#888' },
  controlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 13,
  },
  exportBtn: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#e74c3c',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '2px solid #eee',
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' },
  deleteBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 12,
    cursor: 'pointer',
    color: '#e74c3c',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 0',
    color: '#bbb',
  },
  loadMoreBtn: {
    padding: '8px 24px',
    borderRadius: 6,
    border: '1px solid #177ddc',
    backgroundColor: '#fff',
    color: '#177ddc',
    fontSize: 13,
    cursor: 'pointer',
  },
};
