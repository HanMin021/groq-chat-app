import sql from 'mssql';
import { getPool } from './db.js';

export type KbArticle = { id: number; title: string; content: string };

export const SEARCH_KNOWLEDGE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_knowledge',
    description:
      'Search the Avaya support knowledge base. Call this before answering any support question. Write the search words in English, even if the customer writes in another language.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A few English keywords, for example "one-way audio headset".',
        },
      },
      required: ['query'],
    },
  },
};

// Splits text into lowercase words of 3 or more letters or digits.
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
}

export async function searchKnowledge(
  query: string,
  limit = 3
): Promise<KbArticle[]> {
  const terms = words(query);
  if (terms.length === 0) return [];

  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      'SELECT id, title, content, keywords FROM kb_articles WHERE is_active = 1'
    );

  const scored = result.recordset.map((row: any) => {
    const title = String(row.title).toLowerCase();
    const keywords = String(row.keywords).toLowerCase();
    const content = String(row.content).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (keywords.includes(term)) score += 2;
      if (content.includes(term)) score += 1;
    }
    return { id: row.id, title: row.title, content: row.content, score };
  });

  return scored
    .filter((a: { score: number }) => a.score > 0)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, title, content }: KbArticle) => ({ id, title, content }));
}

// ---------- Article management (used by agent-only routes) ----------

export type KbAdminArticle = {
  id: number;
  title: string;
  content: string;
  keywords: string;
  is_sample: boolean;
  is_active: boolean;
  updated_at: Date;
};

// All articles, including switched-off ones. Active articles first.
export async function listAllArticles(): Promise<KbAdminArticle[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      `SELECT id, title, content, keywords, is_sample, is_active, updated_at
       FROM kb_articles
       ORDER BY is_active DESC, title`
    );
  return result.recordset;
}

// New articles written by an agent are not samples.
export async function addArticle(data: {
  title: string;
  content: string;
  keywords: string;
}): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('title', sql.NVarChar(200), data.title)
    .input('content', sql.NVarChar(sql.MAX), data.content)
    .input('keywords', sql.NVarChar(500), data.keywords)
    .query(
      `INSERT INTO kb_articles (title, content, keywords, is_sample)
       OUTPUT INSERTED.id
       VALUES (@title, @content, @keywords, 0)`
    );
  return result.recordset[0].id;
}

// Changes only the fields that are given. Editing the text clears the
// "sample" flag. Switching an article on or off does not.
// Returns false if the article does not exist.
export async function updateArticle(
  id: number,
  changes: {
    title?: string;
    content?: string;
    keywords?: string;
    isActive?: boolean;
  }
): Promise<boolean> {
  const textChanged =
    changes.title !== undefined ||
    changes.content !== undefined ||
    changes.keywords !== undefined;

  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('title', sql.NVarChar(200), changes.title ?? null)
    .input('content', sql.NVarChar(sql.MAX), changes.content ?? null)
    .input('keywords', sql.NVarChar(500), changes.keywords ?? null)
    .input('isActive', sql.Bit, changes.isActive ?? null)
    .input('textChanged', sql.Bit, textChanged)
    .query(
      `UPDATE kb_articles
       SET title = COALESCE(@title, title),
           content = COALESCE(@content, content),
           keywords = COALESCE(@keywords, keywords),
           is_active = COALESCE(@isActive, is_active),
           is_sample = CASE WHEN @textChanged = 1 THEN 0 ELSE is_sample END,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}