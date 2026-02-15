#!/bin/bash

# ============================================
# Wolffs Insta AutoTrade - VPS Deployment Script
# Domain: wolffsinstatrade.in
# ============================================

set -e

echo "=========================================="
echo "  Wolffs Insta AutoTrade - Deployment"
echo "=========================================="

# Variables
DOMAIN="wolffsinstatrade.in"
APP_DIR="/var/www/wolffsinsta"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

# Update system
echo "[1/10] Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
echo "[2/10] Installing dependencies..."
apt install -y curl wget git nginx certbot python3-certbot-nginx \
    python3 python3-pip python3-venv nodejs npm gnupg

# Install MongoDB
echo "[3/10] Installing MongoDB..."
if ! command -v mongod &> /dev/null; then
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt update
    apt install -y mongodb-org
    systemctl start mongod
    systemctl enable mongod
fi

# Install Node.js 20.x (LTS)
echo "[4/10] Installing Node.js 20.x..."
if ! node --version | grep -q "v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install Yarn
echo "[5/10] Installing Yarn..."
npm install -g yarn

# Create app directory
echo "[6/10] Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Clone/Copy application files (will be replaced by actual upload)
echo "[7/10] Application files should be uploaded to $APP_DIR"

echo "=========================================="
echo "  Base setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Upload your application files to $APP_DIR"
echo "2. Run: cd $APP_DIR && ./setup-app.sh"
echo "=========================================="
