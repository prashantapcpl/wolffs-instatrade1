#!/bin/bash

# ============================================
# Wolffs Insta AutoTrade - App Setup Script
# Run this AFTER uploading application files
# ============================================

set -e

DOMAIN="wolffsinstatrade.in"
APP_DIR="/var/www/wolffsinsta"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo "=========================================="
echo "  Setting up Wolffs Insta AutoTrade"
echo "=========================================="

# Setup Backend
echo "[1/6] Setting up Backend..."
cd $BACKEND_DIR

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create backend .env file
cat > .env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=wolffs_autotrade
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
CORS_ORIGINS=https://wolffsinstatrade.in,https://www.wolffsinstatrade.in
EOF

deactivate

# Setup Frontend
echo "[2/6] Setting up Frontend..."
cd $FRONTEND_DIR

# Install Node dependencies
yarn install

# Create frontend .env file
cat > .env << 'EOF'
REACT_APP_BACKEND_URL=https://wolffsinstatrade.in
EOF

# Build frontend for production
echo "[3/6] Building Frontend..."
yarn build

# Create systemd service for backend
echo "[4/6] Creating systemd services..."
cat > /etc/systemd/system/wolffs-backend.service << EOF
[Unit]
Description=Wolffs Insta AutoTrade Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=$BACKEND_DIR
Environment=PATH=$BACKEND_DIR/venv/bin
ExecStart=$BACKEND_DIR/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Setup Nginx
echo "[5/6] Configuring Nginx..."
cat > /etc/nginx/sites-available/wolffsinsta << 'EOF'
server {
    listen 80;
    server_name wolffsinstatrade.in www.wolffsinstatrade.in;

    # Frontend - serve static files
    location / {
        root /var/www/wolffsinsta/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # WebSocket
    location /api/ws {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/wolffsinsta /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Start services
echo "[6/6] Starting services..."
systemctl daemon-reload
systemctl enable wolffs-backend
systemctl start wolffs-backend
systemctl restart nginx

echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Your app is now running at: http://$DOMAIN"
echo ""
echo "Next step: Run SSL setup"
echo "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "=========================================="
