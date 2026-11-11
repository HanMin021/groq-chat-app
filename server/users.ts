import sql from 'mssql';
import { getPool } from './db.js';

export type UserProfile = {
  id: number;
  email: string;
  role: 'customer' | 'agent';
};

export async function getUserProfile(
  userId: number
): Promise<UserProfile | undefined> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, userId)
    .query('SELECT id, email, role FROM users WHERE id = @id');
  return result.recordset[0];
}