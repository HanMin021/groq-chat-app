import { useEffect, useState, type FormEvent } from 'react';
import {
  addKbArticle,
  listKbArticles,
  updateKbArticle,
  type KbArticle,
} from './api';

type Props = { token: string; onBack: () => void; onLogout: () => void };

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400';

const smallButton =
  'rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600';

export default function KnowledgeBase({ token, onBack, onLogout }: Props) {
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // null = form closed, 'new' = adding an article, a number = editing that article
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listKbArticles(token)
      .then((data) => {
        if (!cancelled) setArticles(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load articles'
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

  function startNew() {
    setTitle('');
    setContent('');
    setKeywords('');
    setError('');
    setEditing('new');
  }

  function startEdit(a: KbArticle) {
    setTitle(a.title);
    setContent(a.content);
    setKeywords(a.keywords);
    setError('');
    setEditing(a.id);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (editing === null || saving) return;
    setSaving(true);
    setError('');
    try {
      const data = { title, content, keywords };
      setArticles(
        editing === 'new'
          ? await addKbArticle(token, data)
          : await updateKbArticle(token, editing, data)
      );
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save article');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: KbArticle) {
    setError('');
    try {
      setArticles(await updateKbArticle(token, a.id, { isActive: !a.is_active }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update article');
    }
  }

  // The add/edit form. It is shown at the top for a new article, and in the
  // place of the article's own card when editing an existing one.
  function renderForm() {
    return (
      <form
        onSubmit={handleSave}
        className="space-y-3 rounded-xl border border-indigo-300 bg-white p-4 dark:border-indigo-700 dark:bg-slate-800"
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {editing === 'new' ? 'New article' : 'Edit article'}
        </h2>
        <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
          Content
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={10000}
            required
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
          Keywords (separate with spaces, used to find this article)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className={smallButton}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Knowledge base
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className={smallButton}>
            ← Back
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
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The assistant answers from the <strong>active</strong> articles
              only.
            </p>
            <button
              onClick={startNew}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              + New article
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {editing === 'new' && renderForm()}

          {loading && (
            <p className="text-sm text-slate-400">Loading articles...</p>
          )}

          {articles.map((a) =>
            editing === a.id ? (
              <div key={a.id}>{renderForm()}</div>
            ) : (
              <article
                key={a.id}
                className={`space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 ${
                  a.is_active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {a.title}
                  </h2>
                  <div className="flex shrink-0 gap-2">
                    {a.is_sample && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Sample
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.is_active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {a.is_active ? 'Active' : 'Off'}
                    </span>
                  </div>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                  {a.content}
                </p>
                {a.keywords && (
                  <p className="text-xs text-slate-400">
                    Keywords: {a.keywords}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => startEdit(a)} className={smallButton}>
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(a)}
                    className={smallButton}
                  >
                    {a.is_active ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
              </article>
            )
          )}
        </div>
      </main>
    </div>
  );
}