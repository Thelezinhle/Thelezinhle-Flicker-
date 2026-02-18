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
}

const FindCustomer: React.FC<FindCustomerProps> = ({ userRole, userId, orderId, onClose }) => {
  // Customer state
  const [beaconActive, setBeaconActive] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Driver state
  const [tracking, setTracking] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [_sessionId, setSessionId] = useState<string | null>(null);
  
  // Bluetooth state
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDeviceInfo | null>(null);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);
  const [bluetoothScanning, setBluetoothScanning] = useState(false);
  
  // Socket reference
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          eta: data.eta
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
              accuracy
            })
          });

          const data = await response.json();
          
          if (data.success) {
            setBeaconActive(true);
            startContinuousLocationUpdates();
          } else {
            setLocationError(data.message || 'Failed to start beacon');
            setSharingLocation(false);
          }
        } catch (error) {
          console.error('Error starting beacon:', error);
          setLocationError('Network error');
          setSharingLocation(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        setLocationError('Could not get location. Please enable location access.');
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startContinuousLocationUpdates = () => {
    // Use watchPosition for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy, heading } = position.coords;
        
        // Update customer's own location
        setMyLocation({ lat: latitude, lng: longitude });

        try {
          await fetch(`${API_BASE}/ranging/beacon/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              latitude,
              longitude,
              accuracy,
              heading
            })
          });
        } catch (error) {
          console.error('Error updating location:', error);
        }
      },
      (error) => {
        console.error('Watch position error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
              message: `${data.data.distance}m to customer`
            });
            startContinuousTracking(data.data.sessionId);
          } else {
            setLocationError(data.message || 'Customer is not sharing location');
            setTracking(false);
          }
        } catch (error) {
          console.error('Error starting tracking:', error);
          setLocationError('Network error');
          setTracking(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        setLocationError('Could not get location');
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
              message: data.data.message
            });

            // Auto-stop if arrived (within 1 meter)
            if (data.data.status === 'arrived') {
              markArrived();
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

  // Check Bluetooth support on mount
  useEffect(() => {
    const support = webBluetoothService.checkSupport();
    setBluetoothSupported(support.supported);
  }, []);

  // Scan for customer's device via Bluetooth
  const scanBluetooth = async () => {
    setBluetoothScanning(true);
    try {
      const device = await webBluetoothService.scanForDevices();
      if (device) {
        setBluetoothDevice(device);
        // Try to connect
        await webBluetoothService.connect();
      }
    } catch (error: any) {
      console.error('Bluetooth scan error:', error);
      alert(error.message || 'Failed to scan for devices');
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

          {locationError && (
            <div className="error-banner">{locationError}</div>
          )}

          {!beaconActive ? (
            <div className="beacon-start">
              <div className="beacon-icon pulse-animation">&#128205;</div>
              <p>Tap the button below to share your exact location with the driver</p>
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
              
              {/* Show customer's own GPS */}
              <div style={{
                marginTop: '12px',
                padding: '10px',
                background: '#e8f5e9',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#1e3a5f',
                textAlign: 'center'
              }}>
                <strong>📍 Your GPS (LIVE):</strong><br/>
                Lat: {myLocation?.lat?.toFixed(6) ?? 'Loading...'}<br/>
                Lng: {myLocation?.lng?.toFixed(6) ?? 'Loading...'}
              </div>
              
              <div className="sharing-indicator">
                <span className="dot"></span>
                <span>Live sharing...</span>
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
            {/* Big direction arrow */}
            <div className={`direction-arrow ${trackingData.status}`}>
              <span className="arrow">{trackingData.arrow}</span>
            </div>

            {/* Distance display */}
            <div className="distance-display">
              <span className="distance">{trackingData.distance}</span>
              <span className="unit">meters</span>
              <span className="direction-text">{trackingData.direction}</span>
            </div>

            {/* Status message */}
            <div className={`status-message ${trackingData.status}`}>
              {trackingData.status === 'arrived' && 'You have arrived!'}
              {trackingData.status === 'approaching' && 'Getting close!'}
              {trackingData.status === 'active' && 'Keep walking...'}
            </div>

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
                <strong>📍 Customer GPS (LIVE):</strong><br/>
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

            {/* Action buttons */}
            <div className="tracking-actions">
              <button className="arrived-btn" onClick={markArrived}>
                I Found Customer
              </button>
              <button className="stop-tracking-btn" onClick={stopTracking}>
                Stop Tracking
              </button>
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
