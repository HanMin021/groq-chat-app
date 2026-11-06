import { useState } from 'react';
import AuthForm from './AuthForm';
import Chat from './Chat';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  );

  function handleAuthenticated(newToken: string) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  if (!token) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

    return <Chat token={token} onLogout={handleLogout} />;
}