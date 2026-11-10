const API_URL = import.meta.env.VITE_API_URL as string;

export type Conversation = { id: number; title: string; created_at: string };
export type Message = { role: 'user' | 'assistant'; content: string };
export type CaseDraft = {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'urgent';
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export function register(email: string, password: string) {
  return request<{ token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function listConversations(token: string) {
  return request<Conversation[]>('/conversations', {}, token);
}

export function getMessages(token: string, conversationId: number) {
  return request<Message[]>(
    `/conversations/${conversationId}/messages`,
    {},
    token
  );
}

export function sendMessage(
  token: string,
  message: string,
  conversationId?: number,
  voice?: boolean
) {
    return request<{
    conversationId: number;
    reply: string;
    caseForm?: CaseDraft;
  }>(
    '/chat',
    {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, voice }),
    },
    token
  );
}

export function createCase(
  token: string,
  data: CaseDraft & { conversationId?: number }
) {
  return request<{ caseNumber: number }>(
    '/cases',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  );
}