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

## What's Been Implemented

### Phase 1A MVP - Feb 13, 2026
- ✅ User Registration/Login with JWT authentication
- ✅ Delta Exchange connection and status check
- ✅ TradingView webhook receiver (`/api/webhook/tradingview`)
- ✅ Futures order placement on Delta Exchange
- ✅ Alerts storage and retrieval
- ✅ Trading settings CRUD operations
- ✅ Background trade execution for alerts
- ✅ Login/Register page with split-screen design
- ✅ Dashboard with 2-window layout (Broker Status + Alerts)
- ✅ Settings page with Delta Exchange connection form
- ✅ Alerts full-screen page with filtering
- ✅ Welcome modal for new users
- ✅ Dark theme with neon green accents

### Phase 1A Enhancements - Feb 14, 2026
- ✅ 4-Strategy Configuration (BTC/ETH Futures/Options with separate toggles & lot sizes)
- ✅ Webhook routing via `strategy` field (futures, options, both)
- ✅ Admin Panel with user deletion & text customization
- ✅ Password change feature & visibility toggles on login
- ✅ Dashboard header with subscription info
- ✅ Static IP display (`104.198.214.223`) for Delta Exchange whitelisting
- ✅ Webhook setup guide in settings page

### Critical Bug Fixes - Feb 14, 2026
- ✅ **Fixed Backend Crash** - Syntax error at line 281 (orphan `})` bracket)
- ✅ **Fixed Duplicate Trades** - Implemented MongoDB-based deduplication with `alert_locks` collection and TTL index
- ✅ **Fixed Position Reversal** - Added logic to close opposite positions before opening new ones
- ✅ **Fixed Cross-Instrument Contamination** - ETH signals only trigger ETH trades, BTC only BTC
- ✅ **Fixed Plain-Text Webhooks** - Now strictly requires JSON format with `symbol` and `action` fields
- ✅ **Fixed Dashboard Refresh Button** - Now working correctly

## Prioritized Backlog

### P0 - Critical (COMPLETED)
- [x] WebSocket Alert Filtering - Users only see alerts relevant to their subscription type
- [x] Options Trading Logic - Full implementation with ATM/OTM strike selection
- [x] Expiry Selection - Same Day, Next Day, Day After, Weekly, Monthly options
- [x] Strategy Type Badge - Shows FUTURES or OPTIONS on alert display

### P1 - High Priority (Phase 1C)
- [ ] Performance reports (12hr/24hr/1week/1month/3month)
- [ ] PDF export functionality
- [ ] Trade history with P&L calculation
- [ ] Position monitoring dashboard
- [ ] Password reset feature (Admin-led or self-serve via Email/SMS)

### P2 - Medium Priority (Phase 2)
- [ ] Chartink webhook integration
- [ ] Zerodha Kite Connect integration
- [ ] AngelOne SmartAPI integration
- [ ] Fyers API integration
- [ ] Symbol mapping engine for stocks
- [ ] MCX futures trading
- [ ] Chatbot integration (AI or Live Chat)

### P3 - Nice to Have
- [ ] Mobile OTP verification
- [ ] Razorpay payment integration
- [ ] Email/SMS notifications
- [ ] WebSocket auto-refresh improvements

## Technical Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT with localStorage
- **Broker**: Delta Exchange API (HMAC-SHA256 signatures)
- **Webhook**: POST /api/webhook/tradingview
- **Important**: App uses dynamic IPs - Delta Exchange API keys must be created WITHOUT IP restriction

## API Endpoints
```
Auth:
POST /api/auth/register - User registration
POST /api/auth/login - User login
GET  /api/auth/me - Get current user
POST /api/auth/change-password - Change user password

Delta Exchange:
POST /api/delta/connect - Connect Delta Exchange
GET  /api/delta/status - Get connection status
DELETE /api/delta/disconnect - Disconnect Delta Exchange
DELETE /api/delta/clear-credentials - Remove saved credentials
POST /api/delta/reconnect - Reconnect with saved credentials
GET  /api/delta/products - Get available products

Settings:
GET  /api/settings - Get trading settings
PUT  /api/settings - Update trading settings

Webhooks:
POST /api/webhook/tradingview - Admin webhook (WolffsInsta subscribers)
POST /api/webhook/user/{webhook_id} - User-specific webhook (Custom strategy)
GET  /api/webhook/info - Get webhook setup info

Alerts & Trades:
GET  /api/alerts - Get user's alerts
GET  /api/alerts/recent - Get recent alerts (public)
GET  /api/trades - Get user's trades

Admin:
GET  /api/admin/users - Get all users
PUT  /api/admin/user/{user_id}/subscription - Update subscription
PUT  /api/admin/user/{user_id}/extend - Extend subscription
DELETE /api/admin/user/{user_id} - Delete user
GET  /api/admin/plans - Get plan configurations
PUT  /api/admin/plans - Update plan configurations
GET  /api/admin/welcome - Get welcome message config
PUT  /api/admin/welcome - Update welcome message config

Subscription:
GET  /api/plans - Get available plans
POST /api/subscription/start-trial - Start free trial
GET  /api/subscription/status - Get subscription status

Config:
GET  /api/config/welcome - Get welcome message (public)
```

## Webhook Format
```json
{
  "symbol": "BTCUSD",       // Required: BTCUSD or ETHUSD
  "action": "BUY",          // Required: BUY or SELL
  "strategy": "futures",    // Optional: futures, options, or both (default)
  "price": 95000,           // Optional
  "message": "Long signal"  // Optional
}
```

## Database Collections
- `users` - User accounts with credentials, subscription, trading settings
- `alerts` - Trade alerts received via webhooks
- `trades` - Executed trades history
- `config` - App configuration (plans, welcome message)
- `alert_locks` - Webhook deduplication locks (TTL: 5 minutes)

## Test Credentials
- **Admin**: Mobile `9999999999`, Password `admin@wolffs2024`

## Mocked Integrations
- Payment gateway for subscriptions (use admin panel for manual subscription management)

## Next Tasks
1. Debug BTC Options trading
2. Implement PDF Performance Reports
3. Add trade history with P&L calculation
