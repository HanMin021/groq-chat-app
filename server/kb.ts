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