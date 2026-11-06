import type { Conversation } from './api';

type Props = {
  conversations: Conversation[];
  activeId: number | undefined;
  onSelect: (id: number) => void;
  onNewChat: () => void;
};

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: Props) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
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
          <p className="px-2 py-4 text-sm text-slate-400">No chats yet.</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${
              c.id === activeId
                ? 'bg-indigo-50 font-medium text-indigo-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {c.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}