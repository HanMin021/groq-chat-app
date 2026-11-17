import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  listAgentCaseMessages,
  listCaseMessages,
  sendAgentCaseMessage,
  sendCaseMessage,
  type CaseMessage,
} from './api';

type Props = {
  token: string;
  caseId: number;
  // Who is looking at the conversation. Decides which routes are used.
  viewer: 'customer' | 'agent';
  // Customers cannot reply on a closed case.
  closed?: boolean;
};

const POLL_MS = 5000;

export default function CaseConversation({
  token,
  caseId,
  viewer,
  closed,
}: Props) {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Load the messages now, then check for new ones every few seconds.
  useEffect(() => {
    let cancelled = false;
    const load = viewer === 'agent' ? listAgentCaseMessages : listCaseMessages;

    async function refresh() {
      if (document.hidden) return; // do nothing while the tab is in the background
      try {
        const data = await load(token, caseId);
        if (!cancelled) {
          setMessages(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load messages'
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, caseId, viewer]);

  // Scroll to the newest message when the number of messages changes.
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const send = viewer === 'agent' ? sendAgentCaseMessage : sendCaseMessage;
      setMessages(await send(token, caseId, body));
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  const cannotReply = viewer === 'customer' && closed;

  return (
    <div className="space-y-3">
      <div
        ref={listRef}
        className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3 dark:bg-slate-900"
      >
        {loaded && messages.length === 0 && (
          <p className="text-sm text-slate-400">
            {viewer === 'customer'
              ? 'No messages yet. A support agent will reply here.'
              : 'No messages yet. Write to the customer below.'}
          </p>
        )}
        {!loaded && <p className="text-sm text-slate-400">Loading messages...</p>}

        {messages.map((m) => {
          const mine = m.sender_role === viewer;
          return (
            <div
              key={m.id}
              className={mine ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`mt-1 text-xs ${
                    mine ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  {m.sender_role === 'agent' ? 'Support agent' : 'Customer'} ·{' '}
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {cannotReply ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This case is closed. Open a new case if you need more help.
        </p>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={
              viewer === 'customer'
                ? 'Write a reply to the support team...'
                : 'Write a reply to the customer...'
            }
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}