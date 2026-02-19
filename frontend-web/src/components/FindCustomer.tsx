/**
 * FindCustomer Component - Real-time "Find Me" feature
 * Customer: Share location (beacon mode)
 * Driver: Navigate to customer with direction arrow + distance
 */

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE, SOCKET_URL } from '../config';
import webBluetoothService, { BluetoothDeviceInfo } from '../services/WebBluetoothService';
import './FindCustomer.css';

interface FindCustomerProps {
  userRole: 'client' | 'driver';
  userId: string;
  orderId: string;
  onClose: () => void;
}

interface CustomerLocation {
  latitude: number;
  longitude: number;
  locationType?: 'live' | 'fixed';
  isDeliveryFallback?: boolean; // True if using order address instead of live sharing
  isStationary?: boolean; // True if customer is standing still
  indoorDetails?: {
    building?: string;
    floor?: string;
    section?: string;
    landmark?: string;
  };
}

interface TrackingData {
  distance: number;
  bearing: number;
  direction: string;
  arrow: string;
  status: 'active' | 'approaching' | 'arrived' | 'completed';
  customerLocation: CustomerLocation;
  message: string;
  eta?: number;
  accuracy?: number;
  arrivalThreshold?: number;
  driverStationary?: boolean;
  customerStationary?: boolean;
}

