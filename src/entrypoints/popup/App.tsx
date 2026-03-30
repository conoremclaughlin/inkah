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
        setSettings(settings); // revert
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

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 20,
          gap: 8,
        }}
      >
        <img
          src="/images/inkah-logo-48.png"
          alt="Inkah"
          width={32}
          height={32}
        />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Inkah</h1>
      </div>

      {/* Enable/Disable Toggle */}
      <SettingRow label="Extension Enabled">
        <ToggleSwitch
          checked={settings.isEnabled ?? true}
          onChange={(v) => updateSetting({ isEnabled: v })}
        />
      </SettingRow>

      {/* Target Language */}
      <SettingRow label="Target Language">
        <select
          value={settings.targetLanguage}
          onChange={(e) =>
            updateSetting({
              targetLanguage: e.target.value as SupportedLanguages,
            })
          }
          style={selectStyle}
        >
          {Object.entries(AvailableLanguages).map(([code, lang]) => (
            <option key={code} value={code}>
              {lang.name}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Character Type (Chinese only) */}
      {settings.targetLanguage === 'zh' && (
        <SettingRow label="Character Type">
          <select
            value={settings.characterType ?? 'simplified_traditional'}
            onChange={(e) =>
              updateSetting({
                characterType: e.target.value as CharacterType,
              })
            }
            style={selectStyle}
          >
            <option value="simplified_traditional">Simplified + Traditional</option>
            <option value="traditional_simplified">Traditional + Simplified</option>
            <option value="simplified">Simplified</option>
            <option value="traditional">Traditional</option>
          </select>
        </SettingRow>
      )}

      {/* Dark Mode */}
      <SettingRow label="Dark Mode">
        <ToggleSwitch
          checked={settings.isDarkModeOn ?? true}
          onChange={(v) => updateSetting({ isDarkModeOn: v })}
        />
      </SettingRow>

      {/* Tone Colors */}
      <SettingRow label="Tone Colors">
        <ToggleSwitch
          checked={settings.isColorEnabled ?? true}
          onChange={(v) => updateSetting({ isColorEnabled: v })}
        />
      </SettingRow>

      {/* Hover Key */}
      <SettingRow label="Hover Key">
        <select
          value={settings.hoverKey ?? 'noKey'}
          onChange={(e) =>
            updateSetting({
              hoverKey: e.target.value as HoverKeyOptions,
            })
          }
          style={selectStyle}
        >
          <option value="noKey">No Key (always on)</option>
          <option value="ctrl">Ctrl</option>
          <option value="option">Option / Alt</option>
          <option value="command">Command</option>
          <option value="shift">Shift</option>
        </select>
      </SettingRow>

      {/* Font Size */}
      <SettingRow label={`Font Size: ${settings.fontSize ?? 2}`}>
        <input
          type="range"
          min={1}
          max={4}
          value={settings.fontSize ?? 2}
          onChange={(e) =>
            updateSetting({ fontSize: parseInt(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </SettingRow>

      {/* Lookup Delay */}
      <SettingRow label={`Lookup Delay: ${settings.lookUpDelay ?? 20}ms`}>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={settings.lookUpDelay ?? 20}
          onChange={(e) =>
            updateSetting({ lookUpDelay: parseInt(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </SettingRow>

      <div
        style={{
          marginTop: 20,
          padding: '8px 0',
          borderTop: '1px solid #eee',
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
        }}
      >
        Inkah v0.1.0 — MV3
      </div>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid #f0f0f0',
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
        width: 40,
        height: 22,
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
          backgroundColor: checked ? '#4CAF50' : '#ccc',
          borderRadius: 22,
          transition: '0.3s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            height: 16,
            width: 16,
            left: checked ? 20 : 3,
            bottom: 3,
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: '0.3s',
          }}
        />
      </span>
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #ddd',
  fontSize: 13,
  backgroundColor: '#fff',
};
