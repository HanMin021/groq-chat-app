import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  getMessages,
  listConversations,
  sendMessage,
    type Conversation,
  type Message,
  type CaseDraft,
} from './api';
import Sidebar from './Sidebar';
import CaseForm from './CaseForm';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSpeechRecognition } from './useSpeechRecognition';
import { speak, speechOutputSupported, stopSpeaking } from './speech';
import { useTheme } from './useTheme';

type Props = { token: string; onLogout: () => void };

export default function Chat({ token, onLogout }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [voiceLang, setVoiceLang] = useState('en-US');
  const voice = useSpeechRecognition(voiceLang, (text) => setInput(text));
  const [speakReplies, setSpeakReplies] = useState(false);
    const [caseDraft, setCaseDraft] = useState<{
    draft: CaseDraft;
    id: number;
  } | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Stop speaking if the chat screen closes.
  useEffect(() => stopSpeaking, []);

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
        stopSpeaking();
    setCaseDraft(null);
    try {
      setMessages(await getMessages(token, id));
      setConversationId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat');
    }
  }

  function newChat() {
    stopSpeaking();
        setMessages([]);
    setCaseDraft(null);
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
      const result = await sendMessage(token, text, conversationId, speakReplies);
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
            if (speakReplies) speak(result.reply, voiceLang);
                  if (result.caseForm) {
        setCaseDraft({ draft: result.caseForm, id: Date.now() });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
       <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={openConversation}
        onNewChat={newChat}
      />
      <div className="flex min-w-0 flex-1 flex-col">
             <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Groq Chat</h1>
                <div className="flex items-center gap-4">
          {speechOutputSupported && (
            <button
              onClick={() => {
                if (speakReplies) stopSpeaking();
                setSpeakReplies(!speakReplies);
              }}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                                speakReplies
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {speakReplies ? '🔊 Voice on' : '🔈 Voice off'}
            </button>
          )}
                    <button
            onClick={toggleTheme}
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
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
                    : 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none overflow-x-auto whitespace-normal dark:prose-invert">
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
                    {caseDraft && (
            <CaseForm
              key={caseDraft.id}
              token={token}
              conversationId={conversationId}
              draft={caseDraft.draft}
            />
          )}

          {sending && <p className="text-sm text-slate-400">Thinking...</p>}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
                    {voice.error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {voice.error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
                    {voice.supported && (
            <>
              <select
                value={voiceLang}
                onChange={(e) => setVoiceLang(e.target.value)}
                title="Voice language"
                className="rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                <option value="en-US">English</option>
                <option value="ms-MY">Bahasa Melayu</option>
                <option value="zh-CN">普通话</option>
                <option value="yue-Hant-HK">粵語</option>
              </select>
              <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  voice.listening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {voice.listening ? 'Stop' : '🎤 Speak'}
              </button>
            </>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
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