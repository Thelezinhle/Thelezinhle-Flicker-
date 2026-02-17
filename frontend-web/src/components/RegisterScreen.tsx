import React, { useState } from 'react';
import './LoginScreen.css';
import { API_BASE } from '../config';

type UserRole = 'client' | 'driver';

interface RegisterScreenProps {
  onRegisterSuccess: (credentials: { userId: string; email: string; sessionToken: string; role: UserRole }) => void;
  onGoToLogin: () => void;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ onRegisterSuccess, onGoToLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleRegister = async () => {
    if (!selectedRole) {
      setError('Please select your role (Customer or Driver)');
      return;
    }

    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!formData.email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!formData.password) {
      setError('Please enter a password');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: selectedRole
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Registration failed');
      }

      setSuccess('Registration successful! Logging you in...');
      
      // Store credentials for easy login
      localStorage.setItem('lastRegisteredUser', JSON.stringify({
        email: data.data.email,
        role: selectedRole
      }));

      // Auto-login after registration
      setTimeout(() => {
        onRegisterSuccess({
          userId: data.data.userId,
          email: data.data.email,
          sessionToken: data.data.sessionToken,
          role: selectedRole
        });
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h1>FlickerSecure</h1>
          <p className="subtitle">Create Your Account</p>
        </div>

        <div className="login-content">
          <h2>Register</h2>
          <p className="description">
            Choose your role and create an account
          </p>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {/* Role Selection */}
          <div className="role-selection">
            <p className="role-label">Register as:</p>
            <div className="role-buttons">
              <button
                onClick={() => setSelectedRole('client')}
                className={`role-btn ${selectedRole === 'client' ? 'selected' : ''}`}
                type="button"
              >
                <span className="role-text">Customer</span>
                <span className="role-desc">Order and track deliveries</span>
              </button>
              <button
                onClick={() => setSelectedRole('driver')}
                className={`role-btn ${selectedRole === 'driver' ? 'selected' : ''}`}
                type="button"
              >
                <span className="role-text">Driver</span>
                <span className="role-desc">Accept and deliver packages</span>
              </button>
            </div>
          </div>

          {/* Registration Form */}
          <form className="register-form" onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm Password *</label>
              <input
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !selectedRole || !formData.name.trim() || !formData.email.trim() || !formData.password}
              className={`create-btn ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Creating Account...
                </>
              ) : (
                selectedRole 
                  ? `Register as ${selectedRole === 'client' ? 'Customer' : 'Driver'}`
                  : 'Select a Role'
              )}
            </button>
          </form>

          <div className="divider">
            <span>Already have an account?</span>
          </div>

          <button
            onClick={onGoToLogin}
            className="secondary-btn"
            type="button"
          >
            Login to Your Account
          </button>

          <div className="info-box">
            <p><strong>Customers:</strong> Create orders and track deliveries</p>
            <p><strong>Drivers:</strong> Accept orders and complete deliveries</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterScreen;
