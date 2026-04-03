import React, { useEffect, useState, useCallback } from 'react';
import type { Settings } from '../../data/settings';
import { TonePresets } from '../../lib/available-languages';

const DELAY_STOPS = [20, 50, 100, 150, 200, 250, 300, 350];

const PRESET_NAMES: Record<string, string> = {
  pleco: 'Pleco',
  mdbg: 'MDBG',
  hanping: 'Hanping',
  nathan: 'Nathan Dummitt',
};

const TONE_LABELS = [
  'First Tone',
  'Second Tone',
  'Third Tone',
  'Fourth Tone',
  'Fifth Tone (Quiet)',
];
const TONE_KEYS: (keyof ToneColors['light'])[] = [
  'firstTone',
  'secondTone',
  'thirdTone',
  'fourthTone',
  'fifthTone',
];

export default function SettingsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('pleco');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'settings/get' });
      if (res?.data) setSettings(res.data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  const updateSetting = useCallback(
    async (update: Partial<Settings>) => {
      if (!settings) return;
      const optimistic = { ...settings, ...update };
      setSettings(optimistic);
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'settings/update',
          payload: update,
        });
        if (res?.data) setSettings(res.data);
      } catch (err) {
        console.error('Failed to update:', err);
        setSettings(settings);
      }
    },
    [settings],
  );

  const applyPreset = () => {
    const preset = TonePresets[selectedPreset as keyof typeof TonePresets];
    if (preset) {
      updateSetting({ toneColors: preset });
    }
  };

  const updateToneColor = (
    mode: 'light' | 'dark',
    key: keyof ToneColors['light'],
    value: string,
  ) => {
    if (!settings?.toneColors) return;
    const updated = {
      ...settings.toneColors,
      [mode]: { ...settings.toneColors[mode], [key]: value },
    };
    updateSetting({ toneColors: updated });
  };

  if (!settings) {
    return <div style={s.page}>Loading...</div>;
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <h1 style={s.title}>Advanced Settings</h1>
          <button onClick={() => window.close()} style={s.closeBtn}>X</button>
        </div>

        {/* Hot Key */}
        <Section title="Hot key - Turn on and off Inkah's dictionary">
          <p style={s.desc}>ctrl+i or command+i</p>
        </Section>

        {/* Hover Key */}
        <Section title="Hot key - Hover dictionary look-up">
          <p style={s.desc}>
            Which key would you like to hold while hovering a word for its definitions to appear?
          </p>
          <select
            value={settings.hoverKey ?? 'noKey'}
            onChange={(e) => updateSetting({ hoverKey: e.target.value as HoverKeyOptions })}
            style={s.select}
          >
            <option value="noKey">No Key</option>
            <option value="ctrl">Ctrl</option>
            <option value="option">Option / Alt</option>
            <option value="command">Command / Meta</option>
            <option value="shift">Shift</option>
          </select>
        </Section>

        {/* Selection Dictionary Preference */}
        <Section title="Selection dictionary preference">
          <p style={s.desc}>How would you like the dictionary to pop up on selection?</p>
          <select
            value={settings.dictionaryDisplay ?? 'icon'}
            onChange={(e) => updateSetting({ dictionaryDisplay: e.target.value as DisplayOptions })}
            style={s.select}
          >
            <option value="icon">Display an icon I can click to show dictionary</option>
            <option value="auto">Immediately display dictionary</option>
          </select>
        </Section>

        {/* Hover Dictionary Delay */}
        <Section title="Hover dictionary delay">
          <p style={s.desc}>How long do you want to hover a word before its definitions appear?</p>
          <input
            type="range"
            min={0}
            max={DELAY_STOPS.length - 1}
            value={DELAY_STOPS.indexOf(
              DELAY_STOPS.reduce((prev, curr) =>
                Math.abs(curr - (settings.lookUpDelay ?? 20)) <
                Math.abs(prev - (settings.lookUpDelay ?? 20))
                  ? curr
                  : prev,
              ),
            )}
            onChange={(e) => updateSetting({ lookUpDelay: DELAY_STOPS[parseInt(e.target.value)] })}
            style={{ width: '100%', accentColor: '#177ddc' }}
          />
          <div style={s.sliderLabels}>
            {DELAY_STOPS.map((v) => (
              <span key={v}>{v}ms</span>
            ))}
          </div>
        </Section>

        {/* Tone Color Theme */}
        <Section title="Tone color theme">
          <p style={s.desc}>
            Chinese - What colors are your light and dark mode tones? Choose from a list
            of presets or customize your own. Accepts hexadecimal color values, rgb, or any
            acceptable CSS values. Defaults to Pleco.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              style={s.select}
            >
              {Object.entries(PRESET_NAMES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button onClick={applyPreset} style={s.applyBtn}>Apply Preset</button>
          </div>

          {/* Light mode tones */}
          <h4 style={s.toneGroupTitle}>Light mode tones</h4>
          <div style={s.toneGrid}>
            {TONE_KEYS.map((key, i) => (
              <div key={`light-${key}`}>
                <label style={{ ...s.toneLabel, color: settings.toneColors?.light[key] ?? '#000' }}>
                  * Light {TONE_LABELS[i]}
                </label>
                <input
                  type="text"
                  value={settings.toneColors?.light[key] ?? ''}
                  onChange={(e) => updateToneColor('light', key, e.target.value)}
                  style={s.toneInput}
                />
              </div>
            ))}
          </div>

          {/* Dark mode tones */}
          <h4 style={s.toneGroupTitle}>Dark mode tones</h4>
          <div style={s.toneGrid}>
            {TONE_KEYS.map((key, i) => (
              <div key={`dark-${key}`}>
                <label style={{ ...s.toneLabel, color: settings.toneColors?.dark[key] ?? '#fff' }}>
                  * Dark {TONE_LABELS[i]}
                </label>
                <input
                  type="text"
                  value={settings.toneColors?.dark[key] ?? ''}
                  onChange={(e) => updateToneColor('dark', key, e.target.value)}
                  style={s.toneInput}
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => updateSetting({ toneColors: settings.toneColors })}
            style={s.saveBtn}
          >
            Save Colors
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={s.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 32px',
    color: '#333',
  },
  container: {},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid #eee',
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: 600, margin: 0 },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#666',
  },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 6px' },
  desc: { fontSize: 13, color: '#666', margin: '0 0 10px' },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 13,
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  applyBtn: {
    padding: '6px 16px',
    borderRadius: 6,
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  toneGroupTitle: { fontSize: 14, fontWeight: 600, margin: '12px 0 8px' },
  toneGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 12,
    marginBottom: 12,
  },
  toneLabel: { fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 },
  toneInput: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  saveBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#177ddc',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
};
