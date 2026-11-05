import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import express from 'express';

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: message }],
      model: 'openai/gpt-oss-120b',
    });
    res.json({ reply: completion.choices[0]?.message?.content ?? '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response from Groq' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});