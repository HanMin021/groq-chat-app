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

export const CASE_FORM_TOOL = {
  type: 'function' as const,
  function: {
    name: 'open_case_form',
        description:
      'Show the customer a case form with a draft already filled in. The customer reviews it and submits it themselves. Call this when the customer wants to open a case or has an issue that needs a human agent.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short title for the case, under 100 characters.',
        },
        description: {
          type: 'string',
          description:
            'What happened, when it started, the product affected, how many users are affected, and any error messages.',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description:
            'urgent = Severity 1, high = Severity 2, medium = Severity 3, low = Severity 4.',
        },
      },
      required: ['title', 'description', 'severity'],
    },
  },
};

const SEVERITIES = ['low', 'medium', 'high', 'urgent'];

// Checks the arguments the AI sent. Returns null if anything is wrong.
export function parseNewCase(
  rawArguments: string,
  conversationId: number
): NewCase | null {
  try {
    const args = JSON.parse(rawArguments);
    if (
      typeof args.title !== 'string' ||
      args.title.trim() === '' ||
      typeof args.description !== 'string' ||
      args.description.trim() === '' ||
      !SEVERITIES.includes(args.severity)
    ) {
      return null;
    }
    return {
      title: args.title.trim().slice(0, 200),
      description: args.description.trim(),
      severity: args.severity as Severity,
      conversationId,
    };
  } catch {
    return null;
  }
}

// Checks the details sent by the website form. Returns null if anything is wrong.
export function validateNewCase(input: any): NewCase | null {
  if (
    !input ||
    typeof input.title !== 'string' ||
    input.title.trim() === '' ||
    typeof input.description !== 'string' ||
    input.description.trim() === '' ||
    input.description.length > 5000 ||
    !SEVERITIES.includes(input.severity)
  ) {
    return null;
  }

  let conversationId: number | undefined;
  if (input.conversationId !== undefined && input.conversationId !== null) {
    if (!Number.isInteger(input.conversationId)) return null;
    conversationId = input.conversationId;
  }

  return {
    title: input.title.trim().slice(0, 200),
    description: input.description.trim(),
    severity: input.severity as Severity,
    conversationId,
  };
}

// ---------- Agent functions (only used by routes protected with requireAgent) ----------

export const CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// All cases, urgent first. Optional filters by status and severity.
export async function listAllCases(filter: {
  status?: string;
  severity?: string;
}) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('status', sql.NVarChar(20), filter.status ?? null)
    .input('severity', sql.NVarChar(20), filter.severity ?? null)
    .query(
      `SELECT c.id, c.title, c.severity, c.status, c.created_at, c.assigned_to,
              u.email AS customer_email, a.email AS assigned_email
       FROM cases c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN users a ON a.id = c.assigned_to
       WHERE (@status IS NULL OR c.status = @status)
         AND (@severity IS NULL OR c.severity = @severity)
       ORDER BY CASE c.severity
                  WHEN 'urgent' THEN 1
                  WHEN 'high' THEN 2
                  WHEN 'medium' THEN 3
                  ELSE 4
                END,
                c.id DESC`
    );
  return result.recordset;
}

// One case with the chat transcript that led to it.
export async function getCaseDetail(caseId: number) {
  const pool = await getPool();
  const caseResult = await pool
    .request()
    .input('id', sql.Int, caseId)
    .query(
      `SELECT c.id, c.title, c.description, c.severity, c.status,
              c.created_at, c.updated_at, c.conversation_id, c.assigned_to,
              u.email AS customer_email, a.email AS assigned_email
       FROM cases c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN users a ON a.id = c.assigned_to
       WHERE c.id = @id`
    );
  const row = caseResult.recordset[0];
  if (!row) return null;

  let messages: { role: string; content: string; created_at: Date }[] = [];
  if (row.conversation_id !== null) {
    const m = await pool
      .request()
      .input('cid', sql.Int, row.conversation_id)
      .query(
        'SELECT role, content, created_at FROM messages WHERE conversation_id = @cid ORDER BY id'
      );
    messages = m.recordset;
  }
  return { case: row, messages };
}

// Returns false if no case with that id exists.
export async function setCaseStatus(
  caseId: number,
  status: string
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, caseId)
    .input('status', sql.NVarChar(20), status)
    .query(
      'UPDATE cases SET status = @status, updated_at = SYSUTCDATETIME() WHERE id = @id'
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

// Assigns a case to an agent (or unassigns it with null).
// Returns false if the case does not exist or the user is not an agent.
export async function assignCase(
  caseId: number,
  agentId: number | null
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, caseId)
    .input('agent', sql.Int, agentId)
    .query(
      `UPDATE cases
       SET assigned_to = @agent, updated_at = SYSUTCDATETIME()
       WHERE id = @id
         AND (@agent IS NULL
              OR EXISTS (SELECT 1 FROM users WHERE id = @agent AND role = 'agent'))`
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function listAgents() {
  const pool = await getPool();
  const result = await pool
    .request()
    .query("SELECT id, email FROM users WHERE role = 'agent' ORDER BY email");
  return result.recordset;
}

// ---------- Internal notes (agents only) ----------

export async function listCaseNotes(caseId: number) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('caseId', sql.Int, caseId)
    .query(
      `SELECT n.id, n.note, n.created_at, u.email AS author_email
       FROM case_notes n
       JOIN users u ON u.id = n.author_id
       WHERE n.case_id = @caseId
       ORDER BY n.id`
    );
  return result.recordset;
}

// Returns false if the case does not exist.
export async function addCaseNote(
  caseId: number,
  authorId: number,
  note: string
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('caseId', sql.Int, caseId)
    .input('authorId', sql.Int, authorId)
    .input('note', sql.NVarChar(sql.MAX), note)
    .query(
      `INSERT INTO case_notes (case_id, author_id, note)
       SELECT @caseId, @authorId, @note
       WHERE EXISTS (SELECT 1 FROM cases WHERE id = @caseId)`
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}