export type PaymentMethod = "PIX" | "BINANCE";

export type PaymentRecord = {
  id: string;
  date: string;
  method: PaymentMethod;
  amountBRL: number;
  sessions: number;
  notes: string;
  createdAt: string;
};

export type PaymentDraft = {
  date: string;
  method: PaymentMethod;
  amountBRL: number;
  sessions: number;
  notes: string;
};
