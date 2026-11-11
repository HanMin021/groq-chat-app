import { useCallback, useEffect, useState } from 'react';
import { listAgentCases, type AgentCaseSummary } from './api';
import CaseDetail from './CaseDetail';

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

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200';

export default function AgentDashboard({ token, onBack, onLogout }: Props) {
  const [cases, setCases] = useState<AgentCaseSummary[]>([]);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCases(await listAgentCases(token, { status, severity }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cases');
    } finally {
      setLoading(false);
    }
  }, [token, status, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Agent dashboard
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

      <div className="flex min-h-0 flex-1">
        {/* Left side: filters and the case list */}
        <section className="flex w-full min-w-0 flex-col border-r border-slate-200 md:w-1/2 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className={selectClass}
              aria-label="Filter by severity"
            >
              <option value="">All severities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={load}
              className="ml-auto rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              ↻ Refresh
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loading && (
              <p className="p-2 text-sm text-slate-400">Loading cases...</p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            {!loading && !error && cases.length === 0 && (
              <p className="p-2 text-sm text-slate-400">No cases found.</p>
            )}

            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`block w-full rounded-xl border px-4 py-3 text-left transition ${
                  c.id === selectedId
                    ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    #{c.id} {c.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      severityStyle[c.severity] ?? ''
                    }`}
                  >
                    {c.severity}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{statusLabel[c.status] ?? c.status}</span>
                  <span>{c.customer_email}</span>
                  <span>
                    {c.assigned_email
                      ? `Assigned: ${c.assigned_email}`
                      : 'Unassigned'}
                  </span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

                {/* Right side: case details */}
        <section className="hidden min-w-0 flex-1 overflow-y-auto md:block">
          {selectedId === null ? (
            <p className="p-6 text-sm text-slate-400">
              Select a case to see its details.
            </p>
          ) : (
            <CaseDetail
              key={selectedId}
              token={token}
              caseId={selectedId}
              onChanged={load}
            />
          )}
        </section>
      </div>
    </div>
  );
}