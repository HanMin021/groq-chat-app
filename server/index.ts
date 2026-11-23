import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
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
import {
  searchKnowledge,
  SEARCH_KNOWLEDGE_TOOL,
  listAllArticles,
  addArticle,
  updateArticle,
} from './kb.js';
import { getUserProfile } from './users.js';
import {
  getCaseOwnerAndStatus,
  listCaseMessages,
  addCaseMessage,
  forCustomer,
} from './caseMessages.js';
import {
  chatSchema,
  newCaseSchema,
  caseUpdateSchema,
  noteSchema,
  idSchema,
  caseMessageSchema,
  kbArticleSchema,
  kbUpdateSchema,
  validationMessage,
} from './validation.js';

// Load environment variables from the .env file
dotenv.config();

// Refuse to start with a missing or weak login-token secret.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error(
    'JWT_SECRET is missing or too short (use at least 32 random characters). Server not started.'
  );
  process.exit(1);
}

// Initialize the client. It automatically looks for process.env.GROQ_API_KEY
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
app.use(helmet());
// Websites allowed to call this API. Set CLIENT_ORIGIN in .env
// (separate several addresses with commas).
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-ups from this address. Please try again later.' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Count per logged-in user (requireAuth runs first and sets the user id).
  keyGenerator: (_req, res) => String(res.locals.userId),
  message: { error: 'You are sending messages too quickly. Please wait a moment.' },
});

const caseMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (_req, res) => String(res.locals.userId),
  message: { error: 'You are sending messages too quickly. Please wait a moment.' },
});

app.use('/auth/login', loginLimiter);
app.use('/auth/register', registerLimiter);
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

app.post('/chat', requireAuth, chatLimiter, async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const { message, conversationId, voice } = parsed.data;

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
        let forceForm = false;
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
                    // Nothing matched: the next AI step must show the case form.
          if (articles.length === 0 && !caseForm) forceForm = true;
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
        ...(forceForm
          ? {
              tool_choice: {
                type: 'function' as const,
                function: { name: 'open_case_form' },
              },
            }
          : {}),
      });
      forceForm = false;
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
    const parsed = newCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const newCase = parsed.data;

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

// ---------- Customer: messages on one of their own cases ----------

app.get('/cases/:id/messages', requireAuth, async (req, res) => {
  const idResult = idSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  try {
    const info = await getCaseOwnerAndStatus(idResult.data);
    if (!info || info.userId !== res.locals.userId) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    res.json(forCustomer(await listCaseMessages(idResult.data)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post(
  '/cases/:id/messages',
  requireAuth,
  caseMessageLimiter,
  async (req, res) => {
    const idResult = idSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    const parsed = caseMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    try {
      const info = await getCaseOwnerAndStatus(idResult.data);
      if (!info || info.userId !== res.locals.userId) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (info.status === 'closed') {
        res.status(409).json({
          error: 'This case is closed. Please open a new case if you need more help.',
        });
        return;
      }
      await addCaseMessage(
        idResult.data,
        res.locals.userId,
        'customer',
        parsed.data.body
      );
      res.status(201).json(await listCaseMessages(idResult.data));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

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
  const idResult = idSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  const id = idResult.data;

  const parsed = caseUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const { status, assignedTo } = parsed.data;

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
    const idResult = idSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    try {
      const saved = await addCaseNote(
        idResult.data,
        res.locals.userId,
        parsed.data.note
      );
      if (!saved) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      res.status(201).json(await listCaseNotes(idResult.data));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save note' });
    }
  }
);

// ---------- Agent: knowledge base management ----------

app.get('/agent/kb', requireAuth, requireAgent, async (_req, res) => {
  try {
    res.json(await listAllArticles());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load articles' });
  }
});

app.post('/agent/kb', requireAuth, requireAgent, async (req, res) => {
  const parsed = kbArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  try {
    await addArticle(parsed.data);
    res.status(201).json(await listAllArticles());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save article' });
  }
});

app.patch('/agent/kb/:id', requireAuth, requireAgent, async (req, res) => {
  const idResult = idSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }
  const parsed = kbUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  try {
    if (!(await updateArticle(idResult.data, parsed.data))) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.json(await listAllArticles());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

const PORT = Number(process.env.PORT) || 3000;

// ---------- Agent: conversation with the customer on any case ----------

app.get(
  '/agent/cases/:id/messages',
  requireAuth,
  requireAgent,
  async (req, res) => {
    const idResult = idSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    try {
      if (!(await getCaseOwnerAndStatus(idResult.data))) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      res.json(await listCaseMessages(idResult.data));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }
);

app.post(
  '/agent/cases/:id/messages',
  requireAuth,
  requireAgent,
  caseMessageLimiter,
  async (req, res) => {
    const idResult = idSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    const parsed = caseMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    try {
      if (!(await getCaseOwnerAndStatus(idResult.data))) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      await addCaseMessage(
        idResult.data,
        res.locals.userId,
        'agent',
        parsed.data.body
      );
      res.status(201).json(forCustomer(await listCaseMessages(idResult.data)));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});