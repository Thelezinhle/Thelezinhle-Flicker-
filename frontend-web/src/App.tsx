import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import HandshakeScreen from './components/HandshakeScreen';

interface User {
  id: string;
  deviceId: string;
  sessionToken: string;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => {
    // Check for existing session in localStorage
    const savedUser = localStorage.getItem('flickerSecureUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setSessionActive(true);
      } catch (error) {
        console.error('Failed to parse saved user:', error);
        localStorage.removeItem('flickerSecureUser');
      }
    }
    setLoading(false);
  }, []);

  const handleRegister = async () => {
    setLoading(true);
    try {
      const deviceId = `device-${Date.now()}`;
      
      // Generate key pair for the device
      const publicKey = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          publicKey
        })
      });

      const data = await response.json();

      if (data.success) {
        // Auto-login after registration
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
          const newUser = {
            id: loginData.data.userId,
            deviceId: loginData.data.deviceId,
            sessionToken: loginData.data.sessionToken
          };

          setUser(newUser);
          localStorage.setItem('flickerSecureUser', JSON.stringify(newUser));
          toast.success('Registered and logged in successfully!');
        }
      } else {
        toast.error('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('flickerSecureUser');
    setUser(null);
    setSessionActive(false);
    toast.info('Logged out');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
            FlickerSecure
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Secure proximity-based authentication
          </p>

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition mb-4"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Your device will be registered and ready for proximity handshakes
          </p>
        </div>
        <ToastContainer position="top-right" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">FlickerSecure</h1>
            <p className="text-sm text-gray-600">
              Device: {user.deviceId.substring(0, 16)}...
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto">
        {sessionActive ? (
          <div className="mt-8">
            <HandshakeScreen userId={user.id} />
          </div>
        ) : (
          <HandshakeScreen userId={user.id} />
        )}
      </main>

      <ToastContainer position="top-right" />
    </div>
  );
};

export default App;
