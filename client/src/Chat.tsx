import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  getMessages,
  listConversations,
  sendMessage,
  type Conversation,
  type Message,
} from './api';
import Sidebar from './Sidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = { token: string; onLogout: () => void };

export default function Chat({ token, onLogout }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the chat changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Load the chat history once when the screen opens.
  useEffect(() => {
    listConversations(token)
      .then(setConversations)
      .catch(() => {});
  }, [token]);

  async function openConversation(id: number) {
    setError('');
    try {
      setMessages(await getMessages(token, id));
      setConversationId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat');
    }
  }

  function newChat() {
    setMessages([]);
    setConversationId(undefined);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);

    try {
      const result = await sendMessage(token, text, conversationId);
      setConversationId(result.conversationId);
      if (conversationId === undefined) {
        listConversations(token)
          .then(setConversations)
          .catch(() => {});
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={openConversation}
        onNewChat={newChat}
      />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">Groq Chat</h1>
        <button
          onClick={onLogout}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <p className="pt-20 text-center text-slate-400">
              Send a message to start chatting.
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
              }
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-900 shadow-sm'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none overflow-x-auto whitespace-normal">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}

          {sending && <p className="text-sm text-slate-400">Thinking...</p>}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-200 bg-white px-4 py-3"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}