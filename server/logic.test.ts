import { describe, expect, it } from 'vitest';
import { parseNewCase } from './cases.js';
import { scoreArticle, words } from './kb.js';

describe('parseNewCase (the case draft the AI sends back)', () => {
  const draft = JSON.stringify({
    title: '  Audio problem  ',
    description: ' No sound on calls ',
    severity: 'high',
  });

  it('accepts a valid draft, trims it and attaches the conversation id', () => {
    expect(parseNewCase(draft, 7)).toEqual({
      title: 'Audio problem',
      description: 'No sound on calls',
      severity: 'high',
      conversationId: 7,
    });
  });

  it('cuts a very long title to 200 characters', () => {
    const long = JSON.stringify({
      title: 'a'.repeat(300),
      description: 'd',
      severity: 'low',
    });
    expect(parseNewCase(long, 1)?.title).toHaveLength(200);
  });

  it('returns null for text that is not JSON', () => {
    expect(parseNewCase('not json at all', 1)).toBeNull();
  });

  it('returns null when a field is missing', () => {
    expect(parseNewCase(JSON.stringify({ title: 'T', severity: 'low' }), 1)).toBeNull();
  });

  it('returns null for an unknown severity', () => {
    const bad = JSON.stringify({ title: 'T', description: 'D', severity: 'banana' });
    expect(parseNewCase(bad, 1)).toBeNull();
  });

  it('returns null for an empty title', () => {
    const bad = JSON.stringify({ title: '   ', description: 'D', severity: 'low' });
    expect(parseNewCase(bad, 1)).toBeNull();
  });
});

describe('words (search words)', () => {
  it('splits text into lowercase words and drops punctuation', () => {
    expect(words('One-way audio, headset!')).toEqual([
      'one',
      'way',
      'audio',
      'headset',
    ]);
  });

  it('drops words shorter than 3 characters', () => {
    expect(words('a an of')).toEqual([]);
  });
});

describe('scoreArticle (how well an article matches)', () => {
  const article = {
    title: 'One-way audio',
    keywords: 'headset rtp',
    content: 'Check the headset first.',
  };

  it('counts 3 for the title, 2 for keywords and 1 for the text', () => {
    // "audio": title only = 3. "headset": keywords 2 + text 1 = 3.
    expect(scoreArticle(['audio', 'headset'], article)).toBe(6);
  });

  it('ignores upper and lower case in the article', () => {
    expect(
      scoreArticle(['audio'], { title: 'AUDIO', keywords: '', content: '' })
    ).toBe(3);
  });

  it('returns 0 when nothing matches', () => {
    expect(scoreArticle(['licence'], article)).toBe(0);
  });
});