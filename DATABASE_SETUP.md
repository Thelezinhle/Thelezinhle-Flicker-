# 🚀 Real Database Setup - FlickerSecure

## ✅ What's Been Created

### 1. **Enhanced Database Models** (`src/models/database.ts`)
   - ✅ User model with role management
   - ✅ Session model for authentication
   - ✅ Delivery model for order tracking
   - ✅ LocationHistory model for GPS tracking
   - ✅ ProximityHandshake model for device proximity
   - ✅ NFTRecord model for blockchain integration

### 2. **Database Service Layer** (`src/services/DatabaseService.ts`)
   - ✅ UserService - User CRUD operations
   - ✅ SessionService - Session management
   - ✅ DeliveryService - Delivery tracking
   - ✅ LocationService - Location history
   - ✅ ProximityService - Proximity detection
   - ✅ NFTService - NFT/Blockchain records

### 3. **Updated Server** (`src/server.ts`)
   - ✅ Real PostgreSQL connection
   - ✅ Automatic database initialization
   - ✅ Model synchronization

### 4. **Environment Configuration** (`.env`)
   - ✅ Database credentials configured for Docker
   - ✅ Redis configuration
   - ✅ JWT secrets
   - ✅ Blockchain settings (for Phase 4)

---

## 🔧 Step 1: Start Docker Containers

### Option A: Using Docker Compose (RECOMMENDED)

```bash
cd c:\Users\dell\Thelezinhle-Flicker-
docker-compose up -d
```

This will start:
- **PostgreSQL 15** on localhost:5432
- **Redis 7** on localhost:6379
- **Backend API** on localhost:5000

### Verify containers are running:
```bash
docker ps
```

You should see 3 containers running.

### Check database connection:
```bash
docker logs <container_id_of_postgres>
```

---

## 💾 Step 2: Initialize Backend

### Option A: Install Dependencies (First Time)
```bash
cd c:\Users\dell\Thelezinhle-Flicker-\backend-api
npm install
```

This installs new types like `@types/sequelize`.

### Option B: Skip if already installed
```bash
npm list | grep sequelize
```

---

## 🚀 Step 3: Start Backend with Real Database

### Terminal 1 - Backend API:
```bash
cd c:\Users\dell\Thelezinhle-Flicker-\backend-api
npm run dev
```

**Expected Output:**
```
✅ Database connected successfully
✅ Database models synced
✅ Server running on http://localhost:5000
💾 Database: PostgreSQL on postgres:5432
📡 Socket.IO ready for real-time connections
```

### Terminal 2 - Frontend Web:
```bash
cd c:\Users\dell\Thelezinhle-Flicker-\frontend-web
npm run dev
```

**Expected Output:**
```
VITE v5.0.0  ready in 234 ms
➜  Local:   http://localhost:3000/
```

---

## 🧪 Step 4: Test Database Integration

### Test 1: Register a new user
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-001",
    "publicKey": "pk_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "userId": "uuid-here",
    "deviceId": "device-001",
    "isVerified": false
  }
}
```

### Test 2: Create a delivery order
```bash
curl -X POST http://localhost:5000/api/delivery/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER-001",
    "deliveryPersonId": "uuid-of-delivery-person",
    "customerId": "uuid-of-customer",
    "startLocation": { "latitude": -25.7462, "longitude": 28.2881 },
    "endLocation": { "latitude": -25.7580, "longitude": 28.2950 },
    "estimatedDistance": 2000
  }'
```

### Test 3: Update delivery location
```bash
curl -X POST http://localhost:5000/api/delivery/{deliveryId}/location \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "uuid-of-delivery-person",
    "latitude": -25.7462,
    "longitude": 28.2881,
    "accuracy": 5,
    "speed": 25.5,
    "heading": 180
  }'
```

---

## 📊 Step 5: Verify Database Data Persistence

### Connect to PostgreSQL directly:
```bash
docker exec -it postgres_container psql -U postgres -d flickersecure_db
```

Inside psql:
```sql
-- View all tables
\dt

-- View users
SELECT * FROM users;

-- View deliveries
SELECT * FROM deliveries;

-- View location history
SELECT * FROM location_history LIMIT 10;

-- Exit psql
\q
```

---

## 🔄 Database Schema Overview

### Users Table
```
CREATE TABLE users (
  id UUID PRIMARY KEY,
  publicKey TEXT NOT NULL,
  deviceId VARCHAR UNIQUE NOT NULL,
  isVerified BOOLEAN DEFAULT false,
  name VARCHAR,
  email VARCHAR UNIQUE,
  role ENUM('delivery_person', 'customer', 'admin'),
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

### Deliveries Table
```
CREATE TABLE deliveries (
  id UUID PRIMARY KEY,
  orderId VARCHAR UNIQUE NOT NULL,
  deliveryPersonId UUID REFERENCES users(id),
  customerId UUID REFERENCES users(id),
  startLocation JSON,
  endLocation JSON,
  status ENUM('pending', 'in_transit', 'arrived', 'completed', 'failed'),
  startTime TIMESTAMP,
  completedTime TIMESTAMP,
  distanceMeters FLOAT,
  estimatedETA TIMESTAMP,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

### LocationHistory Table
```
CREATE TABLE location_history (
  id UUID PRIMARY KEY,
  deliveryId UUID REFERENCES deliveries(id),
  userId UUID REFERENCES users(id),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy FLOAT,
  speed FLOAT,
  heading FLOAT,
  createdAt TIMESTAMP
)
```

---

## 🐛 Troubleshooting

### Issue: "Database unavailable"
```bash
# Check Docker logs
docker logs postgres

# Restart Docker
docker-compose down
docker-compose up -d
```

### Issue: "Tables already exist"
```bash
# The Sequelize models will update them
# If you want to reset:
docker-compose down -v  # Delete volumes
docker-compose up -d    # Fresh database
```

### Issue: "Connection refused on port 5432"
```bash
# Ensure Docker daemon is running
# On Windows: Docker Desktop must be open
docker ps  # Should show containers
```

### Issue: "Cannot find module '@types/sequelize'"
```bash
cd backend-api
npm install @types/sequelize
npm run dev
```

---

## 📈 What's Next?

### Phase 1 Complete ✅
- Real PostgreSQL database running
- Data persistence across server restarts
- Delivery tracking saved to database
- Location history tracked in database

### Phase 2 (After this works): Real Bluetooth Integration
### Phase 3: NFC Integration  
### Phase 4: Solana Blockchain (NFT Minting)

---

## 📞 Quick Reference

| Service | Port | Status |
|---------|------|--------|
| PostgreSQL | 5432 | ✅ Running (Docker) |
| Redis | 6379 | ✅ Running (Docker) |
| Backend API | 5000 | ✅ Running (Local) |
| Frontend Web | 3000 | ✅ Running (Local) |

---

## ✨ Next Commands to Run

```bash
# 1. Start Docker containers
docker-compose up -d

# 2. Install dependencies (if needed)
cd backend-api && npm install

# 3. Start backend
npm run dev

# 4. In new terminal, start frontend
cd frontend-web && npm run dev

# 5. Open browser
# http://localhost:3000

# 6. Test database
# See Step 4 above
```

Good luck! 🚀
