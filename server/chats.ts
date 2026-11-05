import sql from 'mssql';
import { getPool } from './db.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function createConversation(
  userId: number,
  title: string
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('title', sql.NVarChar(200), title)
    .query(
      'INSERT INTO conversations (user_id, title) OUTPUT INSERTED.id VALUES (@userId, @title)'
    );
  return result.recordset[0].id;
}

// Makes sure a user can only open their own conversations.
export async function conversationBelongsToUser(
  conversationId: number,
  userId: number
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, conversationId)
    .input('userId', sql.Int, userId)
    .query('SELECT 1 AS found FROM conversations WHERE id = @id AND user_id = @userId');
  return result.recordset.length > 0;
}

export async function getMessages(conversationId: number): Promise<ChatMessage[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, conversationId)
    .query('SELECT role, content FROM messages WHERE conversation_id = @id ORDER BY id');
  return result.recordset;
}

export async function addMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .input('role', sql.NVarChar(20), role)
    .input('content', sql.NVarChar(sql.MAX), content)
    .query(
      'INSERT INTO messages (conversation_id, role, content) VALUES (@conversationId, @role, @content)'
    );
}