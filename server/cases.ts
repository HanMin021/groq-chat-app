import sql from 'mssql';
import { getPool } from './db.js';

export type Severity = 'low' | 'medium' | 'high' | 'urgent';

export type NewCase = {
  title: string;
  description: string;
  severity: Severity;
  conversationId?: number;
};

export async function createCase(
  userId: number,
  data: NewCase
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('conversationId', sql.Int, data.conversationId ?? null)
    .input('title', sql.NVarChar(200), data.title)
    .input('description', sql.NVarChar(sql.MAX), data.description)
    .input('severity', sql.NVarChar(20), data.severity)
    .query(
      `INSERT INTO cases (user_id, conversation_id, title, description, severity)
       OUTPUT INSERTED.id
       VALUES (@userId, @conversationId, @title, @description, @severity)`
    );
  return result.recordset[0].id;
}

export async function listCasesForUser(userId: number) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(
      `SELECT id, title, severity, status, created_at
       FROM cases
       WHERE user_id = @userId
       ORDER BY id DESC`
    );
  return result.recordset;
}