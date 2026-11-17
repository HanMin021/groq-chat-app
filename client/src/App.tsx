import { useEffect, useState } from 'react';
import AuthForm from './AuthForm';
import Chat from './Chat';
import AgentDashboard from './AgentDashboard';
import KnowledgeBase from './KnowledgeBase';
import MyCases from './MyCases';
import { getMe, setUnauthorizedHandler } from './api';
import { useTheme } from './useTheme';

export default function App() {
  useTheme();
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  );
  const [isAgent, setIsAgent] = useState(false);
  const [view, setView] = useState<'chat' | 'agent' | 'mycases' | 'kb'>(
    'chat'
  );

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

  // If the server says the token is invalid or expired, log out.
  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
    return () => setUnauthorizedHandler(undefined);
  });

  if (!token) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

  if (view === 'agent' && isAgent) {
    return (
      <AgentDashboard
        token={token}
        onBack={() => setView('chat')}
        onLogout={handleLogout}
        onOpenKb={() => setView('kb')}
      />
    );
  }

  if (view === 'kb' && isAgent) {
    return (
      <KnowledgeBase
        token={token}
        onBack={() => setView('agent')}
        onLogout={handleLogout}
      />
    );
  }

  if (view === 'mycases') {
    return (
      <MyCases
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
      onOpenMyCases={() => setView('mycases')}
    />
  );
}