const FindCustomer: React.FC<FindCustomerProps> = ({ userRole, userId, orderId, onClose }) => {
  // Customer state
  const [beaconActive, setBeaconActive] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationType, setLocationType] = useState<'live' | 'fixed'>('fixed'); // Default to stable fixed location
  const [verificationCode, setVerificationCode] = useState<string | null>(null); // 4-digit code for driver verification
  const [isStationary, setIsStationary] = useState(false); // Track if user is standing still
  
  // Driver state
  const [tracking, setTracking] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [_sessionId, setSessionId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(''); // Driver enters customer's 4-digit code
  const [codeVerified, setCodeVerified] = useState(false); // Whether code was verified
  const [verifyingCode, setVerifyingCode] = useState(false); // Loading state
  
  // Bluetooth state
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDeviceInfo | null>(null);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);
  const [bluetoothScanning, setBluetoothScanning] = useState(false);
  const [bluetoothProximity, setBluetoothProximity] = useState<'connected' | 'disconnected' | 'scanning' | null>(null);
  const [showBluetoothPrompt, setShowBluetoothPrompt] = useState(false);
  
  // iOS detection - important for feature support
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // Socket reference
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Throttle for API calls
  const lastUpdateTimeRef = useRef<number>(0);
  const UPDATE_THROTTLE_MS = 2000; // Only send updates every 2 seconds

  // Initialize Socket.IO
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to ranging service');
      socketRef.current?.emit('join-delivery', orderId);
    });

    // Listen for ranging updates (driver)
    socketRef.current.on('ranging:updated', (data: any) => {
      if (userRole === 'driver' && data.orderId === orderId) {
        setTrackingData({
          distance: data.distance,
          bearing: data.bearing,
          direction: data.direction,
          arrow: data.arrow,
          status: data.status,
          customerLocation: {
            latitude: data.customerLatitude,
            longitude: data.customerLongitude
          },
          message: `${data.distance}m ${data.direction}`,
          eta: data.eta,
          accuracy: data.accuracy,
          arrivalThreshold: data.arrivalThreshold
        });
      }
    });

    // Listen for customer beacon updates (driver)
    socketRef.current.on('customer:location-updated', (data: any) => {
      console.log('Customer location updated:', data);
    });

    // Listen for driver arrival (customer)
    socketRef.current.on('driver:arrived', (data: any) => {
      if (userRole === 'client' && data.orderId === orderId) {
        alert('Driver has found you!');
        stopBeacon();
      }
    });

    return () => {
      socketRef.current?.disconnect();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [orderId, userRole]);

  // === CUSTOMER FUNCTIONS ===

  const startBeacon = async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    setSharingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        // Save customer's own location  
        setMyLocation({ lat: latitude, lng: longitude });

        try {
          const response = await fetch(`${API_BASE}/ranging/beacon/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId: userId,
              orderId,
              latitude,
              longitude,
              accuracy,
              locationType // Send live or fixed mode
            })
          });

          const data = await response.json();
          
          if (data.success) {
            setBeaconActive(true);
            // Store verification code to show to customer
            if (data.data.verificationCode) {
              setVerificationCode(data.data.verificationCode);
            }
            // Only start continuous updates for live mode
            if (locationType === 'live') {
              startContinuousLocationUpdates();
            }
          } else {
            setLocationError(data.message || 'Failed to start beacon');
            setSharingLocation(false);
          }
        } catch (error) {
          console.error('Error starting beacon:', error);
          setLocationError('Network error - check your internet connection');
          setSharingLocation(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        // Provide specific error messages for common issues
        let errorMsg = 'Could not get location.';
        const isiOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = isiOSDevice 
              ? 'Location denied. Go to Settings > Safari > Location > Allow'
              : 'Location access denied. Please allow location in browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = isiOSDevice
              ? 'Location unavailable. Make sure Location Services is ON in Settings > Privacy > Location Services'
              : 'Location unavailable. Try moving to an open area.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        }
        setLocationError(errorMsg);
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startContinuousLocationUpdates = () => {
    // Use watchPosition for continuous updates with throttling
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy, heading } = position.coords;
        const now = Date.now();
        
        // Send RAW GPS to server - smoothing is done server-side
        setMyLocation({ lat: latitude, lng: longitude });

        // Throttle API calls to every 2 seconds
        if (now - lastUpdateTimeRef.current < UPDATE_THROTTLE_MS) {
          return; // Skip this update
        }
        lastUpdateTimeRef.current = now;

        try {
          const response = await fetch(`${API_BASE}/ranging/beacon/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              latitude, // Send RAW GPS - server applies smoothing
              longitude,
              accuracy,
              heading
            })
          });
          
          const data = await response.json();
          if (data.success && data.isStationary !== undefined) {
            setIsStationary(data.isStationary);
          }
        } catch (error) {
          console.error('Error updating location:', error);
        }
      },
      (error) => {
        console.error('Watch position error:', error);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 1000  // Allow 1 second cache to reduce jitter
      }
    );
  };

  const stopBeacon = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    try {
      await fetch(`${API_BASE}/ranging/beacon/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
    } catch (error) {
      console.error('Error stopping beacon:', error);
    }

    setBeaconActive(false);
    setSharingLocation(false);
  };

  // === DRIVER FUNCTIONS ===

  const startTracking = async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    setTracking(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        
        // Save driver's own location
        setMyLocation({ lat: latitude, lng: longitude });

        try {
          const response = await fetch(`${API_BASE}/ranging/track/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              driverId: userId,
              orderId,
              latitude,
              longitude,
              accuracy,
              heading,
              speed
            })
          });

          const data = await response.json();
          
          if (data.success) {
            setSessionId(data.data.sessionId);
            setTrackingData({
              distance: data.data.distance,
              bearing: data.data.bearing,
              direction: data.data.direction,
              arrow: data.data.arrow,
              status: data.data.status,
              customerLocation: data.data.customerLocation,
              message: `${data.data.distance}m to customer`,
              accuracy: data.data.accuracy,
              arrivalThreshold: data.data.arrivalThreshold,
              driverStationary: data.data.driverStationary
            });
            startContinuousTracking(data.data.sessionId);
          } else {
            // Show detailed error with hint if available
            const errorMsg = data.hint 
              ? `${data.message}\n\n${data.hint}` 
              : (data.message || 'Customer is not sharing location');
            setLocationError(errorMsg);
            setTracking(false);
          }
        } catch (error) {
          console.error('Error starting tracking:', error);
          setLocationError('Network error - check your internet connection');
          setTracking(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        // Provide specific error messages for common issues
        let errorMsg = 'Could not get location.';
        const isiOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = isiOSDevice 
              ? 'Location denied. Go to Settings > Safari > Location > Allow'
              : 'Location access denied. Please allow location in browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = isiOSDevice
              ? 'Location unavailable. Make sure Location Services is ON in Settings > Privacy > Location Services'
              : 'Location unavailable. Try moving to an open area.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        }
        setLocationError(errorMsg);
        setTracking(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startContinuousTracking = (sid: string) => {
    // Use watchPosition for continuous real-time updates (like customer beacon)
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        
        // Update driver's own location
        setMyLocation({ lat: latitude, lng: longitude });

        try {
          const response = await fetch(`${API_BASE}/ranging/track/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sid,
              latitude,
              longitude,
              accuracy,
              heading,
              speed
            })
          });

          const data = await response.json();
          
          if (data.success) {
            setTrackingData({
              distance: data.data.distance,
              bearing: data.data.bearing,
              direction: data.data.direction,
              arrow: data.data.arrow,
              status: data.data.status,
              customerLocation: data.data.customerLocation,
              message: data.data.message,
              accuracy: data.data.accuracy,
              arrivalThreshold: data.data.arrivalThreshold,
              driverStationary: data.data.driverStationary,
              customerStationary: data.data.customerLocation?.isStationary
            });

            // DON'T auto-complete - driver must manually confirm they found customer
            // Status 'arrived' just means "close enough to look around"
            // The prominent "I Found Customer" button handles manual confirmation
            
            // Show Bluetooth prompt when within 15m for proximity verification
            if (data.data.distance <= 15 && bluetoothSupported && !bluetoothDevice && !showBluetoothPrompt) {
              setShowBluetoothPrompt(true);
            }
          }
        } catch (error) {
          console.error('Error updating tracking:', error);
        }
      },
      (error) => {
        console.error('Watch position error:', error);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 5000, 
        maximumAge: 0 // Always get fresh position
      }
    );
  };

  const stopTracking = () => {
    // Stop watchPosition
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    setTracking(false);
    setTrackingData(null);
    setSessionId(null);
  };

  // Check Bluetooth support on mount (NOT supported on iOS!)
  useEffect(() => {
    const support = webBluetoothService.checkSupport();
    // Web Bluetooth doesn't work on iOS even in Chrome (uses WebKit underneath)
    const isiOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setBluetoothSupported(support.supported && !isiOSDevice);
  }, []);

  // Scan for customer's device via Bluetooth
  const scanBluetooth = async () => {
    setBluetoothScanning(true);
    setBluetoothProximity('scanning');
    setShowBluetoothPrompt(false);
    try {
      const device = await webBluetoothService.scanForDevices();
      if (device) {
        setBluetoothDevice(device);
        // Try to connect
        const connected = await webBluetoothService.connect();
        if (connected) {
          setBluetoothProximity('connected');
          // Bluetooth connected = within ~10m, likely within 1-5m for reliable connection
          alert('✅ Bluetooth connected! Customer is very close (within 5-10m). Look around!');
        } else {
          setBluetoothProximity('disconnected');
        }
      } else {
        setBluetoothProximity('disconnected');
      }
    } catch (error: any) {
      console.error('Bluetooth scan error:', error);
      setBluetoothProximity('disconnected');
      // Don't alert if user cancelled - just log
      if (error.name !== 'NotFoundError') {
        alert(error.message || 'Failed to scan for devices');
      }
    } finally {
      setBluetoothScanning(false);
    }
  };

  const markArrived = async () => {
    try {
      await fetch(`${API_BASE}/ranging/arrived`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          driverId: userId
        })
      });

      stopTracking();
      alert('Customer found! The customer has been notified.');
      onClose();
    } catch (error) {
      console.error('Error marking arrived:', error);
    }
  };

  // Verify customer's 4-digit code
  const verifyCode = async () => {
    if (codeInput.length !== 4) {
      alert('Please enter the 4-digit code from the customer');
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await fetch(`${API_BASE}/ranging/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          driverId: userId,
          code: codeInput
        })
      });

      const data = await response.json();
      
      if (data.success && data.verified) {
        setCodeVerified(true);
        stopTracking();
        alert('✅ Code verified! Customer confirmed. Delivery complete!');
        onClose();
      } else {
        alert(data.message || 'Incorrect code. Please try again.');
        setCodeInput('');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      alert('Failed to verify code. Please try again.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Render different views for customer and driver
  if (userRole === 'client') {
    return (
      <div className="find-customer-overlay">
        <div className="find-customer-modal customer-mode">
          <button className="close-btn" onClick={onClose}>X</button>
          
          <div className="modal-header">
            <h2>Share Your Location</h2>
            <p>Let the driver find you exactly</p>
          </div>

          {/* GPS Limitation Warning */}
          <div className="gps-warning-banner" style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            padding: '12px 16px',
            margin: '10px 0 15px 0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '16px', marginBottom: '6px' }}>📡 GPS Technology Limits</div>
            <div style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.4' }}>
              <strong>Web browsers use GPS: ±3-10m outdoors, ±10-50m indoors</strong><br/>
              For centimeter accuracy, use our <strong>mobile app with UWB</strong> on iPhone 11+
            </div>
          </div>

          {/* iOS-specific warning */}
          {isIOS && (
            <div style={{
              background: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
              border: '2px solid #ef4444',
              borderRadius: '12px',
              padding: '12px 16px',
              margin: '0 0 15px 0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b', marginBottom: '6px' }}>
                📱 iPhone Detected
              </div>
              <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: '1.4' }}>
                <strong>GPS works but Bluetooth does NOT work on iPhone browsers.</strong><br/>
                For full features including UWB, download our <strong>native iOS app</strong>.
              </div>
            </div>
          )}

          {locationError && (
            <div className="error-banner">{locationError}</div>
          )}

          {!beaconActive ? (
            <div className="beacon-start">
              <div className="beacon-icon pulse-animation">&#128205;</div>
              <p>Choose how to share your location with the driver:</p>
              
              {/* Location type toggle */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '15px',
                justifyContent: 'center'
              }}>
                <button
                  onClick={() => setLocationType('fixed')}
                  style={{
                    padding: '10px 20px',
                    border: locationType === 'fixed' ? '2px solid #10b981' : '2px solid #ddd',
                    borderRadius: '8px',
                    background: locationType === 'fixed' ? '#d1fae5' : '#f9fafb',
                    color: locationType === 'fixed' ? '#065f46' : '#374151',
                    cursor: 'pointer',
                    fontWeight: locationType === 'fixed' ? 'bold' : 'normal'
                  }}
                >
                  📍 Fixed Location
                  <div style={{ fontSize: '10px', marginTop: '4px' }}>
                    More stable & reliable
                  </div>
                </button>
                <button
                  onClick={() => setLocationType('live')}
                  style={{
                    padding: '10px 20px',
                    border: locationType === 'live' ? '2px solid #3b82f6' : '2px solid #ddd',
                    borderRadius: '8px',
                    background: locationType === 'live' ? '#dbeafe' : '#f9fafb',
                    color: locationType === 'live' ? '#1e40af' : '#374151',
                    cursor: 'pointer',
                    fontWeight: locationType === 'live' ? 'bold' : 'normal'
                  }}
                >
                  🔴 Live Location
                  <div style={{ fontSize: '10px', marginTop: '4px' }}>
                    Updates as you move
                  </div>
                </button>
              </div>
              
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                {locationType === 'fixed' 
                  ? '✅ Your current spot will be shared (stable, recommended)' 
                  : '⚠️ Location updates continuously (may jump around)'}
              </p>
              
              <button 
                className="start-beacon-btn" 
                onClick={startBeacon}
                disabled={sharingLocation}
              >
                {sharingLocation ? 'Starting...' : "I'm Waiting Here"}
              </button>
            </div>
          ) : (
            <div className="beacon-active">
              <div className="beacon-icon active-pulse">&#128205;</div>
              <h3>Location Sharing Active</h3>
              <p>The driver can now see your exact location and navigate to you</p>
              
              {/* VERIFICATION CODE - Show prominently */}
              {verificationCode && (
                <div style={{
                  margin: '15px 0',
                  padding: '20px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  borderRadius: '16px',
                  textAlign: 'center',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', marginBottom: '8px' }}>
                    Tell the driver your code:
                  </div>
                  <div style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: 'white',
                    letterSpacing: '12px',
                    fontFamily: 'monospace',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {verificationCode}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', marginTop: '8px' }}>
                    Driver will ask for this code to confirm they found you
                  </div>
                </div>
              )}
              
              {/* Show location type badge */}
              <div style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '20px',
                marginTop: '10px',
                background: locationType === 'fixed' ? '#d1fae5' : '#dbeafe',
                color: locationType === 'fixed' ? '#065f46' : '#1e40af',
                fontWeight: 'bold',
                fontSize: '12px'
              }}>
                {locationType === 'fixed' ? '📍 Fixed Location' : '🔴 Live Location'}
                {locationType === 'live' && isStationary && ' (stable)'}
              </div>
              
              {/* Show customer's own GPS */}
              <div style={{
                marginTop: '12px',
                padding: '10px',
                background: isStationary ? '#d1fae5' : '#e8f5e9',
                border: isStationary ? '2px solid #10b981' : 'none',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#1e3a5f',
                textAlign: 'center'
              }}>
                <strong>📍 Your GPS {locationType === 'live' ? '(LIVE)' : '(FIXED)'}:</strong>
                {isStationary && <span style={{ color: '#059669', marginLeft: '5px' }}>✅ Stable</span>}
                <br/>
                Lat: {myLocation?.lat?.toFixed(6) ?? 'Loading...'}<br/>
                Lng: {myLocation?.lng?.toFixed(6) ?? 'Loading...'}
              </div>
              
              <div className="sharing-indicator">
                <span className="dot"></span>
                <span>{locationType === 'live' ? 'Live sharing...' : 'Fixed location shared'}</span>
              </div>
              <button className="stop-beacon-btn" onClick={stopBeacon}>
                Stop Sharing
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Driver view
  return (
    <div className="find-customer-overlay">
      <div className="find-customer-modal driver-mode">
        <button className="close-btn" onClick={onClose}>X</button>
        
        <div className="modal-header">
          <h2>Find Customer</h2>
          <p>Navigate to the customer's exact location</p>
        </div>

        {/* GPS Limitation Warning */}
        <div className="gps-warning-banner" style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2px solid #f59e0b',
          borderRadius: '12px',
          padding: '12px 16px',
          margin: '10px 0 15px 0',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '16px', marginBottom: '6px' }}>📡 GPS Accuracy: ±3-50 meters</div>
          <div style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.4' }}>
            GPS gets you <strong>close</strong>, then look around for the customer.<br/>
            {isIOS ? (
              <span>Use the <strong>4-digit code</strong> to verify you found the right person.</span>
            ) : (
              <span>Use <strong>Bluetooth scan</strong> below when within 10m for proximity confirmation.</span>
            )}
          </div>
        </div>

        {/* iOS-specific warning */}
        {isIOS && (
          <div style={{
            background: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '12px 16px',
            margin: '0 0 15px 0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b', marginBottom: '6px' }}>
              📱 iPhone Detected
            </div>
            <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: '1.4' }}>
              <strong>Bluetooth does NOT work on iPhone browsers.</strong><br/>
              GPS tracking works! Ask customer for their <strong>4-digit code</strong> to verify.
            </div>
          </div>
        )}

        {locationError && (
          <div className="error-banner">{locationError}</div>
        )}

        {!tracking ? (
          <div className="tracking-start">
            <div className="compass-icon">&#127922;</div>
            <p>Start tracking to see direction and distance to the customer</p>
            <button className="start-tracking-btn" onClick={startTracking}>
              Start Finding Customer
            </button>
          </div>
        ) : trackingData ? (
          <div className="tracking-active">
            
            {/* 🚨 PROMINENT "FOUND CUSTOMER" BUTTON - Show at TOP when within 30m */}
            {trackingData.distance <= 30 && !codeVerified && (
              <div style={{
                marginBottom: '15px',
                padding: '20px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: '16px',
                textAlign: 'center',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)',
                animation: 'pulse 1.5s infinite'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>👀🔍</div>
                <div style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                  YOU'RE CLOSE! LOOK AROUND!
                </div>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', marginBottom: '12px' }}>
                  GPS says ~{trackingData.distance}m but you might be closer!<br/>
                  <strong>GPS accuracy is ±5-20m</strong> - look for the customer visually
                </div>
                <button
                  onClick={markArrived}
                  style={{
                    padding: '15px 30px',
                    background: 'white',
                    color: '#059669',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
                  }}
                >
                  ✅ I SEE THE CUSTOMER!
                </button>
              </div>
            )}

            {/* Big direction arrow */}
            <div className={`direction-arrow ${trackingData.status}`}>
              <span className="arrow">{trackingData.arrow}</span>
            </div>

            {/* Distance display with GPS INACCURACY indicator */}
            <div className="distance-display">
              <span className="distance">{trackingData.distance}</span>
              <span className="unit">meters</span>
              <span className="direction-text">{trackingData.direction}</span>
              {trackingData.distance <= 30 && (
                <span style={{
                  display: 'block',
                  fontSize: '11px',
                  color: '#f59e0b',
                  marginTop: '4px'
                }}>
                  ⚠️ GPS accuracy: ±{trackingData.accuracy || 10}m
                </span>
              )}
            </div>

            {/* GPS Reality Warning - ENHANCED for when distance seems stuck */}
            {trackingData.distance > 0 && trackingData.distance <= 50 && (
              <div style={{
                marginTop: '10px',
                padding: '12px',
                background: trackingData.distance <= 20 
                  ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' 
                  : '#fef3c7',
                border: trackingData.distance <= 20 ? '2px solid #f59e0b' : '1px solid #f59e0b',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#92400e',
                textAlign: 'center'
              }}>
                {trackingData.distance <= 20 ? (
                  <>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>
                      🎯 GPS shows {trackingData.distance}m - YOU'RE VERY CLOSE!
                    </div>
                    <div style={{ fontSize: '11px' }}>
                      GPS can't be more accurate in browsers.<br/>
                      <strong>Stand up, look around in all directions!</strong><br/>
                      The customer should be within sight.
                    </div>
                  </>
                ) : (
                  <>
                    <strong>GPS shows {trackingData.distance}m</strong> - keep walking {trackingData.direction}.<br/>
                    When close, look around visually for the customer.
                  </>
                )}
              </div>
            )}

            {/* Stationary indicator - BOTH standing still = most reliable reading */}
            {(trackingData.driverStationary || trackingData.customerStationary) && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: trackingData.driverStationary && trackingData.customerStationary 
                  ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
                  : '#e0f2fe',
                border: trackingData.driverStationary && trackingData.customerStationary 
                  ? '2px solid #10b981' : '1px solid #3b82f6',
                borderRadius: '8px',
                fontSize: '11px',
                textAlign: 'center'
              }}>
                {trackingData.driverStationary && trackingData.customerStationary ? (
                  <>
                    <strong>✅ STABLE READING</strong> - Both standing still, distance is accurate
                  </>
                ) : trackingData.driverStationary ? (
                  <>📍 You are standing still (GPS stabilized)</>
                ) : (
                  <>📍 Customer is standing still (their GPS is stable)</>
                )}
              </div>
            )}

            {/* Status message - ENHANCED for GPS inaccuracy */}
            <div className={`status-message ${trackingData.status}`} style={{
              padding: '10px 15px',
              borderRadius: '8px',
              marginTop: '8px',
              background: trackingData.status === 'arrived' ? '#d1fae5' : 
                          trackingData.status === 'approaching' ? '#fef3c7' : '#f3f4f6'
            }}>
              {trackingData.status === 'arrived' && (
                <>✅ GPS: ARRIVED ZONE! Look around in all directions!</>
              )}
              {trackingData.status === 'approaching' && (
                <>🔥 Getting close ({trackingData.distance}m)! Start looking around!</>
              )}
              {trackingData.status === 'active' && trackingData.distance <= 50 && (
                <>📍 ~{trackingData.distance}m away - keep walking {trackingData.direction}</> 
              )}
              {trackingData.status === 'active' && trackingData.distance > 50 && (
                <>🚶 {trackingData.distance}m to customer - walk {trackingData.direction}</>
              )}
            </div>

            {/* CODE VERIFICATION - Ask customer for 4-digit code */}
            {trackingData.distance <= 50 && !codeVerified && (
              <div style={{
                marginTop: '15px',
                padding: '20px',
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                border: '2px solid #3b82f6',
                borderRadius: '16px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px' }}>
                  🔐 Ask Customer for Their Code
                </div>
                <div style={{ fontSize: '12px', color: '#3730a3', marginBottom: '15px' }}>
                  The customer has a 4-digit code on their screen. Enter it to verify you found the right person.
                </div>
                
                {/* 4-digit code input */}
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                  style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    letterSpacing: '10px',
                    textAlign: 'center',
                    width: '150px',
                    padding: '10px',
                    border: '3px solid #3b82f6',
                    borderRadius: '12px',
                    marginBottom: '15px'
                  }}
                />
                
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={verifyCode}
                    disabled={codeInput.length !== 4 || verifyingCode}
                    style={{
                      padding: '12px 24px',
                      background: codeInput.length === 4 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      cursor: codeInput.length === 4 ? 'pointer' : 'not-allowed',
                      boxShadow: codeInput.length === 4 ? '0 4px 14px rgba(16, 185, 129, 0.4)' : 'none'
                    }}
                  >
                    {verifyingCode ? '⏳ Verifying...' : '✅ Verify Code'}
                  </button>
                  
                  <button
                    onClick={markArrived}
                    style={{
                      padding: '12px 24px',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Skip (Found Anyway)
                  </button>
                </div>
              </div>
            )}

            {/* Customer location type badge */}
            {trackingData.customerLocation && (
              <div style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '20px',
                marginTop: '10px',
                background: trackingData.customerLocation.isDeliveryFallback 
                  ? '#fef3c7' 
                  : (trackingData.customerLocation.locationType === 'fixed' ? '#d1fae5' : '#dbeafe'),
                color: trackingData.customerLocation.isDeliveryFallback 
                  ? '#92400e' 
                  : (trackingData.customerLocation.locationType === 'fixed' ? '#065f46' : '#1e40af'),
                fontWeight: 'bold',
                fontSize: '11px'
              }}>
                {trackingData.customerLocation.isDeliveryFallback 
                  ? '📦 Using Delivery Address (customer offline)'
                  : (trackingData.customerLocation.locationType === 'fixed' 
                    ? '📍 Customer: Fixed Location (stable)' 
                    : '🔴 Customer: Live Location (updates)')}
              </div>
            )}

            {/* GPS accuracy info */}
            {trackingData.accuracy && (
              <div className="gps-accuracy" style={{
                marginTop: '8px',
                padding: '8px',
                background: trackingData.accuracy > 15 ? '#fff3cd' : '#d4edda',
                borderRadius: '6px',
                fontSize: '11px',
                color: trackingData.accuracy > 15 ? '#856404' : '#155724',
                textAlign: 'center'
              }}>
                📡 GPS Accuracy: ±{Math.round(trackingData.accuracy)}m
                {trackingData.accuracy > 15 && ' (Poor signal - try open area)'}
                {trackingData.arrivalThreshold && trackingData.arrivalThreshold > 1 && (
                  <span> | Arrival at ~{trackingData.arrivalThreshold.toFixed(0)}m</span>
                )}
              </div>
            )}

            {/* Real GPS coordinates display - showing both locations */}
            <div className="gps-coords" style={{
              marginTop: '12px',
              padding: '12px',
              background: '#f0f7ff',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#1e3a5f',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px'
            }}>
              <div style={{ borderRight: '1px solid #ddd', paddingRight: '10px' }}>
                <strong>🚗 Your GPS (LIVE):</strong><br/>
                Lat: {myLocation?.lat?.toFixed(6) ?? 'Loading...'}<br/>
                Lng: {myLocation?.lng?.toFixed(6) ?? 'Loading...'}
              </div>
              <div style={{ paddingLeft: '10px' }}>
                <strong>📍 Customer GPS ({trackingData.customerLocation?.locationType === 'live' ? 'LIVE' : 'FIXED'}):</strong><br/>
                Lat: {trackingData.customerLocation?.latitude?.toFixed(6) ?? 'Unknown'}<br/>
                Lng: {trackingData.customerLocation?.longitude?.toFixed(6) ?? 'Unknown'}
              </div>
            </div>
            <p style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '6px' }}>
              Distance = Haversine formula on real GPS coords
            </p>

            {/* ETA if available */}
            {trackingData.eta && trackingData.eta > 0 && (
              <div className="eta">~{trackingData.eta} min walking</div>
            )}

            {/* Customer indoor details if available */}
            {trackingData.customerLocation.indoorDetails && (
              <div className="indoor-details">
                {trackingData.customerLocation.indoorDetails.building && (
                  <span>Building: {trackingData.customerLocation.indoorDetails.building}</span>
                )}
                {trackingData.customerLocation.indoorDetails.floor && (
                  <span>Floor: {trackingData.customerLocation.indoorDetails.floor}</span>
                )}
              </div>
            )}

            {/* AUTO BLUETOOTH PROMPT - Shows when within 15m */}
            {showBluetoothPrompt && bluetoothSupported && !bluetoothDevice && (
              <div className="bluetooth-prompt" style={{
                marginTop: '15px',
                padding: '15px',
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                border: '2px solid #3b82f6',
                borderRadius: '12px',
                textAlign: 'center',
                animation: 'pulse 2s infinite'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔵📱</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>
                  You're Close! Use Bluetooth to Verify
                </div>
                <div style={{ fontSize: '11px', color: '#3730a3', marginBottom: '12px' }}>
                  GPS says ~{trackingData.distance}m away. Bluetooth can confirm if you're within 5-10m of the customer's phone.
                </div>
                <button
                  onClick={scanBluetooth}
                  disabled={bluetoothScanning}
                  style={{
                    padding: '10px 20px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginRight: '8px'
                  }}
                >
                  {bluetoothScanning ? '🔄 Scanning...' : '🔵 Scan for Customer Device'}
                </button>
                <button
                  onClick={() => setShowBluetoothPrompt(false)}
                  style={{
                    padding: '10px 15px',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Skip
                </button>
              </div>
            )}

            {/* Bluetooth proximity status indicator */}
            {bluetoothProximity === 'connected' && (
              <div style={{
                marginTop: '10px',
                padding: '12px',
                background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                border: '2px solid #10b981',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#065f46' }}>
                  ✅ BLUETOOTH CONFIRMED: Customer is within 5-10m!
                </div>
                <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>
                  Look around - you should be able to see them now
                </div>
              </div>
            )}

            {/* Bluetooth proximity verification */}
            {bluetoothSupported && (
              <div className="bluetooth-section" style={{
                marginTop: '15px',
                padding: '12px',
                background: '#f0f4ff',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <p style={{ fontSize: '12px', color: '#555', marginBottom: '8px' }}>
                  🔵 Bluetooth Proximity (works in Chrome/Edge)
                </p>
                {bluetoothDevice ? (
                  <div style={{ color: '#10b981', fontWeight: 'bold' }}>
                    ✅ Connected to: {bluetoothDevice.name}
                  </div>
                ) : (
                  <button
                    onClick={scanBluetooth}
                    disabled={bluetoothScanning}
                    style={{
                      padding: '8px 16px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {bluetoothScanning ? 'Scanning...' : '🔵 Scan for Customer'}
                  </button>
                )}
              </div>
            )}

            {/* Action buttons - ENHANCED with prominent "Found" button */}
            <div className="tracking-actions" style={{
              marginTop: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {/* Primary action - HUGE green button */}
              <button 
                className="arrived-btn" 
                onClick={markArrived}
                style={{
                  padding: '18px 30px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '14px',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                  transition: 'transform 0.2s'
                }}
              >
                ✅ I FOUND THE CUSTOMER!
              </button>
              
              {/* Secondary action */}
              <button 
                className="stop-tracking-btn" 
                onClick={stopTracking}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel Search
              </button>
            </div>
            
            {/* GPS Limitation Footer */}
            <div style={{
              marginTop: '15px',
              padding: '12px',
              background: '#f0f4ff',
              borderRadius: '10px',
              fontSize: '10px',
              color: '#6b7280',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              📡 <strong>Web GPS Accuracy: ±5-50 meters</strong><br/>
              GPS in browsers can't pinpoint exact location like native apps.<br/>
              When within 30m, use visual search + 4-digit code verification.
            </div>
          </div>
        ) : (
          <div className="loading">
            <div className="spinner"></div>
            <p>Getting location...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FindCustomer;
