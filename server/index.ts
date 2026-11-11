import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { SYSTEM_PROMPT, VOICE_MODE_PROMPT } from './knowledge.js';
import { getPool } from './db.js';
import { authRouter } from './auth.js';
import { requireAuth, requireAgent } from './middleware.js';
import {
  createConversation,
  conversationBelongsToUser,
  getMessages,
  addMessage,
    listConversations,
  deleteConversation,
  type ChatMessage,
} from './chats.js';
import {
  listCasesForUser,
  createCase,
  parseNewCase,
    validateNewCase,
  CASE_FORM_TOOL,
  CASE_STATUSES,
  listAllCases,
  getCaseDetail,
  setCaseStatus,
  assignCase,
    listAgents,
  listCaseNotes,
  addCaseNote,
} from './cases.js';
import { searchKnowledge, SEARCH_KNOWLEDGE_TOOL } from './kb.js';
import { getUserProfile } from './users.js';

// Load environment variables from the .env file
dotenv.config();

// Initialize the client. It automatically looks for process.env.GROQ_API_KEY
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/auth', authRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/db-health', async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT DB_NAME() AS db, SUSER_SNAME() AS login');
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.post('/chat', requireAuth, async (req, res) => {
  const { message, conversationId, voice } = req.body;

  if (typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const userId: number = res.locals.userId;

    let convId: number;
    let history: ChatMessage[] = [];

    if (conversationId === undefined) {
      convId = await createConversation(userId, message.trim().slice(0, 50));
    } else {
      convId = Number(conversationId);
      if (
        !Number.isInteger(convId) ||
        !(await conversationBelongsToUser(convId, userId))
      ) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      history = await getMessages(convId);
    }

    await addMessage(convId, 'user', message);

    const chatMessages: any[] = [
      {
        role: 'system',
        content:
          voice === true
            ? `${SYSTEM_PROMPT}\n\n## Voice mode\n${VOICE_MODE_PROMPT}`
            : SYSTEM_PROMPT,
      },
      ...history,
      { role: 'user', content: message },
    ];

    const tools = [SEARCH_KNOWLEDGE_TOOL, CASE_FORM_TOOL];
    const model = 'openai/gpt-oss-120b';

    let caseForm:
      | { title: string; description: string; severity: string }
      | undefined;

    let completion = await groq.chat.completions.create({
      messages: chatMessages,
      model,
      tools,
    });

    // The AI may use tools several times (for example search, then show the form).
    for (let round = 0; round < 4; round++) {
      const toolCalls = completion.choices[0]?.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      chatMessages.push({
        role: 'assistant',
        content: completion.choices[0]?.message?.content ?? '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let result: object;

        if (call.function.name === 'search_knowledge') {
          let query = '';
          try {
            query = String(JSON.parse(call.function.arguments).query ?? '');
          } catch {
            query = '';
          }
          const articles = await searchKnowledge(query);
          result =
            articles.length > 0
              ? {
                  found: true,
                  articles: articles.map((a) => ({
                    title: a.title,
                    content: a.content,
                  })),
                }
              : {
                  found: false,
                  note: 'No matching article. Tell the customer you are not sure and show the case form.',
                };
        } else if (call.function.name === 'open_case_form') {
          const draft = parseNewCase(call.function.arguments, convId);
          if (draft) {
            caseForm = {
              title: draft.title,
              description: draft.description,
              severity: draft.severity,
            };
            result = {
              ok: true,
              note: 'The case form is now shown to the customer. Tell them to check the details and press Submit. The case is NOT opened until they submit it.',
            };
          } else {
            result = { ok: false, error: 'Invalid case details' };
          }
        } else {
          result = { ok: false, error: 'Unknown tool' };
        }

        chatMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }

      completion = await groq.chat.completions.create({
        messages: chatMessages,
        model,
        tools,
      });
    }

    const reply =
      completion.choices[0]?.message?.content ||
      'Sorry, I could not answer that. Please try again, or use the Open a case button.';

    await addMessage(convId, 'assistant', reply);
    res.json({ conversationId: convId, reply, caseForm });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response from Groq' });
  }
});

app.get('/me', requireAuth, async (_req, res) => {
  try {
    const user = await getUserProfile(res.locals.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

app.get('/conversations', requireAuth, async (_req, res) => {
  try {
    const conversations = await listConversations(res.locals.userId);
    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

app.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (
      !Number.isInteger(id) ||
      !(await conversationBelongsToUser(id, res.locals.userId))
    ) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(await getMessages(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (
      !Number.isInteger(id) ||
      !(await conversationBelongsToUser(id, res.locals.userId))
    ) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    await deleteConversation(id, res.locals.userId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

app.get('/cases', requireAuth, async (_req, res) => {
  try {
    res.json(await listCasesForUser(res.locals.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
});

app.post('/cases', requireAuth, async (req, res) => {
  const newCase = validateNewCase(req.body);
  if (!newCase) {
    res
      .status(400)
      .json({ error: 'Please fill in the title, description and severity.' });
    return;
  }

  try {
    const userId: number = res.locals.userId;
    if (
      newCase.conversationId !== undefined &&
      !(await conversationBelongsToUser(newCase.conversationId, userId))
    ) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const caseNumber = await createCase(userId, newCase);
    res.status(201).json({ caseNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// ---------- Agent routes: logged in AND role = agent ----------

const SEVERITY_VALUES = ['low', 'medium', 'high', 'urgent'];

app.get('/agent/cases', requireAuth, requireAgent, async (req, res) => {
  const status =
    typeof req.query.status === 'string' && req.query.status !== ''
      ? req.query.status
      : undefined;
  const severity =
    typeof req.query.severity === 'string' && req.query.severity !== ''
      ? req.query.severity
      : undefined;

  if (
    (status && !CASE_STATUSES.includes(status)) ||
    (severity && !SEVERITY_VALUES.includes(severity))
  ) {
    res.status(400).json({ error: 'Invalid filter' });
    return;
  }

  try {
    res.json(await listAllCases({ status, severity }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
});

app.get('/agent/agents', requireAuth, requireAgent, async (_req, res) => {
  try {
    res.json(await listAgents());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

app.get('/agent/cases/:id', requireAuth, requireAgent, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  try {
    const detail = await getCaseDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load case' });
  }
});

app.patch('/agent/cases/:id', requireAuth, requireAgent, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }

  const { status, assignedTo } = req.body ?? {};
  if (status === undefined && assignedTo === undefined) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }
  if (
    status !== undefined &&
    (typeof status !== 'string' || !CASE_STATUSES.includes(status))
  ) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  if (
    assignedTo !== undefined &&
    assignedTo !== null &&
    !Number.isInteger(assignedTo)
  ) {
    res.status(400).json({ error: 'Invalid assignee' });
    return;
  }

  try {
    if (status !== undefined && !(await setCaseStatus(id, status))) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    if (assignedTo !== undefined && !(await assignCase(id, assignedTo))) {
      res
        .status(400)
        .json({ error: 'Case not found, or that user is not an agent' });
      return;
    }
    res.json(await getCaseDetail(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

app.get(
  '/agent/cases/:id/notes',
  requireAuth,
  requireAgent,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    try {
      res.json(await listCaseNotes(id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load notes' });
    }
  }
);

app.post(
  '/agent/cases/:id/notes',
  requireAuth,
  requireAgent,
  async (req, res) => {
    const id = Number(req.params.id);
    const note = req.body?.note;
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    if (
      typeof note !== 'string' ||
      note.trim() === '' ||
      note.length > 5000
    ) {
      res.status(400).json({ error: 'Please write a note (up to 5000 characters).' });
      return;
    }
    try {
      const saved = await addCaseNote(id, res.locals.userId, note.trim());
      if (!saved) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      res.status(201).json(await listCaseNotes(id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save note' });
    }
  }
);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});