// App appearance (the editor's own look, not the book's style). The palettes
// live in app.css as [data-ui-theme] blocks; index.html applies the saved
// choice before first paint so there's no flash of the wrong theme.

import { useEffect, useState } from 'react';
import { N_ } from '../i18n/ui';

export type UiThemeId = 'paper' | 'sepia' | 'slate' | 'ink' | 'midnight' | 'evergreen';
export type UiThemeChoice = UiThemeId | 'system';

export interface UiTheme {
  id: UiThemeId;
  name: string;
  dark: boolean;
  /** Background, panel and accent, for the picker's swatch. */
  swatch: [string, string, string];
}

export const UI_THEMES: UiTheme[] = [
  { id: 'paper', name: N_('Paper'), dark: false, swatch: ['#f2eee6', '#faf8f4', '#b0361f'] },
  { id: 'sepia', name: N_('Sepia'), dark: false, swatch: ['#ebe0cc', '#f5eddf', '#2c6a55'] },
  { id: 'slate', name: N_('Slate'), dark: false, swatch: ['#e9edf1', '#f6f8fa', '#2a58a6'] },
  { id: 'ink', name: N_('Ink'), dark: true, swatch: ['#141311', '#1b1a18', '#f08a6e'] },
  { id: 'midnight', name: N_('Midnight'), dark: true, swatch: ['#0c101b', '#121726', '#8db2ff'] },
  { id: 'evergreen', name: N_('Evergreen'), dark: true, swatch: ['#0e1512', '#151d19', '#d9b35f'] },
];

/** What "System" resolves to. */
export const SYSTEM_LIGHT: UiThemeId = 'paper';
export const SYSTEM_DARK: UiThemeId = 'ink';

const STORAGE_KEY = 'recto:appearance';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isChoice(value: unknown): value is UiThemeChoice {
  return value === 'system' || UI_THEMES.some((t) => t.id === value);
}

function readChoice(): UiThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writeChoice(choice: UiThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice just won't persist.
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(choice: UiThemeChoice, prefersDark = systemPrefersDark()): UiThemeId {
  if (choice !== 'system') return choice;
  return prefersDark ? SYSTEM_DARK : SYSTEM_LIGHT;
}

export function applyTheme(id: UiThemeId): void {
  document.documentElement.dataset.uiTheme = id;
}

/** The current appearance choice, applied to <html> and kept in sync with the OS setting. */
export function useAppearance(): [UiThemeChoice, UiThemeId, (choice: UiThemeChoice) => void] {
  const [choice, setChoice] = useState<UiThemeChoice>(readChoice);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(choice, prefersDark);
  useEffect(() => applyTheme(resolved), [resolved]);

  const choose = (next: UiThemeChoice) => {
    writeChoice(next);
    setChoice(next);
  };
  return [choice, resolved, choose];
}
