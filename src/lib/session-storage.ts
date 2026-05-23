import type {
  OrganizerSettings,
  SessionDraft,
  SessionEntry,
} from '../types/session';

export const SESSION_PRICE = 0.25;
export const SUNDAY_SESSION_PRICE = 0.5;

const STORAGE_KEY = 'juka.payments.v1';
const SETTINGS_STORAGE_KEY = 'juka.payments.settings.v1';
const LEGACY_STORAGE_KEY = 'rkz.payments.v1';

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `s-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeSession(data: unknown): SessionEntry | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const candidate = data as Partial<SessionEntry> & { notes?: unknown };
  const sessions =
    typeof candidate.sessions === 'number' &&
    Number.isFinite(candidate.sessions)
      ? Math.max(1, Math.round(candidate.sessions))
      : null;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.date !== 'string' ||
    sessions === null ||
    typeof candidate.amountBRL !== 'number' ||
    !Number.isFinite(candidate.amountBRL) ||
    typeof candidate.createdAt !== 'string'
  ) {
    return null;
  }

  const unitPrice =
    typeof candidate.unitPrice === 'number' &&
    Number.isFinite(candidate.unitPrice)
      ? candidate.unitPrice
      : sessions > 0
        ? Number((candidate.amountBRL / sessions).toFixed(2))
        : SESSION_PRICE;

  return {
    id: candidate.id,
    date: candidate.date,
    sessions,
    unitPrice,
    amountBRL: candidate.amountBRL,
    useSundayBonus:
      typeof candidate.useSundayBonus === 'boolean'
        ? candidate.useSundayBonus
        : false,
    note:
      typeof candidate.note === 'string'
        ? candidate.note
        : typeof candidate.notes === 'string'
          ? candidate.notes
          : '',
    createdAt: candidate.createdAt,
  };
}

function normalizeSettings(data: unknown): OrganizerSettings | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const candidate = data as Partial<OrganizerSettings>;

  if (
    typeof candidate.name !== 'string' ||
    typeof candidate.sessionPrice !== 'number' ||
    !Number.isFinite(candidate.sessionPrice) ||
    typeof candidate.sundaySessionPrice !== 'number' ||
    !Number.isFinite(candidate.sundaySessionPrice)
  ) {
    return null;
  }

  return {
    name: candidate.name.trim(),
    sessionPrice: Number(candidate.sessionPrice.toFixed(2)),
    sundaySessionPrice: Number(candidate.sundaySessionPrice.toFixed(2)),
  };
}

function readStoredEntries(storageKey: string): SessionEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => normalizeSession(entry))
    .filter((entry): entry is SessionEntry => entry !== null)
    .sort((a, b) => {
      const createdAtDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
}

export function getTodayDate(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

export function loadSessions(): SessionEntry[] {
  const sessions = readStoredEntries(STORAGE_KEY);

  if (sessions.length > 0) {
    return sessions;
  }

  return readStoredEntries(LEGACY_STORAGE_KEY);
}

export function saveSessions(entries: SessionEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function loadSettings(): OrganizerSettings | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = safeJsonParse(raw);
  return normalizeSettings(parsed);
}

export function saveSettings(settings: OrganizerSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function isSunday(date: string): boolean {
  const parts = date.split('-').map((part) => Number(part));

  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return false;
  }

  const [year, month, day] = parts;
  const parsedDate = new Date(year, month - 1, day);

  return !Number.isNaN(parsedDate.getTime()) && parsedDate.getDay() === 0;
}

export function buildSessionEntry(
  draft: SessionDraft,
  settings: OrganizerSettings,
): SessionEntry {
  const sessions = Math.max(1, Math.round(Number(draft.sessions)));
  const unitPrice =
    draft.useSundayBonus && isSunday(draft.date)
      ? settings.sundaySessionPrice
      : settings.sessionPrice;
  const amountBRL = Number((sessions * unitPrice).toFixed(2));

  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    date: draft.date,
    sessions,
    unitPrice,
    amountBRL,
    note: draft.note.trim(),
    useSundayBonus: draft.useSundayBonus,
  };
}

export function brl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
