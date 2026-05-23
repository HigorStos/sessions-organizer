export type SessionEntry = {
  id: string;
  date: string;
  sessions: number;
  unitPrice: number;
  amountBRL: number;
  note: string;
  useSundayBonus: boolean;
  createdAt: string;
};

export type SessionDraft = {
  date: string;
  sessions: number;
  note: string;
  useSundayBonus: boolean;
};

export type OrganizerSettings = {
  name: string;
  sessionPrice: number;
  sundaySessionPrice: number;
};

export type OrganizerSettingsDraft = OrganizerSettings;
