/**
 * CustomerDashboard - Customer view for placing and tracking orders
 * Shows order creation, active deliveries, and real-time tracking
 */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import './Dashboard.css';
import { API_BASE, SOCKET_URL } from '../config';

interface Location {
  latitude: number;
  longitude: number;
}

interface Delivery {
  deliveryId: string;
  orderId: string;
  status: string;
  currentLocation: Location | null;
  customerLocation: Location | null;
  restaurantLocation: Location | null;
  distanceToCustomer: number;
  eta: number;
  createdAt: string;
  description?: string;
}

declare global {
  interface Window {
    L: any;
  }
}

const CustomerDashboard: React.FC = () => {
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [orderDescription, setOrderDescription] = useState('Food Delivery');
  const [pickupAddress, setPickupAddress] = useState('Sandton City Mall');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customerId] = useState(() => `customer-${Date.now().toString(36)}`);
  
  const socketRef = useRef<Socket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const restaurantMarkerRef = useRef<any>(null);

  // Get customer's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMyLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Location error:', error);
          // Default to Johannesburg area
          setMyLocation({ latitude: -26.1460, longitude: 28.0464 });
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
      console.log('Customer connected to real-time updates');
    });

    socketRef.current.on('delivery:location-updated', (data: any) => {
      if (activeDelivery && data.orderId === activeDelivery.orderId) {
        setActiveDelivery(prev => prev ? {
          ...prev,
          currentLocation: { latitude: data.latitude, longitude: data.longitude },
          status: data.status,
          distanceToCustomer: data.distanceToEnd || 0,
          eta: data.eta || 0
        } : null);
        
        // Update driver marker on map
        updateDriverMarker(data.latitude, data.longitude);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [activeDelivery]);

  // Initialize map when delivery is active
  useEffect(() => {
    if (activeDelivery && mapContainerRef.current && !mapRef.current) {
      initializeMap();
    }
    if (activeDelivery) {
      updateMapMarkers();
    }
  }, [activeDelivery]);

  const initializeMap = () => {
    if (!window.L || !mapContainerRef.current) {
      // Load Leaflet dynamically
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

    const L = window.L;
    const center = myLocation || { latitude: -26.2041, longitude: 28.0473 };

    mapRef.current = L.map(mapContainerRef.current).setView(
      [center.latitude, center.longitude],
      14
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapRef.current);
  };

  const updateMapMarkers = () => {
    if (!mapRef.current || !activeDelivery || !window.L) return;
    const L = window.L;

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
        ).addTo(mapRef.current).bindPopup('Your Location');
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
        ).addTo(mapRef.current).bindPopup('Restaurant');
      }
    }

    // Driver marker (red)
    if (activeDelivery.currentLocation) {
      updateDriverMarker(activeDelivery.currentLocation.latitude, activeDelivery.currentLocation.longitude);
    }

    // Fit bounds
    const bounds: [number, number][] = [];
    if (activeDelivery.customerLocation) bounds.push([activeDelivery.customerLocation.latitude, activeDelivery.customerLocation.longitude]);
    if (activeDelivery.restaurantLocation) bounds.push([activeDelivery.restaurantLocation.latitude, activeDelivery.restaurantLocation.longitude]);
    if (activeDelivery.currentLocation) bounds.push([activeDelivery.currentLocation.latitude, activeDelivery.currentLocation.longitude]);
    
    if (bounds.length > 1 && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  const updateDriverMarker = (lat: number, lng: number) => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([lat, lng]);
    } else {
      driverMarkerRef.current = L.circleMarker(
        [lat, lng],
        { radius: 10, fillColor: '#ef4444', color: '#fff', weight: 3, fillOpacity: 0.9 }
      ).addTo(mapRef.current).bindPopup('Driver');
    }
  };

  const placeOrder = async () => {
    if (!myLocation) {
      setMessage('Please allow location access to place an order');
      return;
    }

    setLoading(true);
    try {
      // Create pickup location (restaurant) - slightly offset from customer
      const pickupLat = myLocation.latitude + 0.01 + (Math.random() * 0.02);
      const pickupLng = myLocation.longitude + 0.01 + (Math.random() * 0.02);

      const response = await axios.post(`${API_BASE}/delivery/create`, {
        senderId: 'restaurant-001',
        recipientId: customerId,
        description: orderDescription,
        pickupLocation: { lat: pickupLat, lng: pickupLng },
        dropoffLocation: { lat: myLocation.latitude, lng: myLocation.longitude }
      });

      if (response.data.success) {
        const deliveryId = response.data.data.deliveryId;
        setMessage(`Order placed! ID: ${deliveryId} | Code: ${response.data.data.verificationCode}`);
        
        // Join delivery room for updates
        socketRef.current?.emit('join-delivery', deliveryId);
        
        // Fetch full delivery details
        const trackResponse = await axios.get(`${API_BASE}/delivery/orders/${deliveryId}/track`);
        if (trackResponse.data.success) {
          setActiveDelivery({
            ...trackResponse.data.data,
            description: orderDescription
          });
        }
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshTracking = async () => {
    if (!activeDelivery) return;
    
    try {
      const response = await axios.get(`${API_BASE}/delivery/orders/${activeDelivery.deliveryId}/track`);
      if (response.data.success) {
        setActiveDelivery(prev => ({
          ...prev!,
          ...response.data.data
        }));
      }
    } catch (err) {
      console.error('Error refreshing:', err);
    }
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      'PENDING': 'Waiting for driver...',
      'assigned': 'Driver assigned',
      'at_restaurant': 'Driver at restaurant',
      'picked_up': 'Order picked up',
      'in_transit': 'On the way to you',
      'arriving': 'Almost there!',
      'completed': 'Delivered!'
    };
    return texts[status] || status;
  };

  return (
    <div className="dashboard customer-dashboard">
      <header className="dashboard-header">
        <h1>Customer Dashboard</h1>
        <p className="customer-id">ID: {customerId}</p>
      </header>

      <div className="dashboard-content">
        {/* Order Placement Section */}
        {!activeDelivery && (
          <section className="card order-section">
            <h2>Place New Order</h2>
            
            <div className="form-group">
              <label>What are you ordering?</label>
              <input
                type="text"
                value={orderDescription}
                onChange={(e) => setOrderDescription(e.target.value)}
                placeholder="e.g., Food, Groceries, Package"
              />
            </div>

            <div className="form-group">
              <label>Pickup from</label>
              <input
                type="text"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Restaurant or store name"
              />
            </div>

            <div className="form-group">
              <label>Your Location</label>
              <div className="location-display">
                {myLocation ? (
                  <span className="location-coords">
                    {myLocation.latitude.toFixed(4)}, {myLocation.longitude.toFixed(4)}
                  </span>
                ) : (
                  <span className="loading-location">Getting your location...</span>
                )}
              </div>
            </div>

            <button 
              className="btn btn-primary btn-large"
              onClick={placeOrder}
              disabled={loading || !myLocation}
            >
              {loading ? 'Placing Order...' : 'Place Order'}
            </button>
          </section>
        )}

        {/* Active Delivery Tracking */}
        {activeDelivery && (
          <section className="card tracking-section">
            <div className="tracking-header">
              <h2>Tracking Your Order</h2>
              <button className="btn btn-secondary" onClick={refreshTracking}>
                Refresh
              </button>
            </div>

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
                  {getStatusText(activeDelivery.status)}
                </span>
              </div>
              {activeDelivery.distanceToCustomer > 0 && (
                <div className="info-row">
                  <span className="label">Distance:</span>
                  <span className="value">
                    {(activeDelivery.distanceToCustomer / 1000).toFixed(2)} km away
                  </span>
                </div>
              )}
              {activeDelivery.eta > 0 && (
                <div className="info-row">
                  <span className="label">ETA:</span>
                  <span className="value">
                    {Math.ceil(activeDelivery.eta / 60)} minutes
                  </span>
                </div>
              )}
            </div>

            {/* Map Container */}
            <div 
              ref={mapContainerRef} 
              className="map-container"
            />

            <div className="map-legend">
              <span className="legend-item"><span className="dot red"></span> Driver</span>
              <span className="legend-item"><span className="dot green"></span> Your Location</span>
              <span className="legend-item"><span className="dot orange"></span> Restaurant</span>
            </div>

            {activeDelivery.status === 'completed' && (
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setActiveDelivery(null);
                  if (mapRef.current) {
                    mapRef.current.remove();
                    mapRef.current = null;
                  }
                  driverMarkerRef.current = null;
                  customerMarkerRef.current = null;
                  restaurantMarkerRef.current = null;
                }}
              >
                ✨ Place Another Order
              </button>
            )}
          </section>
        )}

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

export default CustomerDashboard;
