# Wolffs Insta AutoTrade - PRD

## Original Problem Statement
Build a TradingView to Delta Exchange auto-trading app for BTC/ETH futures and options with 2 phases:
- Phase 1: TradingView → Delta Exchange (BTC, ETH futures and options)
- Phase 2: Chartink/TradingView → Zerodha, AngelOne, Fyers (stocks, MCX, options)

## User Personas
1. **Crypto Traders** - Want automated execution of TradingView signals on Delta Exchange
2. **Signal Followers** - Subscribe to trading alerts and want hands-free execution
3. **Algo Traders** - Need webhook integration for their custom strategies

## Core Requirements (Static)
- User authentication (mobile + password)
- Delta Exchange API integration
- TradingView webhook receiver
- BTC & ETH futures trading
- Options trading (Phase 1B)
- Real-time alert notifications
- Trading settings configuration
- Performance reports (Phase 1C)

## What's Been Implemented (Phase 1A MVP) - Feb 13, 2026

### Backend APIs
- ✅ User Registration/Login with JWT authentication
- ✅ Delta Exchange connection and status check
- ✅ TradingView webhook receiver (`/api/webhook/tradingview`)
- ✅ Futures order placement on Delta Exchange
- ✅ Alerts storage and retrieval
- ✅ Trading settings CRUD operations
- ✅ Background trade execution for alerts

### Frontend Pages
- ✅ Login/Register page with split-screen design
- ✅ Dashboard with 2-window layout (Broker Status + Alerts)
- ✅ Settings page with Delta Exchange connection form
- ✅ Alerts full-screen page with filtering
- ✅ Welcome modal for new users
- ✅ Dark theme with neon green accents

### Trading Features
- ✅ BTC/ETH instrument selection
- ✅ Futures trading mode toggle
- ✅ Contract quantity configuration
- ✅ Profit percentage target setting
- ✅ Half-position exit option
- ✅ Webhook URL display for TradingView setup

## Prioritized Backlog

### P0 - Critical (Phase 1B)
- [ ] Options trading integration (OTM 2-3 strikes)
- [ ] Position reversal logic (close opposite on new signal)
- [ ] Auto profit booking at configured percentage
- [ ] Expiry selection based on liquidity

### P1 - High Priority (Phase 1C)
- [ ] Performance reports (12hr/24hr/1week/1month/3month)
- [ ] PDF export functionality
- [ ] Trade history with P&L calculation
- [ ] Position monitoring dashboard

### P2 - Medium Priority (Phase 2)
- [ ] Chartink webhook integration
- [ ] Zerodha Kite Connect integration
- [ ] AngelOne SmartAPI integration
- [ ] Fyers API integration
- [ ] Symbol mapping engine for stocks
- [ ] MCX futures trading

### P3 - Nice to Have
- [ ] Mobile OTP verification
- [ ] Razorpay payment integration
- [ ] Multi-user subscription model
- [ ] Email/SMS notifications
- [ ] WebSocket for real-time updates

## Technical Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT with localStorage
- **Broker**: Delta Exchange API (HMAC-SHA256 signatures)
- **Webhook**: POST /api/webhook/tradingview

## API Endpoints
```
POST /api/auth/register - User registration
POST /api/auth/login - User login
GET  /api/auth/me - Get current user
POST /api/delta/connect - Connect Delta Exchange
GET  /api/delta/status - Get connection status
DELETE /api/delta/disconnect - Disconnect Delta Exchange
GET  /api/settings - Get trading settings
PUT  /api/settings - Update trading settings
POST /api/webhook/tradingview - Receive TradingView alerts
GET  /api/alerts - Get all alerts
GET  /api/alerts/recent - Get recent alerts (public)
GET  /api/trades - Get user's trades
GET  /api/webhook/info - Get webhook setup info
```

## Next Tasks
1. Implement options trading with OTM strike selection
2. Add position reversal logic
3. Build auto profit booking system
4. Create performance reports with PDF export
