import { describe, expect, it } from 'vitest';
import {
  caseMessageSchema,
  caseUpdateSchema,
  chatSchema,
  idSchema,
  kbArticleSchema,
  kbUpdateSchema,
  loginSchema,
  newCaseSchema,
  noteSchema,
  registerSchema,
  validationMessage,
} from './validation.js';

// Returns the error message when the value is rejected, or null when it is accepted.
function errorOf(
  schema: { safeParse: (value: unknown) => any },
  value: unknown
): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : validationMessage(result.error);
}

describe('registerSchema', () => {
  it('accepts a valid sign-up and cleans up the email', () => {
    const data = registerSchema.parse({
      email: '  Test@Example.COM ',
      password: '12345678',
    });
    expect(data.email).toBe('test@example.com');
  });

  it('rejects an invalid email', () => {
    expect(errorOf(registerSchema, { email: 'abc', password: '12345678' })).toBe(
      'Please enter a valid email address.'
    );
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(errorOf(registerSchema, { email: 'a@b.com', password: '123' })).toBe(
      'Password must be at least 8 characters.'
    );
  });

  it('rejects a password longer than 72 characters', () => {
    expect(
      errorOf(registerSchema, { email: 'a@b.com', password: 'a'.repeat(73) })
    ).toBe('Password must be at most 72 characters.');
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password and lowercases the email', () => {
    const data = loginSchema.parse({ email: ' User@Example.com ', password: 'x' });
    expect(data.email).toBe('user@example.com');
  });

  it('rejects an empty password', () => {
    expect(errorOf(loginSchema, { email: 'a@b.com', password: '' })).toBe(
      'Password is required.'
    );
  });
});

describe('chatSchema', () => {
  it('trims the message', () => {
    expect(chatSchema.parse({ message: '  hello  ' }).message).toBe('hello');
  });

  it('rejects an empty or blank message', () => {
    expect(errorOf(chatSchema, { message: '' })).toBe('message is required');
    expect(errorOf(chatSchema, { message: '    ' })).toBe('message is required');
  });

  it('accepts 4000 characters but rejects 4001', () => {
    expect(errorOf(chatSchema, { message: 'a'.repeat(4000) })).toBeNull();
    expect(errorOf(chatSchema, { message: 'a'.repeat(4001) })).toBe(
      'Message is too long (up to 4000 characters).'
    );
  });

  it('rejects a conversation id that is not a whole number', () => {
    expect(errorOf(chatSchema, { message: 'hi', conversationId: 1.5 })).not.toBeNull();
  });

  it('rejects a voice flag that is not true or false', () => {
    expect(errorOf(chatSchema, { message: 'hi', voice: 'yes' })).not.toBeNull();
  });
});

describe('newCaseSchema', () => {
  const valid = { title: 'Audio problem', description: 'No sound', severity: 'high' };

  it('accepts a valid case', () => {
    expect(errorOf(newCaseSchema, valid)).toBeNull();
  });

  it('turns a null conversation id into undefined', () => {
    const data = newCaseSchema.parse({ ...valid, conversationId: null });
    expect(data.conversationId).toBeUndefined();
  });

  it('rejects an unknown severity', () => {
    expect(errorOf(newCaseSchema, { ...valid, severity: 'banana' })).toBe(
      'Choose a severity: low, medium, high or urgent.'
    );
  });

  it('rejects a title over 200 characters', () => {
    expect(errorOf(newCaseSchema, { ...valid, title: 'a'.repeat(201) })).toBe(
      'Title must be at most 200 characters.'
    );
  });

  it('rejects a description over 5000 characters', () => {
    expect(
      errorOf(newCaseSchema, { ...valid, description: 'a'.repeat(5001) })
    ).toBe('Description must be at most 5000 characters.');
  });
});

describe('caseUpdateSchema', () => {
  it('rejects an update with nothing in it', () => {
    expect(errorOf(caseUpdateSchema, {})).toBe('Nothing to update');
  });

  it('accepts a valid status', () => {
    expect(errorOf(caseUpdateSchema, { status: 'resolved' })).toBeNull();
  });

  it('rejects an unknown status', () => {
    expect(errorOf(caseUpdateSchema, { status: 'banana' })).toBe('Invalid status.');
  });

  it('accepts assigning and unassigning', () => {
    expect(errorOf(caseUpdateSchema, { assignedTo: 3 })).toBeNull();
    expect(errorOf(caseUpdateSchema, { assignedTo: null })).toBeNull();
  });

  it('rejects an assignee that is not a whole number', () => {
    expect(errorOf(caseUpdateSchema, { assignedTo: 1.5 })).toBe('Invalid assignee.');
    expect(errorOf(caseUpdateSchema, { assignedTo: '3' })).toBe('Invalid assignee.');
  });
});

describe('noteSchema', () => {
  it('trims the note', () => {
    expect(noteSchema.parse({ note: '  call back  ' }).note).toBe('call back');
  });

  it('rejects an empty note and a note over 5000 characters', () => {
    expect(errorOf(noteSchema, { note: '  ' })).toBe('Please write a note.');
    expect(errorOf(noteSchema, { note: 'a'.repeat(5001) })).toBe(
      'A note can be up to 5000 characters.'
    );
  });
});

describe('caseMessageSchema', () => {
  it('accepts a normal message', () => {
    expect(errorOf(caseMessageSchema, { body: 'Hello' })).toBeNull();
  });

  it('rejects an empty message and a message over 2000 characters', () => {
    expect(errorOf(caseMessageSchema, { body: '' })).toBe('Please write a message.');
    expect(errorOf(caseMessageSchema, { body: 'a'.repeat(2001) })).toBe(
      'A message can be up to 2000 characters.'
    );
  });
});

describe('knowledge base schemas', () => {
  it('gives a new article empty keywords when none are sent', () => {
    const data = kbArticleSchema.parse({ title: 'T', content: 'C' });
    expect(data.keywords).toBe('');
  });

  it('rejects a new article without a title', () => {
    expect(errorOf(kbArticleSchema, { title: '', content: 'C' })).toBe(
      'Title is required.'
    );
  });

  it('rejects an empty update', () => {
    expect(errorOf(kbUpdateSchema, {})).toBe('Nothing to update');
  });

  it('accepts switching an article off', () => {
    expect(errorOf(kbUpdateSchema, { isActive: false })).toBeNull();
  });

  it('rejects an on/off value that is not true or false', () => {
    expect(errorOf(kbUpdateSchema, { isActive: 'yes' })).not.toBeNull();
  });
});

describe('idSchema', () => {
  it('turns a number written as text into a number', () => {
    expect(idSchema.parse('12')).toBe(12);
  });

  it('rejects zero, negatives, decimals and words', () => {
    for (const bad of ['0', '-3', '1.5', 'abc']) {
      expect(errorOf(idSchema, bad)).not.toBeNull();
    }
  });
});