import { useState } from 'react';

/** A per-browser preference kept in localStorage (falls back to the default when storage is blocked). */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : (JSON.parse(stored) as T);
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable: keep the value for this session only.
    }
  };
  return [value, update];
}
