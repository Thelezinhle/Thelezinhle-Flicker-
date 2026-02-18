import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import './Dashboard.css';
import LiveDeliveryMap from './LiveDeliveryMap';
import FindCustomer from './FindCustomer';
import { API_BASE, SOCKET_URL } from '../config';

type UserRole = 'client' | 'driver';

interface DashboardProps {
  user: { id: string; email: string; sessionToken: string; role?: UserRole };
  onLogout: () => void;
}

interface OrderForm {
  pickupAddress: string;
  deliveryAddress: string;
  packageDescription: string;
  recipientName: string;
  recipientPhone: string;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  // Default to 'client' if no role is set (for backwards compatibility)
  const userRole: UserRole = user.role || 'client';
  const [activeTab, setActiveTab] = useState<'tracking' | 'active' | 'history' | 'create' | 'available'>(
    userRole === 'client' ? 'create' : 'available'
  );
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [_socket, setSocket] = useState<Socket | null>(null);
  const [orderForm, setOrderForm] = useState<OrderForm>({
    pickupAddress: '',
    deliveryAddress: '',
    packageDescription: '',
    recipientName: '',
    recipientPhone: ''
  });
  const [creating, setCreating] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showFindCustomer, setShowFindCustomer] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Automatically get customer's current location when component loads
  useEffect(() => {
    if (userRole === 'client') {
      getCustomerLocation();
    }
  }, [userRole]);

  // Function to get current location automatically
  const getCustomerLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    
    setFetchingLocation(true);
    setLocationError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Try to get address from coordinates using reverse geocoding
        let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          const data = await response.json();
          if (data.display_name) {
            address = data.display_name;
          }
        } catch (e) {
          console.log('Reverse geocoding failed, using coordinates');
        }
        
        setCurrentLocation({ lat, lng, address });
        setOrderForm(prev => ({ ...prev, pickupAddress: address }));
        setFetchingLocation(false);
      },
      (error) => {
        console.error('Location error:', error);
        setFetchingLocation(false);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location permissions in your browser.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out. Click refresh to try again.');
            break;
          default:
            setLocationError('Could not get your location.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      onLogout();
    }
  };

  // Initialize WebSocket
  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    // Listen for live updates
    newSocket.on('delivery:location-updated', (data: any) => {
      setActiveOrders(prev =>
        prev.map(order =>
          order.id === data.deliveryId
            ? {
                ...order,
                latitude: data.latitude,
                longitude: data.longitude,
                status: data.status,
                distanceToCustomer: parseFloat(data.distanceToEnd),
                eta: parseInt(data.eta)
              }
            : order
        )
      );
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const loadActiveOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/delivery/active`);
      const data = await response.json();
      if (data.success) {
        setActiveOrders(data.data.deliveries);
      }
    } catch (error) {
      console.error('Failed to load active orders:', error);
    }
  };

  const loadAvailableOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/delivery/list`);
      const data = await response.json();
      if (data.success) {
        // Filter orders that are pending (not yet picked up)
        const pending = data.data.filter((order: any) => order.status === 'pending' || order.status === 'created');
        setAvailableOrders(pending);
      }
    } catch (error) {
      console.error('Failed to load available orders:', error);
    }
  };

  const handleCreateOrder = async () => {
    // Validation - location must be auto-detected via GPS
    if (!currentLocation) {
      setOrderError('Waiting for your location. Please allow location access.');
      return;
    }
    if (!orderForm.recipientName.trim()) {
      setOrderError('Please enter recipient name');
      return;
    }
    if (!orderForm.recipientPhone.trim()) {
      setOrderError('Please enter phone number');
      return;
    }

    setCreating(true);
    setOrderSuccess(null);
    setOrderError(null);
    
    try {
      console.log('Creating order with:', {
        customerId: user.id,
        liveLocation: currentLocation
      });

      const response = await fetch(`${API_BASE}/delivery/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: user.id,
          pickupAddress: 'Driver will pick up package',
          deliveryAddress: currentLocation.address,
          packageDescription: orderForm.packageDescription || 'Package',
          recipientName: orderForm.recipientName,
          recipientPhone: orderForm.recipientPhone,
          // Delivery goes to customer's LIVE GPS location
          startLat: currentLocation.lat,
          startLng: currentLocation.lng,
          endLat: currentLocation.lat,
          endLng: currentLocation.lng
        })
      });
      
      const data = await response.json();
      console.log('Order response:', data);
      
      if (data.success) {
        setOrderSuccess(data.data.orderId);
        // Reset form but keep the auto-detected location
        setOrderForm({
          pickupAddress: '',
          deliveryAddress: '',
          packageDescription: '',
          recipientName: '',
          recipientPhone: ''
        });
        loadActiveOrders();
        alert(`Order created successfully! Order ID: ${data.data.orderId}`);
      } else {
        setOrderError(data.message || 'Failed to create order');
      }
    } catch (error) {
      console.error('Failed to create order:', error);
      setOrderError('Network error - please check if backend is running on port 5000');
    } finally {
      setCreating(false);
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      await fetch(`${API_BASE}/delivery/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: user.id })
      });
      loadAvailableOrders();
      loadActiveOrders();
    } catch (error) {
      console.error('Failed to accept order:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'active') {
      loadActiveOrders();
      const interval = setInterval(loadActiveOrders, 10000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'available') {
      loadAvailableOrders();
      const interval = setInterval(loadAvailableOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>DeliveryHub</h1>
          <p>{userRole === 'client' ? 'Customer Portal' : 'Driver Portal'}</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className={`role-badge ${userRole}`}>
              {userRole === 'client' ? 'Customer' : 'Driver'}
            </span>
            <span className="user-badge">{user.id.substring(0, 8)}</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Tabs */}
        <div className="tab-navigation">
          {/* Customer-only: Create Order */}
          {userRole === 'client' && (
            <button
              className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              Create Order
            </button>
          )}
          
          {/* Driver-only: Available Orders */}
          {userRole === 'driver' && (
            <button
              className={`tab-btn ${activeTab === 'available' ? 'active' : ''}`}
              onClick={() => setActiveTab('available')}
            >
              Available Orders ({availableOrders.length})
            </button>
          )}
          
          <button
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            {userRole === 'client' ? 'My Orders' : 'My Deliveries'} ({activeOrders.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            Live Tracking
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            How It Works
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {/* Create Order Tab - Customer Only */}
          {activeTab === 'create' && userRole === 'client' && (
            <div className="create-section">
              <div className="section-info">
                <h2>Create New Order</h2>
                <p>Driver will deliver to your live GPS location</p>
              </div>
              
              {orderSuccess && (
                <div className="success-message">
                  Order created successfully! Order ID: {orderSuccess}
                </div>
              )}

              {orderError && (
                <div className="error-message">
                  {orderError}
                </div>
              )}

              {/* Auto-detected Pickup Location */}
              <div className="auto-location-section">
                <div className="location-header">
                  <span className="location-icon">&#128205;</span>
                  <span>Your Delivery Location (Live GPS)</span>
                </div>
                {fetchingLocation && (
                  <div className="location-loading">
                    <div className="loading-spinner"></div>
                    <span>Detecting your location...</span>
                  </div>
                )}
                {locationError && (
                  <div className="location-error">
                    <span>{locationError}</span>
                    <button type="button" onClick={getCustomerLocation} className="retry-btn">
                      Retry
                    </button>
                  </div>
                )}
                {currentLocation && !fetchingLocation && (
                  <div className="location-detected">
                    <div className="location-address">{currentLocation.address}</div>
                    <div className="location-coords">
                      GPS: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
                    </div>
                    <button type="button" onClick={getCustomerLocation} className="refresh-location-btn">
                      Refresh Location
                    </button>
                  </div>
                )}
              </div>
              
              <form className="order-form" onSubmit={(e) => { e.preventDefault(); handleCreateOrder(); }}>
                <div className="form-group">
                  <label>Package Description</label>
                  <textarea
                    placeholder="Describe your package"
                    value={orderForm.packageDescription}
                    onChange={(e) => setOrderForm({...orderForm, packageDescription: e.target.value})}
                    rows={3}
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Recipient Name</label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={orderForm.recipientName}
                      onChange={(e) => setOrderForm({...orderForm, recipientName: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={orderForm.recipientPhone}
                      onChange={(e) => setOrderForm({...orderForm, recipientPhone: e.target.value})}
                      required
                    />
                  </div>
                </div>
                
                <button type="submit" className="submit-btn" disabled={creating}>
                  {creating ? 'Creating Order...' : 'Request Delivery'}
                </button>
              </form>
            </div>
          )}
          
          {/* Available Orders Tab - Driver Only */}
          {activeTab === 'available' && userRole === 'driver' && (
            <div className="available-section">
              <div className="section-info">
                <h2>Available Deliveries</h2>
                <p>Pick up orders available in your area</p>
              </div>
              
              {availableOrders.length === 0 ? (
                <div className="empty-state">
                  <p>No available orders</p>
                  <span>Check back soon for new delivery requests</span>
                </div>
              ) : (
                <div className="orders-grid">
                  {availableOrders.map((order) => (
                    <div key={order.orderId || order.id} className="order-card available">
                      <div className="order-header">
                        <h3>Order #{(order.orderId || order.id || 'N/A').substring(0, 8)}</h3>
                        <span className="status-badge pending">New</span>
                      </div>
                      <div className="order-details">
                        <div className="detail">
                          <span>Pickup</span>
                          <strong>{order.pickupAddress || 'See map'}</strong>
                        </div>
                        <div className="detail">
                          <span>Deliver to</span>
                          <strong>{order.deliveryAddress || 'See map'}</strong>
                        </div>
                      </div>
                      <button
                        className="accept-btn"
                        onClick={() => handleAcceptOrder(order.orderId || order.id)}
                      >
                        Accept Delivery
                      </button>
                      <button
                        className="find-customer-btn"
                        onClick={() => {
                          setSelectedOrderId(order.orderId || order.id);
                          setShowFindCustomer(true);
                        }}
                      >
                        Find Customer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Tracking Tab */}
          {activeTab === 'tracking' && (
            <div className="tracking-section">
              <div className="section-info">
                <h2>Live Delivery Tracking</h2>
                <p>Watch deliveries in real-time on the interactive map below</p>
              </div>
              <LiveDeliveryMap orderId="sample-order-123" />
            </div>
          )}

          {/* Active Orders Tab */}
          {activeTab === 'active' && (
            <div className="active-section">
              <div className="section-info">
                <h2>Active Deliveries</h2>
                <p>All deliveries currently in progress</p>
              </div>

              {activeOrders.length === 0 ? (
                <div className="empty-state">
                  <p>No active deliveries</p>
                  <span>Start tracking by creating a new delivery order</span>
                </div>
              ) : (
                <div className="orders-grid">
                  {activeOrders.map((order) => (
                    <div key={order.orderId} className="order-card">
                      <div className="order-header">
                        <h3>Order #{order.orderId.substring(0, 8)}</h3>
                        <span className={`status-badge ${order.status}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="order-details">
                        <div className="detail">
                          <span>Distance</span>
                          <strong>{(order.distanceToCustomer / 1000).toFixed(1)} km</strong>
                        </div>
                        <div className="detail">
                          <span>ETA</span>
                          <strong>{Math.round(order.eta / 60)} min</strong>
                        </div>
                      </div>
                      <button
                        className="track-btn"
                        onClick={() => {
                          setActiveTab('tracking');
                          window.scrollTo(0, 0);
                        }}
                      >
                        Track on Map →
                      </button>
                      <button
                        className="find-customer-btn"
                        onClick={() => {
                          setSelectedOrderId(order.orderId);
                          setShowFindCustomer(true);
                        }}
                      >
                        {userRole === 'driver' ? '📍 Find Customer' : '📍 Share My Location'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How It Works Tab */}
          {activeTab === 'history' && (
            <div className="history-section">
              <div className="section-info">
                <h2>How Delivery Tracking Works</h2>
              </div>

              <div className="steps-container">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>Create Order</h3>
                    <p>Start a new delivery order with restaurant and customer locations</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>Auto-Tracking</h3>
                    <p>GPS automatically tracks the delivery person every 5 seconds</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>Live Map</h3>
                    <p>See real-time location on interactive map with markers for all locations</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>Smart ETA</h3>
                    <p>Automatic ETA calculation based on current speed and distance</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h3>Complete</h3>
                    <p>Mark delivery as complete and see location history</p>
                  </div>
                </div>
              </div>

              <div className="features-grid">
                <div className="feature-box">
                  <h4>Real-time GPS</h4>
                  <p>Updates every 5 seconds</p>
                </div>
                <div className="feature-box">
                  <h4>Location History</h4>
                  <p>Track entire delivery route</p>
                </div>
                <div className="feature-box">
                  <h4>Smart Metrics</h4>
                  <p>Speed, accuracy, altitude</p>
                </div>
                <div className="feature-box">
                  <h4>Auto Status</h4>
                  <p>Updates based on location</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Find Customer Modal */}
      {showFindCustomer && selectedOrderId && (
        <FindCustomer
          userRole={userRole}
          userId={user.id}
          orderId={selectedOrderId}
          onClose={() => {
            setShowFindCustomer(false);
            setSelectedOrderId(null);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
