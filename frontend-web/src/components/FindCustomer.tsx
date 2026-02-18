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
}

const FindCustomer: React.FC<FindCustomerProps> = ({ userRole, userId, orderId, onClose }) => {
  // Customer state
  const [beaconActive, setBeaconActive] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationType, setLocationType] = useState<'live' | 'fixed'>('fixed'); // Default to stable fixed location
  
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
  
  // GPS smoothing - store last 5 locations for averaging
  const locationHistoryRef = useRef<{lat: number, lng: number, timestamp: number}[]>([]);
  const lastUpdateTimeRef = useRef<number>(0);
  const UPDATE_THROTTLE_MS = 2000; // Only send updates every 2 seconds

  // Smooth GPS coordinates using moving average
  const smoothLocation = (lat: number, lng: number): {lat: number, lng: number} => {
    const now = Date.now();
    const history = locationHistoryRef.current;
    
    // Add new location
    history.push({ lat, lng, timestamp: now });
    
    // Keep only last 5 readings (last 10 seconds max)
    while (history.length > 5 || (history.length > 1 && now - history[0].timestamp > 10000)) {
      history.shift();
    }
    
    // Calculate weighted average (newer readings have more weight)
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLng = 0;
    
    history.forEach((loc, index) => {
      const weight = index + 1; // 1, 2, 3, 4, 5
      weightedLat += loc.lat * weight;
      weightedLng += loc.lng * weight;
      totalWeight += weight;
    });
    
    return {
      lat: weightedLat / totalWeight,
      lng: weightedLng / totalWeight
    };
  };

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
    // Use watchPosition for continuous updates with throttling
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy, heading } = position.coords;
        const now = Date.now();
        
        // Apply GPS smoothing to reduce jitter
        const smoothed = smoothLocation(latitude, longitude);
        
        // Update customer's own location (smoothed)
        setMyLocation({ lat: smoothed.lat, lng: smoothed.lng });

        // Throttle API calls to every 2 seconds
        if (now - lastUpdateTimeRef.current < UPDATE_THROTTLE_MS) {
          return; // Skip this update
        }
        lastUpdateTimeRef.current = now;

        try {
          await fetch(`${API_BASE}/ranging/beacon/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              latitude: smoothed.lat,
              longitude: smoothed.lng,
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
              message: `${data.data.distance}m to customer`
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
              </div>
              
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
                <strong>📍 Your GPS {locationType === 'live' ? '(LIVE)' : '(FIXED)'}:</strong><br/>
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
              {trackingData.status === 'arrived' && '✅ You have arrived! Look around for the customer.'}
              {trackingData.status === 'approaching' && '🔥 Getting close! Customer is nearby.'}
              {trackingData.status === 'active' && 'Keep walking...'}
            </div>

            {/* Customer location type badge */}
            {trackingData.customerLocation?.locationType && (
              <div style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '20px',
                marginTop: '10px',
                background: trackingData.customerLocation.locationType === 'fixed' ? '#d1fae5' : '#dbeafe',
                color: trackingData.customerLocation.locationType === 'fixed' ? '#065f46' : '#1e40af',
                fontWeight: 'bold',
                fontSize: '11px'
              }}>
                {trackingData.customerLocation.locationType === 'fixed' 
                  ? '📍 Customer: Fixed Location (stable)' 
                  : '🔴 Customer: Live Location (updates)'}
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
