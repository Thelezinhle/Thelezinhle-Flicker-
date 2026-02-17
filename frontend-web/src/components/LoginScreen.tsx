import React, { useState, useEffect } from 'react';
import './LoginScreen.css';
import { API_BASE } from '../config';

type UserRole = 'client' | 'driver';

interface LoginScreenProps {
  onLogin: (user: { id: string; email: string; sessionToken: string; role: UserRole }) => void;
  onGoToRegister: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onGoToRegister }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auto-fill from last registration
  useEffect(() => {
    const lastUser = localStorage.getItem('lastRegisteredUser');
    if (lastUser) {
      try {
        const parsed = JSON.parse(lastUser);
        setEmail(parsed.email || '');
        setSelectedRole(parsed.role || null);
      } catch (e) {
        console.error('Failed to parse last user');
      }
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    if (!selectedRole) {
      setError('Please select your role');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role: selectedRole
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      // Store for next login
      localStorage.setItem('lastRegisteredUser', JSON.stringify({
        email: data.data.email,
        role: data.data.role
      }));

      onLogin({
        id: data.data.userId,
        email: data.data.email,
        sessionToken: data.data.sessionToken,
        role: data.data.role
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h1>FlickerSecure</h1>
          <p className="subtitle">Delivery Management System</p>
        </div>

        <div className="login-content">
          <h2>Login</h2>
          <p className="description">
            Enter your email and password to continue
          </p>

          {error && <div className="error-message">{error}</div>}

          {/* Login Form */}
          <form className="login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Role Selection */}
            <div className="role-selection">
              <p className="role-label">Login as:</p>
              <div className="role-buttons">
                <button
                  type="button"
                  onClick={() => setSelectedRole('client')}
                  className={`role-btn ${selectedRole === 'client' ? 'selected' : ''}`}
                >
                  <span className="role-text">Customer</span>
                  <span className="role-desc">Order and track deliveries</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole('driver')}
                  className={`role-btn ${selectedRole === 'driver' ? 'selected' : ''}`}
                >
                  <span className="role-text">Driver</span>
                  <span className="role-desc">Deliver packages</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !selectedRole || !email.trim() || !password}
              className={`create-btn ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Logging in...
                </>
              ) : (
                selectedRole && email.trim() && password
                  ? `Login as ${selectedRole === 'client' ? 'Customer' : 'Driver'}`
                  : 'Enter credentials and select role'
              )}
            </button>
          </form>

          <div className="divider">
            <span>New user?</span>
          </div>

          <button
            onClick={onGoToRegister}
            className="secondary-btn"
            type="button"
          >
            Create New Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
