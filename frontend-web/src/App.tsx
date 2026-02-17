import React, { useState, useEffect } from 'react';
import './App.css';
import RegisterScreen from './components/RegisterScreen';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import CustomerDashboard from './components/CustomerDashboard';
import DriverDashboard from './components/DriverDashboard';

type UserRole = 'client' | 'driver';

interface User {
  id: string;
  email: string;
  sessionToken: string;
  role: UserRole;
}

type AppMode = 'register' | 'login' | 'dashboard' | 'roleSelect' | 'customer' | 'driver';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AppMode>('roleSelect');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session in localStorage
    const savedUser = localStorage.getItem('flickerSecureUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setMode('dashboard');
      } catch (error) {
        console.error('Failed to parse saved user:', error);
        localStorage.removeItem('flickerSecureUser');
        localStorage.removeItem('flickerSecureMode');
      }
    } else {
      // Check if user has registered before
      const lastRegistered = localStorage.getItem('lastRegisteredUser');
      if (lastRegistered) {
        setMode('login'); // Go to login if they've registered
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    setMode('dashboard');
    localStorage.setItem('flickerSecureUser', JSON.stringify(userData));
    localStorage.setItem('flickerSecureMode', 'dashboard');
  };

  const handleRegisterSuccess = () => {
    setMode('login');
  };

  const handleGoToRegister = () => {
    setMode('register');
  };

  const handleGoToLogin = () => {
    setMode('login');
  };

  const handleLogout = () => {
    setUser(null);
    setMode('login');
    localStorage.removeItem('flickerSecureUser');
    localStorage.removeItem('flickerSecureMode');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {mode === 'roleSelect' && (
        <div className="role-selection">
          <h1>FlickerSecure Delivery</h1>
          <p>Choose your role to continue</p>
          <div className="role-cards">
            <div className="role-card customer" onClick={() => setMode('customer')}>
              <div className="icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
              </div>
              <h2>Customer</h2>
              <p>Place orders and track your deliveries in real-time</p>
            </div>
            <div className="role-card driver" onClick={() => setMode('driver')}>
              <div className="icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5a2 2 0 0 0-2 2v7h2"/>
                  <circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>
                </svg>
              </div>
              <h2>Driver</h2>
              <p>Accept deliveries and update your location</p>
            </div>
          </div>
          <div className="role-buttons">
            <button 
              className="role-btn"
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
          </div>
        </div>
      )}
      {mode === 'customer' && (
        <div>
          <button 
            className="back-btn"
            onClick={() => setMode('roleSelect')}
          >
            Back
          </button>
          <CustomerDashboard />
        </div>
      )}
      {mode === 'driver' && (
        <div>
          <button 
            className="back-btn"
            onClick={() => setMode('roleSelect')}
          >
            Back
          </button>
          <DriverDashboard />
        </div>
      )}
      {mode === 'register' && (
        <RegisterScreen onRegisterSuccess={handleRegisterSuccess} onGoToLogin={handleGoToLogin} />
      )}
      {mode === 'login' && (
        <LoginScreen onLogin={handleLogin} onGoToRegister={handleGoToRegister} />
      )}
      {mode === 'dashboard' && user && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;
