#!/bin/bash

# ============================================
# Wolffs Insta AutoTrade - COMPLETE DEPLOYMENT
# Domain: wolffsinstatrade.in
# VPS IP: 72.62.230.214
# ============================================

set -e

DOMAIN="wolffsinstatrade.in"
APP_DIR="/var/www/wolffsinsta"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     WOLFFS INSTA AUTOTRADE - COMPLETE DEPLOYMENT SCRIPT      ║"
echo "║                  Domain: $DOMAIN                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Update System
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 1/12] Updating system packages..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
apt update && apt upgrade -y

# Step 2: Install basic dependencies
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 2/12] Installing system dependencies..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
apt install -y curl wget git nginx certbot python3-certbot-nginx \
    python3 python3-pip python3-venv gnupg unzip

# Step 3: Install MongoDB 7.0
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 3/12] Installing MongoDB..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if ! command -v mongod &> /dev/null; then
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt update
    apt install -y mongodb-org
fi
systemctl start mongod
systemctl enable mongod
echo "✓ MongoDB installed and running"

# Step 4: Install Node.js 20.x
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 4/12] Installing Node.js 20.x..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn
echo "✓ Node.js $(node --version) and Yarn installed"

# Step 5: Create application directory
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 5/12] Creating application directory..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
mkdir -p $APP_DIR
echo "✓ Created $APP_DIR"

# Check if app files exist
if [ ! -d "$APP_DIR/backend" ] || [ ! -d "$APP_DIR/frontend" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  IMPORTANT: Application files not found!                     ║"
    echo "║                                                              ║"
    echo "║  Please upload your app files to: $APP_DIR           ║"
    echo "║                                                              ║"
    echo "║  Required structure:                                         ║"
    echo "║    /var/www/wolffsinsta/backend/                             ║"
    echo "║    /var/www/wolffsinsta/frontend/                            ║"
    echo "║                                                              ║"
    echo "║  After uploading, run this script again.                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# Step 6: Setup Backend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 6/12] Setting up Backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd $APP_DIR/backend

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Create backend .env file
cat > .env << 'ENVEOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=wolffs_autotrade
JWT_SECRET=wolffs-super-secret-jwt-key-2024-production
CORS_ORIGINS=https://wolffsinstatrade.in,https://www.wolffsinstatrade.in,http://localhost:3000
ENVEOF

deactivate
echo "✓ Backend setup complete"

# Step 7: Setup Frontend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 7/12] Setting up Frontend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd $APP_DIR/frontend

# Create frontend .env file
cat > .env << 'ENVEOF'
REACT_APP_BACKEND_URL=https://wolffsinstatrade.in
ENVEOF

# Install dependencies and build
yarn install
echo "✓ Frontend dependencies installed"

# Step 8: Build Frontend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 8/12] Building Frontend for production..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
yarn build
echo "✓ Frontend built successfully"

# Step 9: Create systemd service
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 9/12] Creating systemd service..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat > /etc/systemd/system/wolffs-backend.service << 'SERVICEEOF'
[Unit]
Description=Wolffs Insta AutoTrade Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/wolffsinsta/backend
Environment=PATH=/var/www/wolffsinsta/backend/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/var/www/wolffsinsta/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF
echo "✓ Systemd service created"

# Step 10: Configure Nginx
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 10/12] Configuring Nginx..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat > /etc/nginx/sites-available/wolffsinsta << 'NGINXEOF'
server {
    listen 80;
    server_name wolffsinstatrade.in www.wolffsinstatrade.in;

    # Frontend - serve React build
    location / {
        root /var/www/wolffsinsta/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
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
        proxy_send_timeout 86400;
    }

    # WebSocket support
    location /api/ws {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINXEOF

# Enable site and remove default
ln -sf /etc/nginx/sites-available/wolffsinsta /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
echo "✓ Nginx configured"

# Step 11: Start services
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 11/12] Starting services..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl daemon-reload
systemctl enable wolffs-backend
systemctl start wolffs-backend
systemctl restart nginx
echo "✓ Services started"

# Step 12: Setup SSL (optional - requires DNS to be configured)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Step 12/12] SSL Certificate Setup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To enable HTTPS, run this command after DNS is configured:"
echo ""
echo "  sudo certbot --nginx -d wolffsinstatrade.in -d www.wolffsinstatrade.in"
echo ""

# Final Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  DEPLOYMENT COMPLETE! 🎉                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Your app is now running!                                    ║"
echo "║                                                              ║"
echo "║  HTTP:  http://wolffsinstatrade.in                           ║"
echo "║  HTTP:  http://72.62.230.214                                 ║"
echo "║                                                              ║"
echo "║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║"
echo "║                                                              ║"
echo "║  IMPORTANT - DO THESE STEPS:                                 ║"
echo "║                                                              ║"
echo "║  1. Point your domain DNS to: 72.62.230.214                  ║"
echo "║     (In Hostinger: DNS Zone → A Record → 72.62.230.214)      ║"
echo "║                                                              ║"
echo "║  2. Whitelist IP in Delta Exchange: 72.62.230.214            ║"
echo "║                                                              ║"
echo "║  3. After DNS propagates, enable SSL:                        ║"
echo "║     sudo certbot --nginx -d wolffsinstatrade.in \\            ║"
echo "║                          -d www.wolffsinstatrade.in          ║"
echo "║                                                              ║"
echo "║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║"
echo "║                                                              ║"
echo "║  Useful Commands:                                            ║"
echo "║    Check backend: sudo systemctl status wolffs-backend       ║"
echo "║    Backend logs:  sudo journalctl -u wolffs-backend -f       ║"
echo "║    Restart:       sudo systemctl restart wolffs-backend      ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
