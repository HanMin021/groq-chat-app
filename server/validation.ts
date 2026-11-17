import { z } from 'zod';

export const SEVERITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

// A positive whole number, for ids that arrive in the address (e.g. /cases/12).
export const idSchema = z.coerce.number().int().positive();

// ---------- Login and sign-up ----------

const registerEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Please enter a valid email address.').max(254, 'Email is too long.'));

export const registerSchema = z.object({
  email: registerEmail,
  // bcrypt only uses the first 72 bytes of a password, so we cap it there.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required.').max(254),
  password: z.string().min(1, 'Password is required.').max(200),
});

// ---------- Chat ----------

export const chatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'message is required')
    .max(4000, 'Message is too long (up to 4000 characters).'),
  conversationId: z.number().int().positive().optional(),
  voice: z.boolean().optional(),
});

// ---------- Cases ----------

export const newCaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(200, 'Title must be at most 200 characters.'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required.')
    .max(5000, 'Description must be at most 5000 characters.'),
  severity: z.enum(SEVERITIES, 'Choose a severity: low, medium, high or urgent.'),
  conversationId: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => v ?? undefined),
});

export const caseUpdateSchema = z
  .object({
    status: z.enum(STATUSES, 'Invalid status.').optional(),
    assignedTo: z
      .number('Invalid assignee.')
      .int('Invalid assignee.')
      .positive('Invalid assignee.')
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.assignedTo !== undefined,
    'Nothing to update'
  );

export const noteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'Please write a note.')
    .max(5000, 'A note can be up to 5000 characters.'),
});

// Turns a failed validation into one short message for the customer or agent.

// ---------- Case messages (customer <-> agent) ----------

export const caseMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Please write a message.')
    .max(2000, 'A message can be up to 2000 characters.'),
});

// ---------- Knowledge base articles (agents) ----------

const kbTitle = z
  .string()
  .trim()
  .min(1, 'Title is required.')
  .max(200, 'Title must be at most 200 characters.');

const kbContent = z
  .string()
  .trim()
  .min(1, 'Content is required.')
  .max(10000, 'Content must be at most 10000 characters.');

const kbKeywords = z
  .string()
  .trim()
  .max(500, 'Keywords must be at most 500 characters.');

// A new article. Keywords are optional.
export const kbArticleSchema = z.object({
  title: kbTitle,
  content: kbContent,
  keywords: kbKeywords.default(''),
});

// A change to an article: send only the fields that change.
export const kbUpdateSchema = z
  .object({
    title: kbTitle.optional(),
    content: kbContent.optional(),
    keywords: kbKeywords.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.content !== undefined ||
      v.keywords !== undefined ||
      v.isActive !== undefined,
    'Nothing to update'
  );
  
export function validationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}