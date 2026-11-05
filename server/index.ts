import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import express from 'express';
import { getPool } from './db.js';
import { authRouter } from './auth.js';
import { requireAuth } from './middleware.js';
import {
  createConversation,
  conversationBelongsToUser,
  getMessages,
  addMessage,
  type ChatMessage,
} from './chats.js';

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
    const { message, conversationId } = req.body;

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

    const completion = await groq.chat.completions.create({
      messages: [...history, { role: 'user', content: message }],
      model: 'openai/gpt-oss-120b',
    });
    const reply = completion.choices[0]?.message?.content ?? '';

    await addMessage(convId, 'assistant', reply);
    res.json({ conversationId: convId, reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response from Groq' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});