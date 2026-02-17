/**
 * LiveDeliveryMap - Frontend web component for real-time delivery tracking
 * Shows live delivery location on an interactive map with route visualization
 * Uses Leaflet.js for mapping and Socket.io for real-time updates
 */

// Extend Window interface for Leaflet
declare global {
  interface Window {
    L: any;
  }
}

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import './LiveDeliveryMap.css';
import { API_BASE, SOCKET_URL } from '../config';

interface DeliveryLocation {
  orderId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface DeliveryTracking {
  orderId: string;
  status: 'assigned' | 'at_restaurant' | 'picked_up' | 'arriving' | 'completed';
  currentLocation: DeliveryLocation;
  customerLocation: { latitude: number; longitude: number };
  restaurantLocation: { latitude: number; longitude: number };
  distanceToCustomer: number;
  distanceToRestaurant: number;
  eta: number;
}

interface Props {
  orderId?: string
  onDeliveryComplete?: () => void;
}

const LiveDeliveryMap: React.FC<Props> = ({ 
  orderId = 'sample-order-123',
  onDeliveryComplete 
}) => {
  const [delivery, setDelivery] = useState<DeliveryTracking | null>(null);
  const [_locationHistory, setLocationHistory] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    // Listen for real-time location updates
    socketRef.current.on('delivery:location-updated', (data: any) => {
      console.log('Location update received:', data);
      
      // Update delivery with new location
      if (data.deliveryId) {
        setDelivery(prev => prev ? {
          ...prev,
          currentLocation: {
            orderId: data.orderId,
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: null,
            speed: data.speed || null,
            heading: data.heading || null,
            timestamp: Date.now()
          },
          status: data.status,
          distanceToCustomer: parseFloat(data.distanceToEnd),
          eta: parseInt(data.eta) || 0
        } : null);

        // Add to location history
        setLocationHistory(prev => [{
          orderId: data.orderId,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: null,
          speed: data.speed || null,
          heading: data.heading || null,
          timestamp: Date.now()
        }, ...prev].slice(0, 200));
      }
    });

    // Listen for specific delivery room updates
    socketRef.current.on('location-changed', (data: any) => {
      console.log('Room location update:', data);
      if (data.status === 'completed') {
        onDeliveryComplete?.();
      }
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to real-time updates');
      // Join delivery tracking room
      if (orderId) {
        socketRef.current?.emit('join-delivery', orderId);
      }
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from real-time updates');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [orderId, onDeliveryComplete]);

  useEffect(() => {
    loadDeliveryTracking();
    const interval = setInterval(() => loadDeliveryTracking(), 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (delivery && mapContainerRef.current) {
      initializeMap();
      updateMapMarker();
    }
  }, [delivery]);

  const loadDeliveryTracking = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/delivery/orders/${orderId}/track`
      );
      
      if (response.data.success) {
        setDelivery(response.data.data);
        setError(null);

        // Load location history
        const historyResponse = await axios.get(
          `${API_BASE}/delivery/orders/${orderId}/history?limit=200`
        );
        if (historyResponse.data.success) {
          setLocationHistory(historyResponse.data.data.locations);
        }
      }
    } catch (err) {
      console.error('Error loading delivery tracking:', err);
      setError('Failed to load delivery tracking');
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!delivery || !mapContainerRef.current) return;

    // Dynamically load Leaflet if not already loaded
    if (!window.L) {
      loadLeaflet();
      return;
    }

    if (mapRef.current) {
      mapRef.current.remove();
    }

    const L = window.L;
    const center: [number, number] = [
      delivery.currentLocation.latitude,
      delivery.currentLocation.longitude,
    ];

    mapRef.current = L.map(mapContainerRef.current).setView(center, 14);

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Add markers for key locations
    addMapMarkers();
    drawRoute();
  };

  const addMapMarkers = () => {
    if (!delivery || !mapRef.current) return;

    const L = window.L;

    // Delivery person location (red marker)
    markerRef.current = L.circleMarker(
      [delivery.currentLocation.latitude, delivery.currentLocation.longitude],
      {
        radius: 10,
        fillColor: '#FF6B6B',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }
    )
      .addTo(mapRef.current)
      .bindPopup(
        `<div class="map-popup">
          <strong>Delivery Person</strong><br>
          Current Location<br>
          <small>Speed: ${delivery.currentLocation.speed ? (delivery.currentLocation.speed * 3.6).toFixed(1) : '0'} km/h</small>
        </div>`
      );

    // Customer location (green marker)
    L.marker([delivery.customerLocation.latitude, delivery.customerLocation.longitude], {
      icon: L.divIcon({
        className: 'map-marker customer-marker',
        html: '<div style="background:#4CAF50;width:14px;height:14px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [18, 18],
      }),
    })
      .addTo(mapRef.current)
      .bindPopup(
        `<div class="map-popup">
          <strong>Customer Location</strong><br>
          Distance: ${(delivery.distanceToCustomer / 1000).toFixed(1)} km<br>
          ETA: ${Math.round(delivery.eta / 60)} min
        </div>`
      );

    // Restaurant location (orange marker)
    L.marker([delivery.restaurantLocation.latitude, delivery.restaurantLocation.longitude], {
      icon: L.divIcon({
        className: 'map-marker restaurant-marker',
        html: '<div style="background:#FF9800;width:14px;height:14px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [18, 18],
      }),
    })
      .addTo(mapRef.current)
      .bindPopup(
        `<div class="map-popup">
          <strong>Restaurant</strong><br>
          Distance: ${(delivery.distanceToRestaurant / 1000).toFixed(1)} km
        </div>`
      );
  };

  const updateMapMarker = () => {
    if (!delivery || !mapRef.current || !markerRef.current) return;

    // Update delivery person marker position
    markerRef.current.setLatLng([
      delivery.currentLocation.latitude,
      delivery.currentLocation.longitude,
    ]);

    // Pan map to current location
    if (mapRef.current) {
      mapRef.current.panTo([
        delivery.currentLocation.latitude,
        delivery.currentLocation.longitude,
      ]);
    }
  };

  const drawRoute = () => {
    if (!delivery || !mapRef.current) return;

    const L = window.L;

    // Remove old polyline if exists
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
    }

    // Draw route from restaurant to customer
    const routePoints: [number, number][] = [
      [delivery.restaurantLocation.latitude, delivery.restaurantLocation.longitude],
      [delivery.currentLocation.latitude, delivery.currentLocation.longitude],
      [delivery.customerLocation.latitude, delivery.customerLocation.longitude],
    ];

    routePolylineRef.current = L.polyline(routePoints, {
      color: '#9C27B0',
      weight: 3,
      opacity: 0.7,
      dashArray: '5, 10',
    }).addTo(mapRef.current);
  };

  const loadLeaflet = () => {
    // Load Leaflet CSS and JS dynamically
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      if (delivery) {
        initializeMap();
      }
    };
    document.head.appendChild(script);
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'assigned':
        return 'Heading to Restaurant';
      case 'at_restaurant':
        return 'At Restaurant';
      case 'picked_up':
        return 'On the Way';
      case 'arriving':
        return 'Arriving Soon';
      case 'completed':
        return 'Delivered';
      default:
        return 'PROCESSING';
    }
  };

  if (loading) {
    return (
      <div className="delivery-map-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading delivery tracking...</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="delivery-map-container">
        <div className="error-message">
          <p>{error || 'Failed to load delivery data'}</p>
          <button onClick={loadDeliveryTracking}>Retry</button>
        </div>
      </div>
    );
  }

  const etaMinutes = Math.round(delivery.eta / 60);

  return (
    <div className="delivery-map-wrapper">
      {/* Map Container */}
      <div ref={mapContainerRef} className="delivery-map-container" />

      {/* Info Panel */}
      <div className="delivery-info-panel">
        <div className="info-header">
          <h2>Order #{orderId.slice(-6)}</h2>
          <div
            className={`status-badge ${delivery.status}`}
          >
            {getStatusLabel(delivery.status)}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">T</div>
            <div className="metric-content">
              <div className="metric-label">ETA</div>
              <div className="metric-value">{etaMinutes} min</div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">D</div>
            <div className="metric-content">
              <div className="metric-label">DISTANCE</div>
              <div className="metric-value">
                {(delivery.distanceToCustomer / 1000).toFixed(1)} km
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">S</div>
            <div className="metric-content">
              <div className="metric-label">SPEED</div>
              <div className="metric-value">
                {delivery.currentLocation.speed 
                  ? (delivery.currentLocation.speed * 3.6).toFixed(0)
                  : '0'
                } km/h
              </div>
            </div>
          </div>
        </div>

        {/* Location Details */}
        <div className="location-details">
          <div className="detail-item">
            <span className="detail-label">Current Coordinates</span>
            <span className="detail-value">
              {delivery.currentLocation.latitude.toFixed(4)}, {delivery.currentLocation.longitude.toFixed(4)}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Accuracy</span>
            <span className="detail-value">
              {delivery.currentLocation.accuracy ? `±${delivery.currentLocation.accuracy.toFixed(1)}m` : 'N/A'}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Heading</span>
            <span className="detail-value">
              {delivery.currentLocation.heading 
                ? `${delivery.currentLocation.heading.toFixed(0)}°`
                : 'N/A'
              }
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="map-legend">
          <h4>LEGEND</h4>
          <div className="legend-item">
            <span className="legend-dot driver"></span>
            <span>Delivery Person</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot customer"></span>
            <span>Customer Location</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot restaurant"></span>
            <span>Restaurant</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveDeliveryMap;
