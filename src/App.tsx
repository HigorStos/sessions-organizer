import { FormEvent, useMemo, useState } from 'react';
import {
  brl,
  buildSessionEntry,
  getTodayDate,
  isSunday,
  loadSessions,
  loadSettings,
  saveSessions,
  saveSettings,
  SESSION_PRICE,
  SUNDAY_SESSION_PRICE,
} from './lib/session-storage';
import type {
  OrganizerSettings,
  OrganizerSettingsDraft,
  SessionDraft,
  SessionEntry,
} from './types/session';

const TODAY = getTodayDate();

const defaultSettingsDraft: OrganizerSettingsDraft = {
  name: '',
  sessionPrice: SESSION_PRICE,
  sundaySessionPrice: SUNDAY_SESSION_PRICE,
};

const initialDraft: SessionDraft = {
  date: TODAY,
  sessions: 1,
  note: '',
  useSundayBonus: false,
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

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

  return dateFormatter.format(parsed);
}

export default function App() {
  const storedSettings = useMemo(() => loadSettings(), []);
  const [settings, setSettings] = useState<OrganizerSettings | null>(
    storedSettings,
  );
  const [entries, setEntries] = useState<SessionEntry[]>(() => loadSessions());
  const [draft, setDraft] = useState<SessionDraft>(initialDraft);
  const [setupDraft, setSetupDraft] = useState<OrganizerSettingsDraft>(
    storedSettings ?? defaultSettingsDraft,
  );
  const [showSetup, setShowSetup] = useState(storedSettings === null);
  const [setupError, setSetupError] = useState<string>('');
  const [error, setError] = useState<string>('');

  const activeSettings = settings ?? setupDraft;

  const metrics = useMemo(() => {
    const totalSessions = entries.reduce(
      (acc, entry) => acc + entry.sessions,
      0,
    );
    const totalAmount = entries.reduce(
      (acc, entry) => acc + entry.amountBRL,
      0,
    );
    const todayEntries = entries.filter((entry) => entry.date === TODAY);
    const todaySessions = todayEntries.reduce(
      (acc, entry) => acc + entry.sessions,
      0,
    );
    const todayAmount = todayEntries.reduce(
      (acc, entry) => acc + entry.amountBRL,
      0,
    );
    const avgTicket = totalSessions > 0 ? totalAmount / totalSessions : 0;

    return {
      totalSessions,
      totalAmount,
      todaySessions,
      todayAmount,
      avgTicket,
    };
  }, [entries]);

  const previewUnitPrice =
    draft.useSundayBonus && isSunday(draft.date)
      ? activeSettings.sundaySessionPrice
      : activeSettings.sessionPrice;
  const previewAmount =
    Math.max(1, Math.round(Number(draft.sessions) || 0)) * previewUnitPrice;

  function updateAndPersist(nextEntries: SessionEntry[]) {
    setEntries(nextEntries);
    saveSessions(nextEntries);
  }

  function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const sessionPrice = Number(setupDraft.sessionPrice);
    const sundaySessionPrice = Number(setupDraft.sundaySessionPrice);
    const name = setupDraft.name.trim();

    if (!name) {
      setSetupError('Informe seu nome.');
      return;
    }

    if (
      !Number.isFinite(sessionPrice) ||
      sessionPrice <= 0 ||
      !Number.isFinite(sundaySessionPrice) ||
      sundaySessionPrice <= 0
    ) {
      setSetupError('Informe valores validos para as sessions.');
      return;
    }

    const nextSettings: OrganizerSettings = {
      name,
      sessionPrice: Number(sessionPrice.toFixed(2)),
      sundaySessionPrice: Number(sundaySessionPrice.toFixed(2)),
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);
    setShowSetup(false);
    setSetupError('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const sessions = Math.round(Number(draft.sessions));

    if (!draft.date) {
      setError('Informe a data da insercao.');
      return;
    }

    if (!Number.isFinite(sessions) || sessions < 1) {
      setError('Informe pelo menos 1 session.');
      return;
    }

    const nextEntry = buildSessionEntry(
      {
        ...draft,
        sessions,
        note: draft.note.trim(),
      },
      activeSettings,
    );

    const nextEntries = [nextEntry, ...entries].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    updateAndPersist(nextEntries);
    setDraft({ ...initialDraft, date: draft.date || TODAY });
    setError('');
  }

  function removeEntry(id: string) {
    const nextEntries = entries.filter((entry) => entry.id !== id);
    updateAndPersist(nextEntries);
  }

  return (
    <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10'>
      {showSetup ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-[#05070dcc] px-4 py-8 backdrop-blur-sm'>
          <form
            className='w-full max-w-xl rounded-4xl border border-border/80 bg-surface p-6 shadow-[0_32px_100px_rgba(0,0,0,0.45)] md:p-8'
            onSubmit={handleSetupSubmit}
          >
            <p className='text-[11px] uppercase tracking-[0.34em] text-accent-soft'>
              Primeiro acesso
            </p>
            <h2 className='mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl'>
              Vamos configurar seu perfil
            </h2>
            <p className='mt-2 text-sm leading-6 text-muted'>
              Informe seu nome e os valores padrão para cada session. O valor de
              domingo só entra quando o switch estiver ligado no lançamento.
            </p>

            <div className='mt-6 grid gap-4'>
              <div>
                <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Seu nome
                </label>
                <input
                  required
                  type='text'
                  className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                  value={setupDraft.name}
                  onChange={(event) =>
                    setSetupDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder='Ex.: Juka'
                />
              </div>

              <div className='grid gap-4 md:grid-cols-2'>
                <div>
                  <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                    Valor da session
                  </label>
                  <input
                    required
                    min='0.01'
                    step='0.01'
                    type='number'
                    inputMode='decimal'
                    className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                    value={setupDraft.sessionPrice}
                    onChange={(event) =>
                      setSetupDraft((prev) => ({
                        ...prev,
                        sessionPrice: Number(event.target.value),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                    Valor da session no domingo
                  </label>
                  <input
                    required
                    min='0.01'
                    step='0.01'
                    type='number'
                    inputMode='decimal'
                    className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                    value={setupDraft.sundaySessionPrice}
                    onChange={(event) =>
                      setSetupDraft((prev) => ({
                        ...prev,
                        sundaySessionPrice: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {setupError ? (
              <p className='mt-4 text-sm text-danger'>{setupError}</p>
            ) : null}

            <button
              type='submit'
              className='mt-6 w-full rounded-2xl bg-linear-to-r from-accent to-accent-soft px-4 py-3 font-semibold text-[#08101d] transition hover:brightness-110'
            >
              Salvar perfil
            </button>
          </form>
        </div>
      ) : null}

      <header className='overflow-hidden rounded-4xl border border-border/70 bg-linear-to-br from-surface via-[#0b1324] to-[#05070d] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.45)] md:p-8'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.34em] text-accent-soft'>
              Sessions Organizer{settings ? ` · ${settings.name}` : ''}
            </p>
            <h1 className='mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-5xl'>
              Controle rapido de sessions
            </h1>
            <p className='mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base'>
              Registre cada insercao do dia sem login, com salvamento automatico
              no dispositivo. Cada session segue o valor configurado no seu
              perfil, com opcao de valor especial para domingo.
            </p>
          </div>

          <div className='flex flex-col gap-3 rounded-2xl border border-border/70 bg-white/5 px-4 py-3 text-sm text-muted backdrop-blur-sm'>
            <div>
              <p className='text-[11px] uppercase tracking-[0.24em] text-accent-soft'>
                Valor base
              </p>
              <p className='mt-1 text-xl font-semibold text-foreground'>
                {brl(activeSettings.sessionPrice)} por session
              </p>
            </div>
            <div>
              <p className='text-[11px] uppercase tracking-[0.24em] text-accent-soft'>
                Domingo
              </p>
              <p className='mt-1 text-xl font-semibold text-foreground'>
                {brl(activeSettings.sundaySessionPrice)} por session
              </p>
            </div>
            {settings ? (
              <button
                type='button'
                className='rounded-xl border border-border/70 px-3 py-2 text-xs text-foreground transition hover:bg-white/5'
                onClick={() => {
                  setSetupDraft(settings);
                  setSetupError('');
                  setShowSetup(true);
                }}
              >
                Editar perfil
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label='Sessions totais'
          value={String(metrics.totalSessions)}
          hint='Somatorio acumulado de todas as insercoes.'
        />
        <StatCard
          label='Total recebido'
          value={brl(metrics.totalAmount)}
          hint='Calculado automaticamente a partir das sessions registradas.'
        />
        <StatCard
          label='Sessions hoje'
          value={String(metrics.todaySessions)}
          hint='Filtrado pela data de hoje.'
        />
        <StatCard
          label='Recebido hoje'
          value={brl(metrics.todayAmount)}
          hint='Atualiza a cada nova insercao salva.'
        />
      </section>

      <section className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]'>
        <div className='space-y-6'>
          <div className='rounded-3xl border border-border/70 bg-white/5 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.16)]'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div>
                <h2 className='text-xl font-medium text-foreground'>
                  Historico de insercoes
                </h2>
                <p className='mt-1 text-sm text-muted'>
                  Cada linha representa um envio feito durante o dia.
                </p>
              </div>
              <div className='rounded-full border border-border/70 bg-surface-soft px-3 py-2 text-xs text-muted'>
                Ticket medio:{' '}
                <span className='font-semibold text-foreground'>
                  {brl(metrics.avgTicket)}
                </span>
              </div>
            </div>

            <div className='mt-5 overflow-x-auto'>
              <table className='min-w-full text-left text-sm'>
                <thead>
                  <tr className='border-b border-border/70 text-[11px] uppercase tracking-[0.2em] text-muted'>
                    <th className='py-3 pr-4'>Data</th>
                    <th className='py-3 pr-4'>Sessions</th>
                    <th className='py-3 pr-4'>Valor</th>
                    <th className='py-3 pr-4'>Bonus domingo</th>
                    <th className='py-3 pr-4'>Observacao</th>
                    <th className='py-3 pr-4'>Criado em</th>
                    <th className='py-3'>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className='py-8 text-center text-muted'>
                        Nenhuma insercao salva ainda. Use o formulario ao lado.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className='border-b border-border/50 last:border-b-0'
                      >
                        <td className='py-3 pr-4 text-foreground'>
                          {entry.date}
                        </td>
                        <td className='py-3 pr-4 text-foreground'>
                          {entry.sessions}
                        </td>
                        <td className='py-3 pr-4 font-mono text-foreground'>
                          {brl(entry.amountBRL)}
                        </td>
                        <td className='py-3 pr-4 text-muted'>
                          {entry.useSundayBonus ? 'Sim' : 'Nao'}
                        </td>
                        <td className='py-3 pr-4 text-muted'>
                          {entry.note ? entry.note : 'Sem observacao'}
                        </td>
                        <td className='py-3 pr-4 text-muted'>
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className='py-3'>
                          <button
                            type='button'
                            className='rounded-xl border border-danger/30 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10'
                            onClick={() => removeEntry(entry.id)}
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className='h-fit rounded-3xl border border-border/70 bg-white/5 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-sm'>
          <h2 className='text-xl font-medium text-foreground'>
            Inserir sessions
          </h2>
          <p className='mt-1 text-sm text-muted'>
            Preencha a quantidade, informe se o lancamento usa o bonus de
            domingo e envie para salvar no localStorage.
          </p>

          <form className='mt-5 space-y-4' onSubmit={handleSubmit}>
            <div>
              <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                Data
              </label>
              <input
                required
                type='date'
                className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                value={draft.date}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, date: event.target.value }))
                }
              />
            </div>

            <div>
              <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                Quantidade de sessions
              </label>
              <input
                required
                min='1'
                step='1'
                type='number'
                inputMode='numeric'
                className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                value={draft.sessions || ''}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    sessions: Number(event.target.value),
                  }))
                }
                placeholder='Ex.: 18'
              />
              <p className='mt-2 text-xs text-muted'>
                Cada session adiciona {brl(previewUnitPrice)} ao total com a
                configuracao atual.
              </p>
            </div>

            <button
              type='button'
              role='switch'
              aria-checked={draft.useSundayBonus}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                draft.useSundayBonus
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-border bg-surface-soft'
              }`}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  useSundayBonus: !prev.useSundayBonus,
                }))
              }
            >
              <span>
                <span className='block text-[11px] uppercase tracking-[0.2em] text-muted'>
                  Bonus de domingo
                </span>
                <span className='mt-1 block text-sm text-foreground'>
                  Aplicar o valor especial de domingo quando a data for domingo.
                </span>
              </span>
              <span
                className={`relative inline-flex h-8 w-14 items-center rounded-full border transition ${
                  draft.useSundayBonus
                    ? 'border-accent/60 bg-accent'
                    : 'border-border bg-[#111827]'
                }`}
              >
                <span
                  className={`ml-1 inline-block h-6 w-6 rounded-full bg-white transition ${
                    draft.useSundayBonus ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            <div>
              <label className='mb-1 block text-[11px] uppercase tracking-[0.2em] text-muted'>
                Observacao
              </label>
              <textarea
                rows={3}
                className='w-full rounded-2xl border border-border bg-surface-soft px-3 py-3 text-sm outline-none transition focus:border-accent'
                value={draft.note}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder='Opcional'
              />
            </div>

            <div className='rounded-2xl border border-border/70 bg-surface/70 p-4'>
              <p className='text-[11px] uppercase tracking-[0.2em] text-muted'>
                Resumo da insercao
              </p>
              <p className='mt-2 text-sm text-muted'>Sessions informadas</p>
              <p className='text-2xl font-semibold text-foreground'>
                {Math.max(1, Math.round(Number(draft.sessions) || 0))}
              </p>
              <p className='mt-3 text-sm text-muted'>Valor unitario aplicado</p>
              <p className='text-2xl font-semibold text-foreground'>
                {brl(previewUnitPrice)}
              </p>
              <p className='mt-3 text-sm text-muted'>Total estimado</p>
              <p className='text-2xl font-semibold text-foreground'>
                {brl(previewAmount)}
              </p>
              <p className='mt-3 text-xs text-muted'>
                {draft.useSundayBonus && isSunday(draft.date)
                  ? 'Bonus de domingo ativo para esta data.'
                  : 'O bonus de domingo so altera o valor quando a data for domingo.'}
              </p>
            </div>

            {error ? <p className='text-sm text-danger'>{error}</p> : null}

            <button
              type='submit'
              className='w-full rounded-2xl bg-linear-to-r from-accent to-accent-soft px-4 py-3 font-semibold text-[#08101d] transition hover:brightness-110'
            >
              Inserir
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}
