import { useState } from 'react';
import type { Conversation } from './api';

type Props = {
  conversations: Conversation[];
  activeId: number | undefined;
  onSelect: (id: number) => void;
  onNewChat: () => void;
  onDelete: (id: number) => void | Promise<void>;
};

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<{
    id: number;
    top: number;
    left: number;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmTitle =
    conversations.find((c) => c.id === confirmId)?.title ?? '';

  async function confirmDelete() {
    if (confirmId === null) return;
    setDeleting(true);
    try {
      await onDelete(confirmId);
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-700 dark:bg-slate-800">
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          + New chat
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-400 dark:text-slate-500">
            No chats yet.
          </p>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg transition ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-900'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className={`block min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                  active
                    ? 'font-medium text-indigo-700 dark:text-indigo-200'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {c.title}
              </button>
              <button
                aria-label="Chat options"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ id: c.id, top: r.bottom + 4, left: r.left });
                }}
                className={`mr-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-200 focus:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600 ${
                  menu?.id === c.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                ⋯
              </button>
            </div>
          );
        })}
      </nav>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
          <div
            style={{ top: menu.top, left: menu.left }}
            className="fixed z-20 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          >
            <button
              onClick={() => {
                setConfirmId(menu.id);
                setMenu(null);
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-slate-700"
            >
              🗑 Delete
            </button>
          </div>
        </>
      )}

      {confirmId !== null && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Delete chat?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              &ldquo;{confirmTitle}&rdquo; will be removed from your chat list.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                disabled={deleting}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}