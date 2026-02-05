import React, { useState } from 'react';
import './LoginScreen.css';

interface LoginScreenProps {
  onLogin: (user: { id: string; deviceId: string; sessionToken: string }) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateAccount = async () => {
    setLoading(true);
    setError('');

    try {
      const deviceId = `device-${Date.now()}`;

      // Register
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error('Registration failed');
      }

      // Auto-login
      const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.data.userId,
          deviceId
        })
      });

      const loginData = await loginResponse.json();

      if (loginData.success) {
        onLogin({
          id: loginData.data.userId,
          deviceId,
          sessionToken: loginData.data.sessionToken
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">🚚</div>
          <h1>FlickerSecure</h1>
          <p className="subtitle">Delivery Management System</p>
        </div>

        <div className="login-content">
          <h2>Welcome!</h2>
          <p className="description">
            Quick setup for delivery tracking and secure handshakes
          </p>

          {error && <div className="error-message">{error}</div>}

          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className={`create-btn ${loading ? 'loading' : ''}`}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating Account...
              </>
            ) : (
              <>
                <span>➕</span>
                Create My Account
              </>
            )}
          </button>

          <div className="features">
            <div className="feature">
              <span className="feature-icon">📍</span>
              <p><strong>Real-time GPS</strong><br />Track deliveries live</p>
            </div>
            <div className="feature">
              <span className="feature-icon">🗺️</span>
              <p><strong>Live Map</strong><br />See location on map</p>
            </div>
            <div className="feature">
              <span className="feature-icon">⏱️</span>
              <p><strong>Auto ETA</strong><br />Smart time estimates</p>
            </div>
          </div>

          <div className="info-box">
            <p>✓ No password needed</p>
            <p>✓ Instant setup</p>
            <p>✓ Ready to track</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
