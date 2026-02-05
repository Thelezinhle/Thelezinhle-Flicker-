#!/bin/bash

echo "🚀 Setting up FlickerSecure Production System..."

# Backend setup
echo "📦 Setting up Backend API..."
cd backend-api
npm install
cd ..

# Frontend setup
echo "🌐 Setting up Frontend Web..."
cd frontend-web
npm install
cd ..

# Create environment files
echo "⚙️ Creating environment files..."

# Backend .env
cat > backend-api/.env << EOL
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flickersecure_db
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=your_jwt_secret_here_change_in_production
ENCRYPTION_KEY=32_byte_key_for_encryption_here
REDIS_HOST=localhost
REDIS_PORT=6379
FRONTEND_URL=http://localhost:3000
EOL

# Frontend .env
cat > frontend-web/.env << EOL
VITE_API_URL=http://localhost:5000/api
VITE_WS_URL=http://localhost:5000
VITE_APP_NAME=FlickerSecure
EOL

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Install PostgreSQL and Redis"
echo "2. Update passwords in backend-api/.env"
echo "3. Run backend: cd backend-api && npm run dev"
echo "4. Run frontend: cd frontend-web && npm run dev"
echo "5. Access at http://localhost:3000"
