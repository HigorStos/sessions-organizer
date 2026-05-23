import type { PaymentMethod, PaymentRecord } from "@/types/payment";

type MonthPoint = {
  label: string;
  amount: number;
  sessions: number;
};

export type DashboardMetrics = {
  totalAmount: number;
  totalCount: number;
  totalSessions: number;
  monthAmount: number;
  monthSessions: number;
  avgTicket: number;
  avgPerSession: number;
  avgDailyRevenue: number;
  avgWeeklyRevenue: number;
  avgDailySessions: number;
  avgWeeklySessions: number;
  byMonth: MonthPoint[];
};

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
});

function getMonthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function getDashboardMetrics(payments: PaymentRecord[]): DashboardMetrics {
  const now = new Date();
  const currentMonth = getMonthKey(now);

  let totalAmount = 0;
  let totalSessions = 0;
  let monthAmount = 0;
  let monthSessions = 0;

  const monthMap = new Map<string, MonthPoint>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const payment of payments) {
    const amount = payment.amountBRL;
    const sessions = payment.sessions;
    totalAmount += amount;
    totalSessions += sessions;

    const paymentDate = new Date(`${payment.date}T00:00:00`);
    if (!minDate || paymentDate < minDate) {
      minDate = paymentDate;
    }
    if (!maxDate || paymentDate > maxDate) {
      maxDate = paymentDate;
    }

    const monthKey = getMonthKey(paymentDate);
    if (monthKey === currentMonth) {
      monthAmount += amount;
      monthSessions += sessions;
    }

    const current = monthMap.get(monthKey);
    if (current) {
      current.amount += amount;
      current.sessions += sessions;
    } else {
      monthMap.set(monthKey, {
        label: monthFmt.format(paymentDate),
        amount,
        sessions,
      });
    }
  }

  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, point]) => point);

  const totalCount = payments.length;
  const rangeDays =
    minDate && maxDate
      ? Math.max(1, Math.floor((maxDate.getTime() - minDate.getTime()) / 86400000) + 1)
      : 1;
  const avgDailyRevenue = totalAmount / rangeDays;
  const avgWeeklyRevenue = avgDailyRevenue * 7;
  const avgDailySessions = totalSessions / rangeDays;
  const avgWeeklySessions = avgDailySessions * 7;

  return {
    totalAmount,
    totalCount,
    totalSessions,
    monthAmount,
    monthSessions,
    avgTicket: totalCount > 0 ? totalAmount / totalCount : 0,
    avgPerSession: totalSessions > 0 ? totalAmount / totalSessions : 0,
    avgDailyRevenue,
    avgWeeklyRevenue,
    avgDailySessions,
    avgWeeklySessions,
    byMonth,
  };
}

export function filterByMethod(
  payments: PaymentRecord[],
  method: PaymentMethod | "ALL",
): PaymentRecord[] {
  if (method === "ALL") {
    return payments;
  }

  return payments.filter((payment) => payment.method === method);
}

export function filterByPeriod(
  payments: PaymentRecord[],
  fromDate: string,
  toDate: string,
): PaymentRecord[] {
  return payments.filter((payment) => {
    const afterFrom = fromDate ? payment.date >= fromDate : true;
    const beforeTo = toDate ? payment.date <= toDate : true;
    return afterFrom && beforeTo;
  });
}
