import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  filterByMethod,
  filterByPeriod,
  getDashboardMetrics,
} from './lib/payment-metrics';
import { brl } from './lib/payment-storage';
import { supabase } from './lib/supabase';
import type { PaymentMethod, PaymentRecord } from './types/payment';

type ProfileRow = {
  id: string;
  name: string;
  created_at: string;
};

type PaymentRow = PaymentRecord & {
  userId: string;
  userName: string;
};

type PaymentDbRow = {
  id: string;
  user_id: string;
  date: string;
  method: PaymentMethod;
  amount_brl: number;
  sessions: number;
  notes: string;
  created_at: string;
};

type AuthMode = 'signin' | 'signup';

type PaymentDraftState = {
  date: string;
  method: PaymentMethod;
  amountBRL: string;
  unitPriceBRL: string;
  sessions: string;
  notes: string;
  userId: string;
};

const methodLabels: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  BINANCE: 'Binance',
};

function getTodayDate(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

const initialAuthDraft = {
  name: '',
  email: '',
  password: '',
};

function getInitialPaymentDraft(userId: string): PaymentDraftState {
  return {
    date: getTodayDate(),
    method: 'PIX',
    amountBRL: '',
    unitPriceBRL: '',
    sessions: '1',
    notes: '',
    userId,
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className='rounded-3xl border border-border/80 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm'>
      <p className='text-[11px] uppercase tracking-[0.24em] text-muted'>
        {label}
      </p>
      <p className='mt-2 text-2xl font-semibold tracking-tight text-foreground'>
        {value}
      </p>
      {hint ? (
        <p className='mt-2 text-xs leading-5 text-muted'>{hint}</p>
      ) : null}
    </article>
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function mapPaymentRow(row: PaymentDbRow, userName: string): PaymentRow {
  return {
    id: row.id,
    userId: row.user_id,
    userName,
    date: row.date,
    method: row.method,
    amountBRL: row.amount_brl,
    sessions: row.sessions,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export default function SupabaseApp() {
  const [pathname, setPathname] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authDraft, setAuthDraft] = useState(initialAuthDraft);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | 'ALL'>(
    'ALL',
  );
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>(
    getInitialPaymentDraft(''),
  );
  const [paymentError, setPaymentError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const isAdminRoute = pathname.startsWith('/admin');
  const isAdmin = profile?.name.trim().toLowerCase() === 'admin';
  const visiblePayments = useMemo(() => {
    return filterByPeriod(
      filterByMethod(payments, filterMethod),
      filterStartDate,
      filterEndDate,
    );
  }, [payments, filterEndDate, filterMethod, filterStartDate]);
  const metrics = useMemo(
    () => getDashboardMetrics(visiblePayments),
    [visiblePayments],
  );

  // Metrics for specific users (Higor and Juka) and admin-derived cards
  const higorProfile = profiles.find((p) => p.name.trim().toLowerCase() === 'higor');
  const jukaProfile = profiles.find((p) => p.name.trim().toLowerCase() === 'juka');

  const higorPayments = useMemo(
    () => visiblePayments.filter((p) => p.userId === higorProfile?.id),
    [visiblePayments, higorProfile?.id],
  );

  const jukaPayments = useMemo(
    () => visiblePayments.filter((p) => p.userId === jukaProfile?.id),
    [visiblePayments, jukaProfile?.id],
  );

  const higorMetrics = useMemo(() => getDashboardMetrics(higorPayments), [higorPayments]);
  const jukaMetrics = useMemo(() => getDashboardMetrics(jukaPayments), [jukaPayments]);

  const faturamentoTotalCustom = higorMetrics.totalAmount - jukaMetrics.totalAmount;
  const sessoesPorDiaHigor = higorMetrics.avgDailySessions;
  const sessoesTotaisHigor = higorMetrics.totalSessions;
  const lancamentosTodos = visiblePayments.length;

  const computedTotalNumber = useMemo(() => {
    const unitPrice = Number((paymentDraft.unitPriceBRL || '').toString().replace(',', '.'));
    const sessions = Math.max(0, Math.round(Number(paymentDraft.sessions) || 0));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || sessions <= 0) return 0;
    return Number((unitPrice * sessions).toFixed(2));
  }, [paymentDraft.unitPriceBRL, paymentDraft.sessions]);

  const userSummaries = useMemo(() => {
    if (!isAdmin) return [] as Array<{ id: string; name: string; amount: number; sessions: number; count: number }>;

    const summaryMap = new Map<string, { id: string; name: string; amount: number; sessions: number; count: number }>();

    for (const profileRow of profiles) {
      // Exclude the admin profile from the user summary
      if (profileRow.name.trim().toLowerCase() === 'admin') continue;
      summaryMap.set(profileRow.id, {
        id: profileRow.id,
        name: profileRow.name,
        amount: 0,
        sessions: 0,
        count: 0,
      });
    }

    for (const payment of payments) {
      const current = summaryMap.get(payment.userId) ?? {
        id: payment.userId,
        name: payment.userName,
        amount: 0,
        sessions: 0,
        count: 0,
      };

      current.amount += payment.amountBRL;
      current.sessions += payment.sessions;
      current.count += 1;
      summaryMap.set(payment.userId, current);
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.amount - a.amount);
  }, [isAdmin, payments, profiles]);

  function navigateTo(path: string) {
    if (typeof window === 'undefined' || window.location.pathname === path) {
      setPathname(path);
      return;
    }

    window.history.pushState({}, '', path);
    setPathname(path);
  }

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
    }

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function loadContext(session: Session | null) {
    if (!session?.user) {
      setAuthUser(null);
      setProfile(null);
      setPayments([]);
      setProfiles([]);
      setPaymentDraft(getInitialPaymentDraft(''));
      setLoading(false);
      return;
    }

    setAuthUser(session.user);

    // Buscar o profile existente (se houver). usamos maybeSingle() para não falhar quando não houver linhas.
    const profileResult = await supabase
      .from('profiles')
      .select('id, name, created_at')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileResult.error) {
      throw profileResult.error;
    }

    let loadedProfile: ProfileRow;

    if (!profileResult.data) {
      // Se não existe um profile criado (trigger do auth pode não ter ocorrido ainda),
      // criamos um profile básico no cliente com o name do metadata ou parte do e-mail.
      const inferredName =
        (session.user.user_metadata as any)?.name?.trim() ||
        session.user.email?.split('@')[0] ||
        'Usuário';

      const insertRes = await supabase
        .from('profiles')
        .insert({ id: session.user.id, name: inferredName })
        .select()
        .maybeSingle();

      if (insertRes.error) {
        throw insertRes.error;
      }

      loadedProfile = insertRes.data as ProfileRow;
    } else {
      loadedProfile = profileResult.data as ProfileRow;
    }

    setProfile(loadedProfile);

    const adminUser = loadedProfile.name.trim().toLowerCase() === 'admin';
    const paymentsQuery = supabase
      .from('payments')
      .select(
        'id, user_id, date, method, amount_brl, sessions, notes, created_at',
      )
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!adminUser) {
      paymentsQuery.eq('user_id', session.user.id);
    }

    const profilesQuery = adminUser
      ? supabase.from('profiles').select('id, name, created_at').order('name')
      : Promise.resolve({ data: [loadedProfile], error: null });

    const [paymentsResult, adminProfilesResult] = await Promise.all([
      paymentsQuery,
      profilesQuery,
    ]);

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    const profileList = adminUser
      ? ((adminProfilesResult as { data: ProfileRow[] | null }).data ?? [])
      : [loadedProfile];

    const userNameById = new Map(
      profileList.map((item) => [item.id, item.name]),
    );

    setProfiles(profileList);
    setPayments(
      ((paymentsResult.data ?? []) as PaymentDbRow[]).map((row) =>
        mapPaymentRow(row, userNameById.get(row.user_id) ?? loadedProfile.name),
      ),
    );
    setPaymentDraft((prev) => ({
      ...getInitialPaymentDraft(session.user.id),
      userId: adminUser ? prev.userId || session.user.id : session.user.id,
    }));
    setLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      try {
        await loadContext(data.session ?? null);
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : 'Erro ao carregar dados.',
        );
        setLoading(false);
      }
    }

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setLoading(true);

      void loadContext(session)
        .catch((error) => {
          setAuthError(
            error instanceof Error ? error.message : 'Erro ao carregar dados.',
          );
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      return;
    }
    const lastUnit = getLastUnitPrice(authUser.id);

    if (isAdmin && profiles.length > 0) {
      setPaymentDraft((prev) => ({
        ...prev,
        userId: prev.userId || authUser.id || profiles[0].id,
        unitPriceBRL: prev.unitPriceBRL || lastUnit || '',
      }));
      return;
    }

    setPaymentDraft((prev) => ({
      ...prev,
      userId: authUser.id,
      unitPriceBRL: prev.unitPriceBRL || lastUnit || '',
    }));
  }, [authUser, isAdmin, profiles]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');

    const email = authDraft.email.trim();
    const password = authDraft.password;

    if (!email || !password) {
      setAuthError('Informe e-mail e senha.');
      return;
    }

    if (authMode === 'signup' && !authDraft.name.trim()) {
      setAuthError('Informe o nome para o cadastro.');
      return;
    }

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: authDraft.name.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        setStatusMessage(
          'Cadastro criado. Se o e-mail precisar de confirmação, finalize e entre novamente.',
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Falha na autenticação.',
      );
    }
  }

  function resetPaymentDraft(nextUserId?: string) {
    const uid = nextUserId ?? authUser?.id ?? '';
    const lastUnit = getLastUnitPrice(uid);
    setPaymentDraft({ ...getInitialPaymentDraft(uid), unitPriceBRL: lastUnit ?? '' });
    setEditingPaymentId(null);
    setPaymentError('');
  }

  function getLastUnitPrice(userId?: string) {
    if (!userId) return '';
    const userPayments = payments
      .filter((p) => p.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const last = userPayments[0];
    if (!last) return '';
    if (!last.sessions || last.sessions <= 0) return String(last.amountBRL);
    const unit = last.amountBRL / last.sessions;
    return String(Number(unit.toFixed(2)));
  }

  function startEditingPayment(record: PaymentRow) {
    if (isAdmin) {
      setPaymentError('Administradores não podem editar lançamentos.');
      return;
    }

    setEditingPaymentId(record.id);
    setPaymentDraft({
      date: record.date,
      method: record.method,
      amountBRL: String(record.amountBRL),
      unitPriceBRL: String(record.sessions ? (record.amountBRL / record.sessions) : record.amountBRL),
      sessions: String(record.sessions),
      notes: record.notes,
      userId: record.userId,
    });
    setPaymentError('');
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError('');

    if (isAdmin) {
      setPaymentError('Administradores não podem incluir ou editar lançamentos.');
      return;
    }

    if (!authUser) {
      setPaymentError('Faça login para continuar.');
      return;
    }

    const unitPrice = Number(paymentDraft.unitPriceBRL.replace(',', '.'));
    const sessions = Math.round(Number(paymentDraft.sessions));
    const amountBRL = Number((unitPrice * sessions).toFixed(2));

    if (!paymentDraft.date) {
      setPaymentError('Informe a data.');
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setPaymentError('Informe um valor válido por sessão.');
      return;
    }

    if (!Number.isFinite(amountBRL) || amountBRL <= 0) {
      setPaymentError('Valor total inválido.');
      return;
    }

    if (!Number.isFinite(sessions) || sessions < 1) {
      setPaymentError('Informe pelo menos 1 sessão.');
      return;
    }

    const userId = isAdmin ? paymentDraft.userId || authUser.id : authUser.id;

    const payload = {
      user_id: userId,
      date: paymentDraft.date,
      method: paymentDraft.method,
      amount_brl: amountBRL,
      sessions,
      notes: paymentDraft.notes.trim(),
    };

    setSaving(true);

    try {
      if (editingPaymentId) {
        const { error } = await supabase
          .from('payments')
          .update(payload)
          .eq('id', editingPaymentId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from('payments').insert(payload);

        if (error) {
          throw error;
        }
      }

      await loadContext({ user: authUser } as Session);
      resetPaymentDraft(userId);
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : 'Falha ao salvar.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(id: string) {
    if (isAdmin) {
      setPaymentError('Administradores não podem excluir lançamentos.');
      return;
    }

    const { error } = await supabase.from('payments').delete().eq('id', id);

    if (error) {
      setPaymentError(error.message);
      return;
    }

    if (editingPaymentId === id) {
      resetPaymentDraft();
    }

    await loadContext({ user: authUser } as Session);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAuthDraft(initialAuthDraft);
    setStatusMessage('');
  }

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center px-4 text-muted'>
        Carregando painel...
      </div>
    );
  }

  if (!authUser || !profile) {
    return (
      <div className='mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 md:px-8'>
        <div className='grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]'>
          <section className='overflow-hidden rounded-4xl border border-border/70 bg-linear-to-br from-surface via-[#0b1324] to-[#05070d] p-8 shadow-[0_32px_100px_rgba(0,0,0,0.45)] md:p-10'>
            <p className='text-[11px] uppercase tracking-[0.34em] text-accent-soft'>
              Supabase Finance
            </p>
            <h1 className='mt-3 max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl'>
              Controle de faturamento com área admin e acesso por usuário.
            </h1>
            <p className='mt-4 max-w-2xl text-sm leading-6 text-muted md:text-base'>
              Faça login, cadastre lançamentos e acompanhe tudo por período. O
              usuário com o nome Admin entra como administrador e enxerga os
              dados de todos.
            </p>
          </section>

          <section className='rounded-4xl border border-border/70 bg-white/5 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-8'>
            <div className='flex items-center gap-2 rounded-full border border-border/70 bg-surface-soft p-1 text-sm'>
              <button
                type='button'
                className={`rounded-full px-4 py-2 transition ${
                  authMode === 'signin'
                    ? 'bg-accent text-[#08101d]'
                    : 'text-foreground'
                }`}
                onClick={() => setAuthMode('signin')}
              >
                Entrar
              </button>
              <button
                type='button'
                className={`rounded-full px-4 py-2 transition ${
                  authMode === 'signup'
                    ? 'bg-accent text-[#08101d]'
                    : 'text-foreground'
                }`}
                onClick={() => setAuthMode('signup')}
              >
                Criar conta
              </button>
            </div>

            <form className='mt-6 space-y-4' onSubmit={handleAuthSubmit}>
              {authMode === 'signup' ? (
                <div>
                  <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                    Nome
                  </label>
                  <input
                    required
                    type='text'
                    className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                    value={authDraft.name}
                    onChange={(event) =>
                      setAuthDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder='Ex.: Admin'
                  />
                </div>
              ) : null}

              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  E-mail
                </label>
                <input
                  required
                  type='email'
                  className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                  value={authDraft.email}
                  onChange={(event) =>
                    setAuthDraft((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  placeholder='voce@dominio.com'
                />
              </div>

              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Senha
                </label>
                <input
                  required
                  type='password'
                  className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                  value={authDraft.password}
                  onChange={(event) =>
                    setAuthDraft((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  placeholder='••••••••'
                />
              </div>

              {authError ? (
                <p className='text-sm text-danger'>{authError}</p>
              ) : null}
              {statusMessage ? (
                <p className='text-sm text-emerald-300'>{statusMessage}</p>
              ) : null}

              <button
                type='submit'
                className='w-full rounded-2xl bg-linear-to-r from-accent to-accent-soft px-4 py-3 font-semibold text-[#08101d] transition hover:brightness-110'
              >
                {authMode === 'signin' ? 'Entrar' : 'Criar conta'}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10'>
      <header className='overflow-hidden rounded-4xl border border-border/70 bg-linear-to-br from-surface via-[#0b1324] to-[#05070d] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.45)] md:p-8'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.34em] text-accent-soft'>
              {isAdmin ? 'Área admin' : 'Área do usuário'}
              {profile ? ` · ${profile.name}` : ''}
            </p>
            <h1 className='mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-5xl'>
              {isAdmin ? 'Painel administrativo' : 'Painel financeiro'}
            </h1>
            <p className='mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base'>
              {isAdmin
                ? 'Como administrador, você vê os faturamentos de todos os usuários e pode filtrar por período.'
                : 'Você vê apenas os seus próprios lançamentos, com filtros por período e edição rápida.'}
            </p>
          </div>

          <div className='flex flex-wrap gap-3'>
            <button
              type='button'
              className='rounded-xl border border-border/70 px-3 py-2 text-xs text-foreground transition hover:bg-white/5'
              onClick={handleSignOut}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label='Faturamento total (Higor - Juka)'
          value={brl(faturamentoTotalCustom)}
          hint='Diferença entre o faturamento de Higor e Juka no recorte.'
        />
        <StatCard
          label='Sessões por dia (Higor)'
          value={String(Number(sessoesPorDiaHigor).toFixed(2))}
          hint='Média diária de sessões para Higor no recorte.'
        />
        <StatCard
          label='Sessões totais (Higor)'
          value={String(sessoesTotaisHigor)}
          hint='Total de sessões de Higor no recorte.'
        />
        <StatCard
          label='Lançamentos (todos)'
          value={String(lancamentosTodos)}
          hint='Número de registros exibidos no filtro.'
        />
      </section>

      <section className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]'>
        <div className='space-y-6'>
          <div className='rounded-3xl border border-border/70 bg-white/5 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.16)]'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div>
                <h2 className='text-xl font-medium text-foreground'>
                  {isAdmin ? 'Faturamentos dos usuários' : 'Meus lançamentos'}
                </h2>
                <p className='mt-1 text-sm text-muted'>
                  {isAdmin
                    ? 'Veja tudo por usuário, período e forma de pagamento.'
                    : 'Veja seus registros, edite e exclua quando precisar.'}
                </p>
              </div>

              <div className='flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface-soft px-3 py-3 text-xs text-muted md:min-w-80'>
                <div className='grid gap-2 sm:grid-cols-3'>
                  <div>
                    <label className='mb-1 block text-[10px] uppercase tracking-[0.18em]'>
                      De
                    </label>
                    <input
                      type='date'
                      className='w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent'
                      value={filterStartDate}
                      onChange={(event) =>
                        setFilterStartDate(event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className='mb-1 block text-[10px] uppercase tracking-[0.18em]'>
                      Até
                    </label>
                    <input
                      type='date'
                      className='w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent'
                      value={filterEndDate}
                      onChange={(event) => setFilterEndDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className='mb-1 block text-[10px] uppercase tracking-[0.18em]'>
                      Método
                    </label>
                    <select
                      className='w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent'
                      value={filterMethod}
                      onChange={(event) =>
                        setFilterMethod(
                          event.target.value as PaymentMethod | 'ALL',
                        )
                      }
                    >
                      <option value='ALL'>Todos</option>
                      <option value='PIX'>PIX</option>
                      <option value='BINANCE'>Binance</option>
                    </select>
                  </div>
                </div>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    Mostrando{' '}
                    <span className='font-semibold text-foreground'>
                      {visiblePayments.length}
                    </span>{' '}
                    de{' '}
                    <span className='font-semibold text-foreground'>
                      {payments.length}
                    </span>{' '}
                    lançamentos
                  </div>
                  <button
                    type='button'
                    className='rounded-xl border border-border/70 px-3 py-1.5 text-[11px] text-foreground transition hover:bg-white/5'
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterMethod('ALL');
                    }}
                  >
                    Limpar filtro
                  </button>
                </div>
              </div>
            </div>

            <div className='mt-5 overflow-x-auto'>
              <table className='min-w-full text-left text-sm'>
                <thead>
                  <tr className='border-b border-border/70 text-[11px] uppercase tracking-[0.2em] text-muted'>
                    {isAdmin ? <th className='py-3 pr-4'>Usuário</th> : null}
                    <th className='py-3 pr-4'>Data</th>
                    <th className='py-3 pr-4'>Sessões</th>
                    <th className='py-3 pr-4'>Valor</th>
                    <th className='py-3 pr-4'>Observação</th>
                    <th className='py-3 pr-4'>Criado em</th>
                    <th className='py-3'>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 7 : 6}
                        className='py-8 text-center text-muted'
                      >
                        Nenhum lançamento encontrado para o período filtrado.
                      </td>
                    </tr>
                  ) : (
                    visiblePayments.map((payment) => (
                      <tr
                        key={payment.id}
                        className='border-b border-border/50 last:border-b-0'
                      >
                        {isAdmin ? (
                          <td className='py-3 pr-4 text-foreground'>
                            {payment.userName}
                          </td>
                        ) : null}
                        <td className='py-3 pr-4 text-foreground'>
                          {payment.date}
                        </td>
                        
                        <td className='py-3 pr-4 text-foreground'>
                          {payment.sessions}
                        </td>
                        <td className='py-3 pr-4 font-mono text-foreground'>
                          {brl(payment.amountBRL)}
                        </td>
                        <td className='py-3 pr-4 text-muted'>
                          {payment.notes ? payment.notes : 'Sem observação'}
                        </td>
                        <td className='py-3 pr-4 text-muted'>
                          {formatDateTime(payment.createdAt)}
                        </td>
                        <td className='py-3'>
                          {!isAdmin ? (
                            <div className='flex flex-wrap gap-2'>
                              <button
                                type='button'
                                className='rounded-xl border border-border/70 px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5'
                                onClick={() => startEditingPayment(payment)}
                              >
                                Editar
                              </button>
                              <button
                                type='button'
                                className='rounded-xl border border-danger/30 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10'
                                onClick={() => void removePayment(payment.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          ) : (
                            <span className='text-sm text-muted'>Somente leitura</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isAdmin ? (
            <div className='rounded-3xl border border-border/70 bg-white/5 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.16)]'>
              <h2 className='text-xl font-medium text-foreground'>
                Resumo por usuário
              </h2>
              <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                {userSummaries.map((summary) => (
                  <article
                    key={summary.id}
                    className='rounded-2xl border border-border/70 bg-surface/70 p-4'
                  >
                    <p className='text-sm font-semibold text-foreground'>
                      {summary.name}
                    </p>
                    <p className='mt-2 text-xs uppercase tracking-[0.18em] text-muted'>
                      Faturamento
                    </p>
                    <p className='mt-1 text-lg font-semibold text-foreground'>
                      {brl(summary.amount)}
                    </p>
                    <p className='mt-2 text-xs text-muted'>
                      {summary.sessions} sessões em {summary.count} lançamentos
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>

          {!isAdmin ? (
            <aside className='h-fit rounded-3xl border border-border/70 bg-white/5 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-sm'>
          <h2 className='text-xl font-medium text-foreground'>
            {editingPaymentId ? 'Editar lançamento' : 'Novo lançamento'}
          </h2>
          <p className='mt-1 text-sm text-muted'>
            {editingPaymentId
              ? 'Altere os campos e salve para atualizar o registro.'
              : 'Cadastre um lançamento manualmente no Supabase.'}
          </p>

          <form className='mt-5 space-y-4' onSubmit={handlePaymentSubmit}>
            {isAdmin ? (
              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Usuário
                </label>
                <select
                  className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                  value={paymentDraft.userId}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      userId: event.target.value,
                    }))
                  }
                >
                  {profiles.map((profileRow) => (
                    <option key={profileRow.id} value={profileRow.id}>
                      {profileRow.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                Data
              </label>
              <input
                required
                type='date'
                className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                value={paymentDraft.date}
                onChange={(event) =>
                  setPaymentDraft((prev) => ({
                    ...prev,
                    date: event.target.value,
                  }))
                }
              />
            </div>

            <div className='grid gap-4'>
              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Sessões
                </label>
                <input
                  required
                  min='1'
                  step='1'
                  type='number'
                  inputMode='numeric'
                  className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                  value={paymentDraft.sessions}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      sessions: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className='grid gap-4'>
              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Valor por sessão
                </label>
                <div className='flex items-center'>
                  <span className='inline-flex items-center rounded-l-2xl border border-border/70 bg-surface-soft px-3 py-3 text-sm text-muted'>R$</span>
                  <input
                    required
                    min='0.01'
                    step='0.01'
                    type='text'
                    inputMode='decimal'
                    className='w-full rounded-r-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                    value={paymentDraft.unitPriceBRL}
                    onChange={(event) =>
                      setPaymentDraft((prev) => ({
                        ...prev,
                        unitPriceBRL: event.target.value,
                      }))
                    }
                    onBlur={(event) => {
                      const raw = event.target.value.toString().replace(',', '.').replace(/[^0-9.]/g, '');
                      const n = Number(raw || 0);
                      if (Number.isFinite(n) && n > 0) {
                        setPaymentDraft((prev) => ({
                          ...prev,
                          unitPriceBRL: n.toFixed(2),
                        }));
                      }
                    }}
                    placeholder='Ex.: 150.00'
                  />
                </div>
              </div>

              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Valor total
                </label>
                <div className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm font-mono text-foreground'>
                  {computedTotalNumber > 0 ? brl(computedTotalNumber) : 'R$ 0,00'}
                </div>
              </div>
            </div>

            <div>
              <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                Observação
              </label>
              <textarea
                rows={3}
                className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                value={paymentDraft.notes}
                onChange={(event) =>
                  setPaymentDraft((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder='Opcional'
              />
            </div>

            {paymentError ? (
              <p className='text-sm text-danger'>{paymentError}</p>
            ) : null}

            <div className='grid gap-3 sm:grid-cols-2'>
              {editingPaymentId ? (
                <button
                  type='button'
                  className='rounded-2xl border border-border/70 px-4 py-3 font-semibold text-foreground transition hover:bg-white/5'
                  onClick={() => resetPaymentDraft()}
                >
                  Cancelar
                </button>
              ) : null}
              <button
                type='submit'
                disabled={saving}
                className='w-full rounded-2xl bg-linear-to-r from-accent to-accent-soft px-4 py-3 font-semibold text-[#08101d] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70'
              >
                {saving
                  ? 'Salvando...'
                  : editingPaymentId
                    ? 'Salvar alterações'
                    : 'Salvar'}
              </button>
            </div>
          </form>
            </aside>
          ) : null}
      </section>
    </div>
  );
}
