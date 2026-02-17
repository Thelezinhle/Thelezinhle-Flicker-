/**
 * DriverDashboard - Driver view for accepting and managing deliveries
 * Shows available orders, active delivery tracking, and location updates
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import './Dashboard.css';
import { API_BASE, SOCKET_URL } from '../config';

interface Location {
  latitude: number;
  longitude: number;
}

interface PendingOrder {
  deliveryId: string;
  description: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  createdAt: string;
}

interface ActiveDelivery {
  deliveryId: string;
  orderId: string;
  status: string;
  currentLocation: Location | null;
  customerLocation: Location | null;
  restaurantLocation: Location | null;
  distanceToCustomer: number;
  distanceToRestaurant: number;
  eta: number;
  description?: string;
}

declare global {
  interface Window {
    L: any;
  }
}

const DriverDashboard: React.FC = () => {
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  // pendingOrders will be used when we add order queue feature
  const [_pendingOrders, _setPendingOrders] = useState<PendingOrder[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [driverId] = useState(() => `driver-${Date.now().toString(36)}`);
  
  const socketRef = useRef<Socket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const restaurantMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Get driver's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMyLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => {
          // Default to Johannesburg area
          setMyLocation({ latitude: -26.1071, longitude: 28.0565 });
        }
      );
    }
  }, []);

  // Initialize Socket.IO
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000
    });

    socketRef.current.on('connect', () => {
      console.log('Driver connected to real-time updates');
    });

    socketRef.current.on('new-order', (data: any) => {
      console.log('New order available:', data);
      fetchPendingOrders();
    });

    return () => {
      socketRef.current?.disconnect();
      if (simulationRef.current) clearInterval(simulationRef.current);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Watch real GPS when online
  useEffect(() => {
    if (isOnline && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setMyLocation(newLocation);
          
          // Send location update if on active delivery
          if (activeDelivery) {
            sendLocationUpdate(newLocation.latitude, newLocation.longitude);
          }
        },
        (error) => console.error('GPS error:', error),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, activeDelivery]);

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current && myLocation) {
      initializeMap();
    }
  }, [myLocation]);

  // Update map markers when delivery changes
  useEffect(() => {
    if (activeDelivery) {
      updateMapMarkers();
    }
  }, [activeDelivery]);

  const initializeMap = () => {
    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setTimeout(initializeMap, 100);
      document.head.appendChild(script);
      return;
    }

    if (!mapContainerRef.current || !myLocation) return;
    const L = window.L;

    mapRef.current = L.map(mapContainerRef.current).setView(
      [myLocation.latitude, myLocation.longitude],
      14
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapRef.current);

    // Add driver marker
    driverMarkerRef.current = L.circleMarker(
      [myLocation.latitude, myLocation.longitude],
      { radius: 12, fillColor: '#3b82f6', color: '#fff', weight: 3, fillOpacity: 0.9 }
    ).addTo(mapRef.current).bindPopup('You (Driver)');
  };

  const updateMapMarkers = () => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;

    // Update driver position
    if (myLocation && driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([myLocation.latitude, myLocation.longitude]);
    }

    if (!activeDelivery) return;

    // Customer marker (green)
    if (activeDelivery.customerLocation) {
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setLatLng([
          activeDelivery.customerLocation.latitude,
          activeDelivery.customerLocation.longitude
        ]);
      } else {
        customerMarkerRef.current = L.circleMarker(
          [activeDelivery.customerLocation.latitude, activeDelivery.customerLocation.longitude],
          { radius: 12, fillColor: '#22c55e', color: '#fff', weight: 3, fillOpacity: 0.9 }
        ).addTo(mapRef.current).bindPopup('Customer');
      }
    }

    // Restaurant marker (orange)
    if (activeDelivery.restaurantLocation) {
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setLatLng([
          activeDelivery.restaurantLocation.latitude,
          activeDelivery.restaurantLocation.longitude
        ]);
      } else {
        restaurantMarkerRef.current = L.circleMarker(
          [activeDelivery.restaurantLocation.latitude, activeDelivery.restaurantLocation.longitude],
          { radius: 10, fillColor: '#f97316', color: '#fff', weight: 2, fillOpacity: 0.9 }
        ).addTo(mapRef.current).bindPopup('Pickup');
      }
    }

    // Draw route line
    if (activeDelivery.restaurantLocation && activeDelivery.customerLocation && myLocation) {
      const routePoints: [number, number][] = [
        [myLocation.latitude, myLocation.longitude],
        [activeDelivery.restaurantLocation.latitude, activeDelivery.restaurantLocation.longitude],
        [activeDelivery.customerLocation.latitude, activeDelivery.customerLocation.longitude]
      ];

      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(routePoints);
      } else {
        routeLineRef.current = L.polyline(routePoints, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.7,
          dashArray: '10, 10'
        }).addTo(mapRef.current);
      }
    }

    // Fit bounds
    const bounds: [number, number][] = [];
    if (myLocation) bounds.push([myLocation.latitude, myLocation.longitude]);
    if (activeDelivery.customerLocation) bounds.push([activeDelivery.customerLocation.latitude, activeDelivery.customerLocation.longitude]);
    if (activeDelivery.restaurantLocation) bounds.push([activeDelivery.restaurantLocation.latitude, activeDelivery.restaurantLocation.longitude]);

    if (bounds.length > 1) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  const fetchPendingOrders = async () => {
    try {
      // In a real app, this would fetch only available orders
      // For demo, we check if there are any pending deliveries
      setMessage('Checking for available orders...');
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  const sendLocationUpdate = useCallback(async (lat: number, lng: number) => {
    if (!activeDelivery) return;

    try {
      const response = await axios.post(
        `${API_BASE}/delivery/orders/${activeDelivery.deliveryId}/location`,
        {
          latitude: lat,
          longitude: lng,
          speed: 10,
          status: activeDelivery.status
        }
      );

      if (response.data.success) {
        setActiveDelivery(prev => prev ? {
          ...prev,
          currentLocation: { latitude: lat, longitude: lng },
          distanceToCustomer: response.data.data.distanceToCustomer,
          distanceToRestaurant: response.data.data.distanceToRestaurant,
          eta: response.data.data.eta,
          status: response.data.data.status
        } : null);
      }
    } catch (err) {
      console.error('Error sending location:', err);
    }
  }, [activeDelivery]);

  const acceptOrder = async (deliveryId: string) => {
    setLoading(true);
    try {
      // First, get the delivery details
      const trackResponse = await axios.get(`${API_BASE}/delivery/orders/${deliveryId}/track`);
      
      if (trackResponse.data.success) {
        setActiveDelivery({
          ...trackResponse.data.data,
          deliveryId: deliveryId
        });
        
        // Join delivery room
        socketRef.current?.emit('join-delivery', deliveryId);
        
        // Start tracking
        setMessage(`Accepted order: ${deliveryId}`);
        
        // Send initial location
        if (myLocation) {
          await sendLocationUpdate(myLocation.latitude, myLocation.longitude);
        }
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startSimulation = () => {
    if (!activeDelivery || !myLocation) return;

    setIsSimulating(true);
    let currentLat = myLocation.latitude;
    let currentLng = myLocation.longitude;
    
    // Calculate direction to customer
    const targetLat = activeDelivery.customerLocation?.latitude || currentLat;
    const targetLng = activeDelivery.customerLocation?.longitude || currentLng;
    
    const latStep = (targetLat - currentLat) / 30;
    const lngStep = (targetLng - currentLng) / 30;
    let step = 0;

    simulationRef.current = setInterval(async () => {
      step++;
      currentLat += latStep + (Math.random() - 0.5) * 0.0002;
      currentLng += lngStep + (Math.random() - 0.5) * 0.0002;

      setMyLocation({ latitude: currentLat, longitude: currentLng });
      
      // Update on map
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([currentLat, currentLng]);
      }

      await sendLocationUpdate(currentLat, currentLng);

      if (step >= 30) {
        stopSimulation();
        setMessage('Arrived at customer location!');
      }
    }, 2000);
  };

  const stopSimulation = () => {
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
      simulationRef.current = null;
    }
    setIsSimulating(false);
  };

  const updateStatus = async (newStatus: string) => {
    if (!activeDelivery || !myLocation) return;

    try {
      await axios.post(
        `${API_BASE}/delivery/orders/${activeDelivery.deliveryId}/location`,
        {
          latitude: myLocation.latitude,
          longitude: myLocation.longitude,
          status: newStatus
        }
      );

      setActiveDelivery(prev => prev ? { ...prev, status: newStatus } : null);
      setMessage(`Status updated: ${newStatus}`);

      if (newStatus === 'completed') {
        // Clear delivery
        setTimeout(() => {
          setActiveDelivery(null);
          if (customerMarkerRef.current) {
            mapRef.current?.removeLayer(customerMarkerRef.current);
            customerMarkerRef.current = null;
          }
          if (restaurantMarkerRef.current) {
            mapRef.current?.removeLayer(restaurantMarkerRef.current);
            restaurantMarkerRef.current = null;
          }
          if (routeLineRef.current) {
            mapRef.current?.removeLayer(routeLineRef.current);
            routeLineRef.current = null;
          }
        }, 2000);
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  return (
    <div className="dashboard driver-dashboard">
      <header className="dashboard-header">
        <h1>Driver Dashboard</h1>
        <div className="driver-controls">
          <span className="driver-id">ID: {driverId}</span>
          <button 
            className={`btn ${isOnline ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => setIsOnline(!isOnline)}
          >
            {isOnline ? 'Online' : 'Offline'}
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-grid">
          {/* Left Panel - Controls */}
          <div className="control-panel">
            {/* No Active Delivery */}
            {!activeDelivery && (
              <section className="card">
                <h2>Accept Order</h2>
                <p>Enter a delivery ID to accept:</p>
                <div className="form-group">
                  <input
                    type="text"
                    id="deliveryIdInput"
                    placeholder="Enter Delivery ID (e.g., DEL-XXXXX)"
                    className="input-large"
                  />
                </div>
                <button
                  className="btn btn-primary btn-large"
                  disabled={loading}
                  onClick={() => {
                    const input = document.getElementById('deliveryIdInput') as HTMLInputElement;
                    if (input.value) acceptOrder(input.value);
                  }}
                >
                  {loading ? 'Accepting...' : 'Accept Order'}
                </button>
              </section>
            )}

            {/* Active Delivery Controls */}
            {activeDelivery && (
              <section className="card">
                <h2>Active Delivery</h2>
                
                <div className="delivery-info">
                  <div className="info-row">
                    <span className="label">Order ID:</span>
                    <span className="value">{activeDelivery.deliveryId}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Status:</span>
                    <span 
                      className={`status-badge solid ${activeDelivery.status}`}
                    >
                      {activeDelivery.status}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">To Restaurant:</span>
                    <span className="value">
                      {(activeDelivery.distanceToRestaurant / 1000).toFixed(2)} km
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">To Customer:</span>
                    <span className="value">
                      {(activeDelivery.distanceToCustomer / 1000).toFixed(2)} km
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">ETA:</span>
                    <span className="value">{Math.ceil(activeDelivery.eta / 60)} min</span>
                  </div>
                </div>

                <div className="status-buttons">
                  <h3>Update Status:</h3>
                  <button onClick={() => updateStatus('at_restaurant')} className="btn btn-purple">
                    At Restaurant
                  </button>
                  <button onClick={() => updateStatus('picked_up')} className="btn btn-cyan">
                    Picked Up
                  </button>
                  <button onClick={() => updateStatus('in_transit')} className="btn btn-blue">
                    In Transit
                  </button>
                  <button onClick={() => updateStatus('arriving')} className="btn btn-green">
                    Arriving
                  </button>
                  <button onClick={() => updateStatus('completed')} className="btn btn-success">
                    Delivered
                  </button>
                </div>

                <div className="simulation-controls">
                  <h3>Location Simulation:</h3>
                  {!isSimulating ? (
                    <button onClick={startSimulation} className="btn btn-warning btn-large">
                      Start Driving Simulation
                    </button>
                  ) : (
                    <button onClick={stopSimulation} className="btn btn-danger btn-large">
                      Stop Simulation
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Current Location */}
            <section className="card location-card">
              <h3>Your Location</h3>
              {myLocation ? (
                <p className="coords">
                  {myLocation.latitude.toFixed(5)}, {myLocation.longitude.toFixed(5)}
                </p>
              ) : (
                <p>Getting location...</p>
              )}
            </section>
          </div>

          {/* Right Panel - Map */}
          <div className="map-panel">
            <div 
              ref={mapContainerRef} 
              className="map-container driver-map"
            />
            <div className="map-legend">
              <span className="legend-item"><span className="dot blue"></span> You (Driver)</span>
              <span className="legend-item"><span className="dot green"></span> Customer</span>
              <span className="legend-item"><span className="dot orange"></span> Pickup</span>
            </div>
          </div>
        </div>

        {message && (
          <div className="message-toast">
            {message}
            <button onClick={() => setMessage(null)}>×</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
