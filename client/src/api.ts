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

export function deleteConversation(token: string, conversationId: number) {
  return request<Record<string, never>>(
    `/conversations/${conversationId}`,
    { method: 'DELETE' },
    token
  );
}

// ---------- Agent features ----------

export type UserProfile = {
  id: number;
  email: string;
  role: 'customer' | 'agent';
};

export type CaseSeverity = CaseDraft['severity'];
export type CaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type AgentCaseSummary = {
  id: number;
  title: string;
  severity: CaseSeverity;
  status: CaseStatus;
  created_at: string;
  assigned_to: number | null;
  customer_email: string;
  assigned_email: string | null;
};

export type AgentCaseDetail = {
  case: AgentCaseSummary & {
    description: string;
    updated_at: string;
    conversation_id: number | null;
  };
  messages: { role: 'user' | 'assistant'; content: string; created_at: string }[];
};

export type CaseNote = {
  id: number;
  note: string;
  created_at: string;
  author_email: string;
};

export type AgentUser = { id: number; email: string };

export function getMe(token: string) {
  return request<UserProfile>('/me', {}, token);
}

export function listAgentCases(
  token: string,
  filter: { status?: string; severity?: string }
) {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.severity) params.set('severity', filter.severity);
  const query = params.toString();
  return request<AgentCaseSummary[]>(
    `/agent/cases${query ? `?${query}` : ''}`,
    {},
    token
  );
}

export function getAgentCase(token: string, caseId: number) {
  return request<AgentCaseDetail>(`/agent/cases/${caseId}`, {}, token);
}

export function updateAgentCase(
  token: string,
  caseId: number,
  changes: { status?: CaseStatus; assignedTo?: number | null }
) {
  return request<AgentCaseDetail>(
    `/agent/cases/${caseId}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
    token
  );
}

export function listAgentUsers(token: string) {
  return request<AgentUser[]>('/agent/agents', {}, token);
}

export function listCaseNotes(token: string, caseId: number) {
  return request<CaseNote[]>(`/agent/cases/${caseId}/notes`, {}, token);
}

export function addCaseNote(token: string, caseId: number, note: string) {
  return request<CaseNote[]>(
    `/agent/cases/${caseId}/notes`,
    { method: 'POST', body: JSON.stringify({ note }) },
    token
  );
}

