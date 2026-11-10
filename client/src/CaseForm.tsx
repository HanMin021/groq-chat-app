import { useState, type FormEvent } from 'react';
import { createCase, type CaseDraft } from './api';

type Props = {
  token: string;
  conversationId: number | undefined;
  draft: CaseDraft;
};

export default function CaseForm({ token, conversationId, draft }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [severity, setSeverity] = useState<CaseDraft['severity']>(
    draft.severity
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [caseNumber, setCaseNumber] = useState<number | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await createCase(token, {
        title,
        description,
        severity,
        conversationId,
      });
      setCaseNumber(result.caseNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the case');
    } finally {
      setSubmitting(false);
    }
  }

  if (caseNumber !== null) {
    return (
      <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
        Your case has been opened. Case number: <strong>#{caseNumber}</strong>.
        A support agent will review it.
      </div>
    );
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Support case
      </h2>

      <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          className={fieldClass}
        />
      </label>

      <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={5000}
          required
          className={fieldClass}
        />
      </label>

      <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
        Severity
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as CaseDraft['severity'])}
          className={fieldClass}
        >
          <option value="urgent">Urgent (Severity 1)</option>
          <option value="high">High (Severity 2)</option>
          <option value="medium">Medium (Severity 3)</option>
          <option value="low">Low (Severity 4)</option>
        </select>
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !title.trim() || !description.trim()}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {submitting ? 'Submitting...' : 'Submit case'}
      </button>
    </form>
  );
}