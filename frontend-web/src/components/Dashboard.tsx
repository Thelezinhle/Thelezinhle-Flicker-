import React, { useState } from 'react';
import './Dashboard.css';
import LiveDeliveryMap from './LiveDeliveryMap';

interface DashboardProps {
  user: { id: string; deviceId: string; sessionToken: string };
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'tracking' | 'active' | 'history'>('tracking');
  const [activeOrders, setActiveOrders] = useState<any[]>([]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      onLogout();
    }
  };

  const loadActiveOrders = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/delivery/active');
      const data = await response.json();
      if (data.success) {
        setActiveOrders(data.data.deliveries);
      }
    } catch (error) {
      console.error('Failed to load active orders:', error);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'active') {
      loadActiveOrders();
      const interval = setInterval(loadActiveOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🚚 DeliveryHub</h1>
          <p>Real-time Delivery Tracking System</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-badge">👤 {user.id.substring(0, 8)}</span>
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
          <button
            className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            📍 Live Tracking
          </button>
          <button
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            📦 Active Orders ({activeOrders.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📋 How It Works
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
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
                  <p>📭 No active deliveries</p>
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
                          <span>📍 Distance</span>
                          <strong>{(order.distanceToCustomer / 1000).toFixed(1)} km</strong>
                        </div>
                        <div className="detail">
                          <span>⏱️ ETA</span>
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
                    <h3>📦 Create Order</h3>
                    <p>Start a new delivery order with restaurant and customer locations</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>📍 Auto-Tracking</h3>
                    <p>GPS automatically tracks the delivery person every 5 seconds</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>🗺️ Live Map</h3>
                    <p>See real-time location on interactive map with markers for all locations</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>⏱️ Smart ETA</h3>
                    <p>Automatic ETA calculation based on current speed and distance</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h3>✅ Complete</h3>
                    <p>Mark delivery as complete and see location history</p>
                  </div>
                </div>
              </div>

              <div className="features-grid">
                <div className="feature-box">
                  <span className="icon">🚚</span>
                  <h4>Real-time GPS</h4>
                  <p>Updates every 5 seconds</p>
                </div>
                <div className="feature-box">
                  <span className="icon">📍</span>
                  <h4>Location History</h4>
                  <p>Track entire delivery route</p>
                </div>
                <div className="feature-box">
                  <span className="icon">⚡</span>
                  <h4>Smart Metrics</h4>
                  <p>Speed, accuracy, altitude</p>
                </div>
                <div className="feature-box">
                  <span className="icon">🔄</span>
                  <h4>Auto Status</h4>
                  <p>Updates based on location</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
