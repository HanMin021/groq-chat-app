import { useEffect, useState } from 'react';
import AuthForm from './AuthForm';
import Chat from './Chat';
import AgentDashboard from './AgentDashboard';
import { getMe } from './api';
import { useTheme } from './useTheme';

export default function App() {
  useTheme();
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  );
  const [isAgent, setIsAgent] = useState(false);
  const [view, setView] = useState<'chat' | 'agent'>('chat');

  // Ask the server whether the logged-in user is an agent.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMe(token)
      .then((me) => {
        if (!cancelled) setIsAgent(me.role === 'agent');
      })
      .catch(() => {
        if (!cancelled) setIsAgent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleAuthenticated(newToken: string) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
    setIsAgent(false);
    setView('chat');
  }

  if (!token) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

  if (view === 'agent' && isAgent) {
    return (
      <AgentDashboard
        token={token}
        onBack={() => setView('chat')}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Chat
      token={token}
      onLogout={handleLogout}
      isAgent={isAgent}
      onOpenAgent={() => setView('agent')}
    />
  );
}