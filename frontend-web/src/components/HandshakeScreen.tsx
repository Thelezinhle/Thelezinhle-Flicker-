import React, { useState, useEffect, useRef } from 'react';
import HardwareService from '../services/HardwareService';
import { Copy, QrCode, MapPin, Radio, Zap } from 'lucide-react';

interface HandshakeScreenProps {
  userId: string;
  onSessionStart?: (sessionId: string) => void;
}

export const HandshakeScreen: React.FC<HandshakeScreenProps> = ({
  userId,
  onSessionStart
}) => {
  const [mode, setMode] = useState<'initiator' | 'receiver' | null>(null);
  const [handshakeCode, setHandshakeCode] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [phase, setPhase] = useState<string>('gps');
  const [copied, setCopied] = useState(false);
  const hardwareService = useRef(HardwareService);

  useEffect(() => {
    // Get current location
    getLocation();

    // Listen for real-time updates
    (window as any).addEventListener('proximity-update', handleProximityUpdate);
    (window as any).addEventListener('light-id-detected', handleLightIDDetection);

    return () => {
      (window as any).removeEventListener('proximity-update', handleProximityUpdate);
      (window as any).removeEventListener('light-id-detected', handleLightIDDetection);
    };
  }, []);

  const getLocation = async () => {
    try {
      const loc = await hardwareService.current.getCurrentLocation();
      setLocation({
        lat: loc.latitude,
        lng: loc.longitude
      });
    } catch (error) {
      console.error('Location error:', error);
      setMessage('Unable to get location. Please enable geolocation.');
    }
  };

  const handleProximityUpdate = (event: CustomEvent) => {
    console.log('Proximity update:', event.detail);
    // Update UI with new location data
  };

  const handleLightIDDetection = (event: CustomEvent) => {
    console.log('Light-ID detected:', event.detail);
    setMessage('Light-ID signal detected!');
  };

  const startInitiator = async () => {
    setLoading(true);
    setMessage('Initiating handshake...');
    
    try {
      const result = await hardwareService.current.initiateHandshake(userId);
      
      setHandshakeCode(result.data.handshakeCode);
      setSessionId(result.data.sessionId);
      setMessage(`Code: ${result.data.handshakeCode} - Share with receiver`);
      
      // Connect WebSocket for real-time updates
      hardwareService.current.connectWebSocket(result.data.sessionId);
      
      setPhase('gps');
    } catch (error) {
      setMessage('Failed to initiate handshake');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const joinReceiver = async () => {
    if (!handshakeCode || handshakeCode.length !== 6) {
      setMessage('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setMessage('Joining handshake...');

    try {
      const result = await hardwareService.current.joinHandshake(handshakeCode, userId);
      
      setSessionId(result.data.sessionId);
      setPhase(result.data.phase);
      setMessage(`Joined! Phase: ${result.data.phase}`);
      
      if (onSessionStart) {
        onSessionStart(result.data.sessionId);
      }
    } catch (error) {
      setMessage('Failed to join handshake');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(handshakeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!mode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
            FlickerSecure
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Secure proximity-based handshake
          </p>

          {location && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <MapPin size={16} />
                <span>Location: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={() => setMode('initiator')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              <Zap size={20} />
              Start Handshake
            </button>

            <button
              onClick={() => setMode('receiver')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              <QrCode size={20} />
              Join Handshake
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-4">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => {
            setMode(null);
            setHandshakeCode('');
            setSessionId('');
            hardwareService.current.disconnect();
          }}
          className="mb-4 text-white hover:text-gray-200 font-semibold"
        >
          ← Back
        </button>

        <div className="bg-white rounded-lg shadow-2xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            {mode === 'initiator' ? 'Start Handshake' : 'Join Handshake'}
          </h2>

          {/* Phase Indicator */}
          {sessionId && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <Radio size={16} className="text-green-600" />
                <span className="text-sm font-semibold text-green-800">
                  Phase: {phase.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {mode === 'initiator' ? (
            // Initiator UI
            <div className="space-y-4">
              {!handshakeCode ? (
                <button
                  onClick={startInitiator}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
                >
                  {loading ? 'Initiating...' : 'Generate Code'}
                </button>
              ) : (
                <div>
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
                    <p className="text-sm text-gray-600 mb-2">Share this code:</p>
                    <p className="text-4xl font-mono font-bold text-blue-600 text-center mb-4">
                      {handshakeCode}
                    </p>
                    <button
                      onClick={copyCode}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded flex items-center justify-center gap-2 transition"
                    >
                      <Copy size={16} />
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      ⏳ Waiting for receiver to join... ({phase})
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Receiver UI
            <div className="space-y-4">
              <input
                type="text"
                maxLength={6}
                value={handshakeCode}
                onChange={(e) => setHandshakeCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-mono text-2xl text-center tracking-widest focus:border-purple-600 focus:outline-none"
              />

              <button
                onClick={joinReceiver}
                disabled={loading || handshakeCode.length !== 6}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {loading ? 'Joining...' : 'Join Handshake'}
              </button>
            </div>
          )}

          {message && (
            <div className="mt-6 p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-700 text-center">{message}</p>
            </div>
          )}

          {sessionId && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-gray-600 mb-1">Session ID:</p>
              <p className="text-xs font-mono text-green-700 break-all">
                {sessionId.substring(0, 16)}...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HandshakeScreen;
