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