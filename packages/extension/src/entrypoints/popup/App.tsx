import React, { useEffect, useState, useCallback } from 'react';
import type { Settings } from '../../data/settings';
import AvailableLanguages from '../../lib/available-languages';

type PartialSettings = Partial<Settings>;

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'settings/get',
      });
      if (response?.data) {
        setSettings(response.data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  const updateSetting = useCallback(
    async (update: PartialSettings) => {
      if (!settings) return;

      const optimistic = { ...settings, ...update };
      setSettings(optimistic);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'settings/update',
          payload: update,
        });
        if (response?.data) {
          setSettings(response.data);
        }
      } catch (err) {
        console.error('Failed to update setting:', err);
        setSettings(settings);
      }
    },
    [settings],
  );

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>
    );
  }

  if (!settings) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#e44' }}>
        Failed to load settings
      </div>
    );
  }

  const isDark = settings.isDarkModeOn ?? false;
  const lang = settings.targetLanguage ?? 'zh';
  const langConfig = AvailableLanguages[lang];
  const isTranslitEnabled =
    settings.isTransliterationEnabled?.[lang] ?? (lang === 'zh');

  const theme = {
    bg: isDark ? '#1e1e2e' : '#ffffff',
    text: isDark ? '#e0e0e0' : '#333333',
    textSecondary: isDark ? '#999' : '#888',
    border: isDark ? '#3a3a4a' : '#eee',
    inputBg: isDark ? '#2a2a3a' : '#fff',
    inputBorder: isDark ? '#4a4a5a' : '#ddd',
    sectionTitle: isDark ? '#d0d0d0' : '#222',
  };

  return (
    <div
      style={{
        padding: 16,
        background: theme.bg,
        color: theme.text,
        minHeight: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 16,
          gap: 8,
        }}
      >
        <img
          src="/images/inkah-logo-48.png"
          alt="Inkah"
          width={28}
          height={28}
        />
        <span style={{ fontSize: 18, fontWeight: 600 }}>Inkah</span>
      </div>

      {/* Enable Inkah */}
      <SettingRow label="Enable Inkah" theme={theme}>
        <ToggleSwitch
          checked={settings.isEnabled ?? true}
          onChange={(v) => updateSetting({ isEnabled: v })}
        />
      </SettingRow>

      {/* Target Language */}
      <SectionTitle text="Target language" theme={theme} />
      <select
        value={lang}
        onChange={(e) =>
          updateSetting({
            targetLanguage: e.target.value as SupportedLanguages,
          })
        }
        style={selectStyle(theme)}
      >
        {Object.entries(AvailableLanguages).map(([code, config]) => (
          <option key={code} value={code}>
            {config.name}
          </option>
        ))}
      </select>

      {/* Transliteration */}
      <SectionTitle text="Transliteration" theme={theme} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <select
          value={settings.transliteration?.[lang] ?? Object.keys(langConfig.transliteration)[0]}
          onChange={(e) =>
            updateSetting({
              transliteration: {
                ...settings.transliteration!,
                [lang]: e.target.value,
              },
            })
          }
          style={selectStyle(theme)}
        >
          {Object.entries(langConfig.transliteration).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ToggleSwitch
          checked={isTranslitEnabled}
          onChange={(v) =>
            updateSetting({
              isTransliterationEnabled: {
                ...settings.isTransliterationEnabled!,
                [lang]: v,
              },
            })
          }
        />
      </div>

      {/* Character Set (Chinese only) */}
      {lang === 'zh' && (
        <>
          <SectionTitle text="Character set" theme={theme} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(
              [
                ['simplified_traditional', 'Simplified + Traditional'],
                ['traditional_simplified', 'Traditional + Simplified'],
                ['simplified', 'Simplified'],
                ['traditional', 'Traditional'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="radio"
                  name="characterType"
                  value={value}
                  checked={
                    (settings.characterType ?? 'simplified_traditional') ===
                    value
                  }
                  onChange={() =>
                    updateSetting({ characterType: value as CharacterType })
                  }
                  style={{ accentColor: '#177ddc' }}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}

      {/* Tone Coloring */}
      <SettingRow label="Tone coloring" theme={theme}>
        <ToggleSwitch
          checked={settings.isColorEnabled ?? true}
          onChange={(v) => updateSetting({ isColorEnabled: v })}
        />
      </SettingRow>

      {/* Dark Mode */}
      <SettingRow label="Dark mode" theme={theme}>
        <ToggleSwitch
          checked={isDark}
          onChange={(v) => updateSetting({ isDarkModeOn: v })}
        />
      </SettingRow>

      {/* Target Font Size */}
      <SectionTitle text="Target font size" theme={theme} />
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={settings.fontSize ?? 2}
        onChange={(e) =>
          updateSetting({ fontSize: parseInt(e.target.value) })
        }
        style={{ width: '100%', accentColor: '#177ddc' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: theme.textSecondary,
          marginTop: 2,
        }}
      >
        {['0.85x', '1x', '1.25x', '1.5x', '1.7x'].map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>

      {/* Hover Key */}
      <SettingRow label="Hover Key" theme={theme}>
        <select
          value={settings.hoverKey ?? 'noKey'}
          onChange={(e) =>
            updateSetting({
              hoverKey: e.target.value as HoverKeyOptions,
            })
          }
          style={selectStyle(theme)}
        >
          <option value="noKey">No Key (always on)</option>
          <option value="ctrl">Ctrl</option>
          <option value="option">Option / Alt</option>
          <option value="command">Command</option>
          <option value="shift">Shift</option>
        </select>
      </SettingRow>

      {/* Lookup Delay */}
      <SettingRow label={`Lookup Delay: ${settings.lookUpDelay ?? 20}ms`} theme={theme}>
        <input
          type="range"
          min={20}
          max={350}
          step={10}
          value={settings.lookUpDelay ?? 20}
          onChange={(e) =>
            updateSetting({ lookUpDelay: parseInt(e.target.value) })
          }
          style={{ width: 120, accentColor: '#177ddc' }}
        />
      </SettingRow>

      {/* Bookmarks + Settings buttons */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <button
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/bookmarks.html') })}
          style={buttonStyle}
        >
          Bookmarks
        </button>
        <button
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/settings.html') })}
          style={buttonStyle}
        >
          Settings
        </button>
      </div>
    </div>
  );
}

// --- Reusable components ---

function SectionTitle({
  text,
  theme,
}: {
  text: string;
  theme: Record<string, string>;
}) {
  return (
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: theme.sectionTitle,
        marginTop: 14,
        marginBottom: 6,
      }}
    >
      {text}
    </div>
  );
}

function SettingRow({
  label,
  children,
  theme,
}: {
  label: string;
  children: React.ReactNode;
  theme: Record<string, string>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 44,
        height: 24,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? '#177ddc' : '#ccc',
          borderRadius: 24,
          transition: '0.2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            height: 18,
            width: 18,
            left: checked ? 22 : 3,
            bottom: 3,
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: '0.2s',
          }}
        />
      </span>
    </label>
  );
}

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#177ddc',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

function selectStyle(theme: Record<string, string>): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${theme.inputBorder}`,
    fontSize: 13,
    backgroundColor: theme.inputBg,
    color: theme.text,
    minWidth: 140,
  };
}
