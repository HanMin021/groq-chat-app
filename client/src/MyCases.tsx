import { useEffect, useState } from 'react';
import { listMyCases, type MyCase } from './api';
import CaseConversation from './CaseConversation';

type Props = { token: string; onBack: () => void; onLogout: () => void };

const severityStyle: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const statusLabel: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const statusStyle: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  resolved:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

export default function MyCases({ token, onBack, onLogout }: Props) {
  const [cases, setCases] = useState<MyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyCases(token)
      .then((data) => {
        // Newest case first.
        if (!cancelled) setCases([...data].sort((a, b) => b.id - a.id));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load your cases'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          My cases
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            ← Back to chat
          </button>
          <button
            onClick={onLogout}
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {loading && (
            <p className="text-sm text-slate-400">Loading your cases...</p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {!loading && !error && cases.length === 0 && (
            <p className="pt-16 text-center text-slate-400">
              You haven’t opened any cases yet. Use “📝 Open a case” in the chat
              to create one.
            </p>
          )}

          {cases.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  #{c.id} {c.title}
                </h2>
                <div className="flex shrink-0 gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusStyle[c.status] ?? ''
                    }`}
                  >
                    {statusLabel[c.status] ?? c.status}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      severityStyle[c.severity] ?? ''
                    }`}
                  >
                    {c.severity}
                  </span>
                </div>
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">
                {c.description}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                Opened {new Date(c.created_at).toLocaleString()} · Last updated{' '}
                {new Date(c.updated_at).toLocaleString()}
              </p>

              <button
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                className="mt-3 rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {openId === c.id ? 'Hide messages' : '💬 Messages'}
              </button>

              {openId === c.id && (
                <div className="mt-3">
                  <CaseConversation
                    token={token}
                    caseId={c.id}
                    viewer="customer"
                    closed={c.status === 'closed'}
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}