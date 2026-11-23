import sql from 'mssql';
import { getPool } from './db.js';

export type CaseMessageRow = {
  id: number;
  sender_role: 'customer' | 'agent';
  body: string;
  created_at: Date;
  sender_email: string;
};

// Who owns a case, and its status. Returns null if the case does not exist.
export async function getCaseOwnerAndStatus(
  caseId: number
): Promise<{ userId: number; status: string } | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, caseId)
    .query('SELECT user_id, status FROM cases WHERE id = @id');
  const row = result.recordset[0];
  return row ? { userId: row.user_id, status: row.status } : null;
}

// All messages of a case, oldest first.
export async function listCaseMessages(
  caseId: number
): Promise<CaseMessageRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('caseId', sql.Int, caseId)
    .query(
      `SELECT m.id, m.sender_role, m.body, m.created_at, u.email AS sender_email
       FROM case_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.case_id = @caseId
       ORDER BY m.id`
    );
  return result.recordset;
}

// Returns false if the case does not exist.
export async function addCaseMessage(
  caseId: number,
  senderId: number,
  senderRole: 'customer' | 'agent',
  body: string
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('caseId', sql.Int, caseId)
    .input('senderId', sql.Int, senderId)
    .input('senderRole', sql.NVarChar(20), senderRole)
    .input('body', sql.NVarChar(sql.MAX), body)
    .query(
      `INSERT INTO case_messages (case_id, sender_id, sender_role, body)
       SELECT @caseId, @senderId, @senderRole, @body
       WHERE EXISTS (SELECT 1 FROM cases WHERE id = @caseId)`
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}


// What a customer may see: no email addresses of agents.
export function forCustomer(rows: CaseMessageRow[]) {
  return rows.map(({ id, sender_role, body, created_at }) => ({
    id,
    sender_role,
    body,
    created_at,
  }));
}

