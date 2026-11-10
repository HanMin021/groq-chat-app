import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { SYSTEM_PROMPT, VOICE_MODE_PROMPT } from './knowledge.js';
import { getPool } from './db.js';
import { authRouter } from './auth.js';
import { requireAuth } from './middleware.js';
import {
  createConversation,
  conversationBelongsToUser,
  getMessages,
  addMessage,
  listConversations, 
  type ChatMessage,
} from './chats.js';
import {
  listCasesForUser,
  createCase,
  parseNewCase,
  CREATE_CASE_TOOL,
} from './cases.js';

// Load environment variables from the .env file
dotenv.config();

// Initialize the client. It automatically looks for process.env.GROQ_API_KEY
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  console.log("Waiting for response from Groq...");

  const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: "Explain quantum computing in simple terms."
        }
      ],
      // Change the model ID to an active one:
      model: "openai/gpt-oss-120b", 
    });

  console.log("\nResponse:");
  console.log(chatCompletion.choices[0]?.message?.content || "");
}

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

    let completion = await groq.chat.completions.create({
      messages: chatMessages,
      model: 'openai/gpt-oss-120b',
      tools: [CREATE_CASE_TOOL],
    });

    const toolCalls = completion.choices[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      chatMessages.push({
        role: 'assistant',
        content: completion.choices[0]?.message?.content ?? '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let result: object;
        if (call.function.name === 'create_case') {
          const newCase = parseNewCase(call.function.arguments, convId);
          if (newCase) {
            const caseNumber = await createCase(userId, newCase);
            result = { ok: true, case_number: caseNumber };
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
        model: 'openai/gpt-oss-120b',
        tools: [CREATE_CASE_TOOL],
      });
    }

    const reply = completion.choices[0]?.message?.content ?? '';

    await addMessage(convId, 'assistant', reply);
    res.json({ conversationId: convId, reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response from Groq' });
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

app.get('/cases', requireAuth, async (_req, res) => {
  try {
    res.json(await listCasesForUser(res.locals.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});