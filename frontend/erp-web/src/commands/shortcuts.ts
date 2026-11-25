import type { StandardCommandId } from './types';

export type KeyChord = { key: string; ctrl: boolean; alt: boolean; shift: boolean };
export type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export const STANDARD_SHORTCUTS: Record<StandardCommandId, string> = {
  new: 'F2',
  open: 'Enter',
  view: 'Shift+Enter',
  save: 'Ctrl+S',
  delete: 'Ctrl+Delete',
  refresh: 'F5',
  filter: 'Ctrl+F',
  print: 'Ctrl+P',
  export: 'Ctrl+E',
  undo: 'Ctrl+Z',
};

export const MORE_MENU_SHORTCUT = 'Alt+İ';

const TURKISH_DOTTED_CAPITAL_I = 'İ';
const ASCII_LETTER = /^[A-Za-z]$/;
const LATIN_SCRIPT = /^\p{Script=Latin}$/u;

export function parseShortcut(text: string): KeyChord {
  const parts = text.split('+').map((part) => part.trim()).filter(Boolean);
  const chord: KeyChord = { key: '', ctrl: false, alt: false, shift: false };
  for (const part of parts) {
    const name = part.toLowerCase();
    if (name === 'ctrl' || name === 'cmd' || name === 'meta') chord.ctrl = true;
    else if (name === 'alt') chord.alt = true;
    else if (name === 'shift') chord.shift = true;
    else chord.key = ASCII_LETTER.test(part) ? part.toUpperCase() : part;
  }
  return chord;
}

// Explicit key sets instead of toLowerCase(): in Turkish locales case folding of i/İ/ı is unreliable.
function letterKeys(letter: string): ReadonlySet<string> {
  if (letter === TURKISH_DOTTED_CAPITAL_I) return new Set(['i', 'I', TURKISH_DOTTED_CAPITAL_I]);
  return new Set([letter.toLowerCase(), letter.toUpperCase()]);
}

function matchesKey(event: KeyEventLike, chordKey: string): boolean {
  const isLetter = ASCII_LETTER.test(chordKey) || chordKey === TURKISH_DOTTED_CAPITAL_I;
  if (!isLetter) return event.key === chordKey;
  if (letterKeys(chordKey).has(event.key)) return true;
  // Latin letters (incl. dotless ı) are trusted as typed; only non-Latin layouts or dead keys fall back to the physical key.
  const typedLatinLetter = event.key.length === 1 && LATIN_SCRIPT.test(event.key);
  if (typedLatinLetter) return false;
  return event.code === `Key${chordKey === TURKISH_DOTTED_CAPITAL_I ? 'I' : chordKey}`;
}

export function matchesShortcut(event: KeyEventLike, chord: KeyChord): boolean {
  if ((event.ctrlKey || event.metaKey) !== chord.ctrl) return false;
  if (event.altKey !== chord.alt) return false;
  // İ is typed with Shift on US layouts, so Shift is not significant for it.
  if (chord.key !== TURKISH_DOTTED_CAPITAL_I && event.shiftKey !== chord.shift) return false;
  return matchesKey(event, chord.key);
}

export function formatShortcut(text: string, _locale: 'tr' | 'en'): string {
  return text.split('+').map((part) => (part === 'Delete' ? 'Del' : part)).join('+');
}
