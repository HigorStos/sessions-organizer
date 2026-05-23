import type { PaymentDraft, PaymentMethod, PaymentRecord } from "@/types/payment";

const STORAGE_KEY = "rkz.payments.v1";

const methodSet = new Set<PaymentMethod>(["PIX", "BINANCE"]);

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizePayment(data: unknown): PaymentRecord | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const candidate = data as Partial<PaymentRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.date !== "string" ||
    typeof candidate.method !== "string" ||
    !methodSet.has(candidate.method as PaymentMethod) ||
    typeof candidate.amountBRL !== "number" ||
    !Number.isFinite(candidate.amountBRL) ||
    typeof candidate.notes !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  const sessionsValue =
    typeof candidate.sessions === "number" && Number.isFinite(candidate.sessions)
      ? Math.max(1, Math.round(candidate.sessions))
      : 1;

  return {
    id: candidate.id,
    date: candidate.date,
    method: candidate.method as PaymentMethod,
    amountBRL: candidate.amountBRL,
    sessions: sessionsValue,
    notes: candidate.notes,
    createdAt: candidate.createdAt,
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `p-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function loadPayments(): PaymentRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => normalizePayment(entry))
    .filter((entry): entry is PaymentRecord => entry !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function savePayments(payments: PaymentRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
}

export function buildPaymentRecord(draft: PaymentDraft): PaymentRecord {
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...draft,
  };
}

export function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
