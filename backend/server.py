from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Set
import uuid
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import time
import httpx
import json
import jwt
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', os.urandom(32).hex())
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Wolffs Insta AutoTrade API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ======================= WEBSOCKET CONNECTION MANAGER =======================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast_alert(self, alert: dict):
        """Broadcast new alert to all connected clients instantly"""
        if not self.active_connections:
            return
        
        # Create a JSON-safe copy of the alert (remove MongoDB _id if present)
        safe_alert = {k: v for k, v in alert.items() if k != '_id'}
        message = json.dumps({"type": "new_alert", "alert": safe_alert})
        disconnected = set()
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Failed to send to websocket: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.active_connections.discard(conn)

ws_manager = ConnectionManager()

# ======================= MODELS =======================

class UserCreate(BaseModel):
    mobile: str
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    mobile: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    mobile: str
    name: Optional[str] = None
    created_at: str

class SubscriptionPlan(BaseModel):
    plan_type: str  # "wolffs_alerts" or "custom_strategy"
    subscription_status: str = "inactive"  # "inactive", "trial", "active", "expired"
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    is_trial: bool = False

class DeltaCredentials(BaseModel):
    api_key: str
    api_secret: str
    is_testnet: bool = False
    region: str = "global"  # "india" or "global"

class DeltaConnectionStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    is_connected: bool
    balance: Optional[str] = None
    positions_count: int = 0
    last_checked: Optional[str] = None
    error: Optional[str] = None

class TradingSettings(BaseModel):
    instruments: List[str] = ["BTC", "ETH"]
    # BTC Strategy Settings
    btc_futures_enabled: bool = True
    btc_futures_lot_size: int = 1
    btc_options_enabled: bool = False
    btc_options_lot_size: int = 1
    # ETH Strategy Settings
    eth_futures_enabled: bool = True
    eth_futures_lot_size: int = 1
    eth_options_enabled: bool = False
    eth_options_lot_size: int = 1
    # Options Settings (when options are enabled)
    options_strike_selection: str = "atm"  # "atm", "otm_1", "otm_2"
    options_expiry: str = "weekly"  # "same_day", "next_day", "day_after", "weekly", "monthly"
    # Options Action Settings - What to do on BUY/SELL signals
    options_on_buy_signal: str = "buy_ce"  # "buy_ce", "buy_pe", "sell_ce", "sell_pe"
    options_on_sell_signal: str = "buy_pe"  # "buy_ce", "buy_pe", "sell_ce", "sell_pe"
    # General Settings
    profit_percentage: float = 75.0
    exit_half_position: bool = False
    subscriber_type: str = "wolffs_alerts"  # "wolffs_alerts" or "custom_strategy"
    webhook_id: Optional[str] = None  # Unique webhook ID for custom_strategy users
    # Legacy fields for backward compatibility
    trade_futures: bool = True
    trade_options: bool = False
    btc_lot_size: int = 1
    eth_lot_size: int = 1
    contract_quantity: int = 1

class TradingViewAlert(BaseModel):
    symbol: str
    action: str  # BUY or SELL
    price: Optional[float] = None
    timestamp: Optional[str] = None
    message: Optional[str] = None

class AlertRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    symbol: str
    action: str
    price: Optional[float] = None
    timestamp: str
    message: Optional[str] = None
    executed: bool = False
    execution_result: Optional[str] = None

class OrderRequest(BaseModel):
    product_id: int
    order_type: str = "market_order"
    size: int
    side: str  # buy or sell
    limit_price: Optional[str] = None

# ======================= ADMIN CONFIG =======================

# Admin credentials (in production, use environment variables)
ADMIN_MOBILE = os.environ.get('ADMIN_MOBILE', '9999999999')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin@wolffs2024')

# Default plan configurations (stored in DB, can be updated by admin)
DEFAULT_PLAN_CONFIG = {
    "wolffs_alerts": {
        "name": "WolffsInsta Alerts",
        "description": "Get premium trading signals from WolffsInsta expert strategies. Automated execution on your Delta Exchange account.",
        "features": [
            "Real-time BTC & ETH trading signals",
            "Automatic trade execution",
            "Professional risk management",
            "24/7 market monitoring",
            "Telegram support group access"
        ],
        "price": 2999,
        "currency": "INR",
        "duration_days": 30,
        "trial_days": 2,
        "discount_percent": 0,
        "referral_discount": 10
    },
    "custom_strategy": {
        "name": "Custom Strategy",
        "description": "Deploy your own TradingView or Chartink strategies with your unique webhook. Full control over your trading signals.",
        "features": [
            "Personal webhook URL",
            "Connect TradingView/Chartink",
            "Unlimited custom alerts",
            "Automatic trade execution",
            "Full strategy control"
        ],
        "price": 1999,
        "currency": "INR",
        "duration_days": 30,
        "trial_days": 2,
        "discount_percent": 0,
        "referral_discount": 10
    }
}

# Default welcome message configuration
DEFAULT_WELCOME_CONFIG = {
    "title": "Welcome to Wolffs AutoTrade!",
    "description": "Your automated trading dashboard is ready. To get started:",
    "steps": [
        "Connect your Delta Exchange account in Settings",
        "Configure your trading instruments (BTC/ETH)",
        "Set up TradingView webhook with the provided URL"
    ],
    "button_text": "Got it, Let's Go!"
}

async def get_plan_config():
    """Get plan configuration from database or use defaults"""
    config = await db.config.find_one({"type": "plans"}, {"_id": 0})
    if config:
        return config.get("plans", DEFAULT_PLAN_CONFIG)
    return DEFAULT_PLAN_CONFIG

async def get_welcome_config():
    """Get welcome message configuration from database or use defaults"""
    config = await db.config.find_one({"type": "welcome"}, {"_id": 0})
    if config:
        return config.get("welcome", DEFAULT_WELCOME_CONFIG)
    return DEFAULT_WELCOME_CONFIG

async def init_plan_config():
    """Initialize plan config in database if not exists"""
    existing = await db.config.find_one({"type": "plans"})
    if not existing:
        await db.config.insert_one({
            "type": "plans",
            "plans": DEFAULT_PLAN_CONFIG,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Initialize welcome config
    existing_welcome = await db.config.find_one({"type": "welcome"})
    if not existing_welcome:
        await db.config.insert_one({
            "type": "welcome",
            "welcome": DEFAULT_WELCOME_CONFIG,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Create unique index for alert deduplication locks
    try:
        await db.alert_locks.create_index([("key", 1), ("minute", 1)], unique=True)
        logger.info("Alert locks index created")
    except Exception as e:
        logger.info(f"Alert locks index already exists or error: {e}")
    
    # Create TTL index to auto-delete old locks after 5 minutes
    try:
        await db.alert_locks.create_index("created_at", expireAfterSeconds=300)
        logger.info("Alert locks TTL index created")
    except Exception as e:
        logger.info(f"Alert locks TTL index already exists or error: {e}")

# ======================= UTILITIES =======================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ======================= DELTA EXCHANGE CLIENT =======================

class DeltaExchangeClient:
    def __init__(self, api_key: str, api_secret: str, is_testnet: bool = False, region: str = "india"):
        self.api_key = api_key
        self.api_secret = api_secret
        self.region = region.lower()
        
        # Set base URL based on region and testnet flag
        if is_testnet:
            if self.region == "global":
                self.base_url = "https://testnet-api.delta.exchange"
            else:  # india
                self.base_url = "https://cdn-ind.testnet.deltaex.org"
        else:
            if self.region == "global":
                self.base_url = "https://api.delta.exchange"
            else:  # india
                self.base_url = "https://api.india.delta.exchange"
        
        logger.info(f"Delta Exchange Client initialized - Region: {region}, Testnet: {is_testnet}, URL: {self.base_url}")
        
    def _generate_signature(self, method: str, path: str, query_string: str = "", payload: str = "") -> tuple:
        timestamp = str(int(time.time()))
        # Signature format: method + timestamp + path + query_string + payload
        signature_data = method + timestamp + path + query_string + payload
        signature = hmac.new(
            self.api_secret.encode('utf-8'),
            signature_data.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return timestamp, signature
    
    async def _make_request(self, method: str, path: str, query_params: dict = None, json_body: dict = None, authenticated: bool = False) -> dict:
        url = f"{self.base_url}{path}"
        payload = json.dumps(json_body) if json_body else ""
        query_string = ""
        if query_params:
            sorted_params = sorted(query_params.items())
            query_string = "?" + "&".join(f"{k}={v}" for k, v in sorted_params)
        
        headers = {
            "User-Agent": "wolffs-insta-autotrade",
            "Content-Type": "application/json"
        }
        
        if authenticated:
            timestamp, signature = self._generate_signature(method, path, query_string, payload)
            headers.update({
                "api-key": self.api_key,
                "signature": signature,
                "timestamp": timestamp
            })
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=query_params,
                content=payload.encode() if payload else None
            )
            response.raise_for_status()
            return response.json()
    
    async def get_wallet_balance(self) -> dict:
        return await self._make_request("GET", "/v2/wallet/balances", authenticated=True)
    
    async def get_positions(self) -> dict:
        # Use margined positions endpoint (works for India testnet)
        try:
            return await self._make_request("GET", "/v2/positions/margined", authenticated=True)
        except Exception as e:
            logger.warning(f"Failed to get positions: {e}")
            return {"result": []}
    
    async def get_products(self) -> dict:
        return await self._make_request("GET", "/v2/products")
    
    async def place_order(self, product_id: int, order_type: str, size: int, side: str, limit_price: str = None) -> dict:
        order_body = {
            "product_id": product_id,
            "order_type": order_type,
            "size": size,
            "side": side
        }
        if limit_price:
            order_body["limit_price"] = limit_price
        
        # Make request with better error handling
        method = "POST"
        path = "/v2/orders"
        url = f"{self.base_url}{path}"
        payload = json.dumps(order_body)
        
        timestamp, signature = self._generate_signature(method, path, "", payload)
        headers = {
            "User-Agent": "wolffs-insta-autotrade",
            "Content-Type": "application/json",
            "api-key": self.api_key,
            "signature": signature,
            "timestamp": timestamp
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                content=payload.encode()
            )
            
            # Log detailed error if failed
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Delta Exchange order failed: Status={response.status_code}, Response={error_text}, Order={order_body}")
                response.raise_for_status()
            
            return response.json()
    
    async def test_connection(self) -> dict:
        try:
            balance = await self.get_wallet_balance()
            return {"success": True, "balance": balance}
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            if e.response.status_code == 401:
                error_detail = "Authentication failed. Please check: 1) API Key & Secret are correct, 2) IP is whitelisted in Delta Exchange, 3) Testnet toggle matches where you created keys"
            return {"success": False, "error": error_detail}
        except Exception as e:
            return {"success": False, "error": str(e)}

# ======================= AUTH ROUTES =======================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"mobile": user_data.mobile})
    if existing:
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    
    user_id = str(uuid.uuid4())
    webhook_id = str(uuid.uuid4())[:12]  # Short unique webhook ID for custom strategies
    
    user_doc = {
        "id": user_id,
        "mobile": user_data.mobile,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_admin": user_data.mobile == ADMIN_MOBILE,
        "delta_credentials": None,
        "delta_connected": False,
        "subscription": {
            "plan_type": None,  # Not selected yet
            "status": "inactive",
            "start_date": None,
            "expiry_date": None,
            "is_trial": False
        },
        "trading_settings": {
            "instruments": ["BTC", "ETH"],
            "trade_futures": True,
            "trade_options": False,
            "contract_quantity": 1,
            "profit_percentage": 75.0,
            "exit_half_position": False,
            "subscriber_type": None,
            "webhook_id": webhook_id
        }
    }
    await db.users.insert_one(user_doc)
    
    # Initialize plan config if needed
    await init_plan_config()
    
    token = create_token(user_id)
    return {
        "message": "Registration successful",
        "token": token,
        "user": {
            "id": user_id,
            "mobile": user_data.mobile,
            "name": user_data.name,
            "is_admin": user_doc["is_admin"]
        }
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    user = await db.users.find_one({"mobile": user_data.mobile}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"])
    return {
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "mobile": user["mobile"],
            "name": user.get("name")
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    # Fetch fresh user data from database to ensure latest settings
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    subscription = user.get("subscription", {})
    
    # Check if subscription is expired
    if subscription.get("expiry_date"):
        expiry = datetime.fromisoformat(subscription["expiry_date"].replace('Z', '+00:00'))
        if expiry < datetime.now(timezone.utc):
            subscription["status"] = "expired"
    
    return {
        "id": user["id"],
        "mobile": user["mobile"],
        "name": user.get("name"),
        "is_admin": user.get("is_admin", False),
        "has_delta_credentials": user.get("delta_credentials") is not None,
        "subscription": subscription,
        "trading_settings": user.get("trading_settings", {
            "instruments": ["BTC", "ETH"],
            "trade_futures": True,
            "trade_options": False,
            "contract_quantity": 1,
            "profit_percentage": 75.0,
            "exit_half_position": False
        })
    }

# ======================= SUBSCRIPTION ROUTES =======================

@api_router.get("/plans")
async def get_plans():
    """Get available subscription plans (public)"""
    plans = await get_plan_config()
    return {"plans": plans}

@api_router.post("/subscription/start-trial")
async def start_trial(plan_type: str, current_user: dict = Depends(get_current_user)):
    """Start a free trial for a plan"""
    if plan_type not in ["wolffs_alerts", "custom_strategy"]:
        raise HTTPException(status_code=400, detail="Invalid plan type")
    
    # Check if user already had a trial
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    subscription = user.get("subscription", {})
    
    if subscription.get("status") in ["active", "trial"]:
        # Check if same plan
        if subscription.get("plan_type") == plan_type:
            raise HTTPException(status_code=400, detail="You already have an active subscription for this plan")
    
    # Get plan config for trial days
    plans = await get_plan_config()
    plan_config = plans.get(plan_type, {})
    trial_days = plan_config.get("trial_days", 2)
    
    # Start trial
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=trial_days)
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "subscription": {
                "plan_type": plan_type,
                "status": "trial",
                "start_date": now.isoformat(),
                "expiry_date": expiry.isoformat(),
                "is_trial": True
            },
            "trading_settings.subscriber_type": plan_type
        }}
    )
    
    return {
        "message": "Trial started successfully",
        "plan_type": plan_type,
        "expiry_date": expiry.isoformat(),
        "trial_days": trial_days
    }

@api_router.get("/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    """Get current subscription status"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    subscription = user.get("subscription", {})
    
    # Check if expired
    if subscription.get("expiry_date"):
        expiry = datetime.fromisoformat(subscription["expiry_date"].replace('Z', '+00:00'))
        if expiry < datetime.now(timezone.utc):
            subscription["status"] = "expired"
            await db.users.update_one(
                {"id": current_user["id"]},
                {"$set": {"subscription.status": "expired"}}
            )
    
    return {"subscription": subscription}

# ======================= ADMIN ROUTES =======================

async def verify_admin(current_user: dict = Depends(get_current_user)):
    """Verify user is admin"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@api_router.get("/admin/users")
async def admin_get_users(admin: dict = Depends(verify_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password": 0, "delta_credentials.api_secret": 0}).to_list(1000)
    return {"users": users}

@api_router.put("/admin/user/{user_id}/subscription")
async def admin_update_subscription(user_id: str, plan_type: str, days: int, status: str = "active", admin: dict = Depends(verify_admin)):
    """Update user subscription (admin only)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=days)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "subscription": {
                "plan_type": plan_type,
                "status": status,
                "start_date": now.isoformat(),
                "expiry_date": expiry.isoformat(),
                "is_trial": status == "trial"
            },
            "trading_settings.subscriber_type": plan_type
        }}
    )
    
    return {"message": "Subscription updated", "expiry_date": expiry.isoformat()}

@api_router.put("/admin/user/{user_id}/extend")
async def admin_extend_subscription(user_id: str, days: int, admin: dict = Depends(verify_admin)):
    """Extend user subscription by days (admin only)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    subscription = user.get("subscription", {})
    current_expiry = subscription.get("expiry_date")
    
    if current_expiry:
        expiry = datetime.fromisoformat(current_expiry.replace('Z', '+00:00'))
        # If already expired, extend from now
        if expiry < datetime.now(timezone.utc):
            expiry = datetime.now(timezone.utc)
    else:
        expiry = datetime.now(timezone.utc)
    
    new_expiry = expiry + timedelta(days=days)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "subscription.expiry_date": new_expiry.isoformat(),
            "subscription.status": "active" if subscription.get("status") == "expired" else subscription.get("status", "active")
        }}
    )
    
    return {"message": f"Subscription extended by {days} days", "new_expiry_date": new_expiry.isoformat()}

@api_router.get("/admin/plans")
async def admin_get_plans(admin: dict = Depends(verify_admin)):
    """Get plan configurations (admin only)"""
    plans = await get_plan_config()
    return {"plans": plans}

@api_router.put("/admin/plans")
async def admin_update_plans(plans: dict, admin: dict = Depends(verify_admin)):
    """Update plan configurations (admin only)"""
    await db.config.update_one(
        {"type": "plans"},
        {"$set": {"plans": plans, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Plans updated successfully"}

@api_router.get("/admin/welcome")
async def admin_get_welcome(admin: dict = Depends(verify_admin)):
    """Get welcome message configuration (admin only)"""
    welcome = await get_welcome_config()
    return {"welcome": welcome}

@api_router.put("/admin/welcome")
async def admin_update_welcome(welcome: dict, admin: dict = Depends(verify_admin)):
    """Update welcome message configuration (admin only)"""
    await db.config.update_one(
        {"type": "welcome"},
        {"$set": {"welcome": welcome, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Welcome message updated successfully"}

@api_router.delete("/admin/user/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(verify_admin)):
    """Delete a user (admin only)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("is_admin"):
        raise HTTPException(status_code=400, detail="Cannot delete admin user")
    
    # Delete user's data
    await db.users.delete_one({"id": user_id})
    await db.alerts.delete_many({"source_id": user_id})
    await db.trades.delete_many({"user_id": user_id})
    
    return {"message": "User deleted successfully"}

# ======================= USER PASSWORD CHANGE =======================

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: dict = Depends(get_current_user)):
    """Change user password"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not verify_password(password_data.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Update password
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password": hash_password(password_data.new_password)}}
    )
    
    return {"message": "Password changed successfully"}

# ======================= PUBLIC CONFIG ROUTES =======================

@api_router.get("/config/welcome")
async def get_welcome_message():
    """Get welcome message (public)"""
    welcome = await get_welcome_config()
    return {"welcome": welcome}

# ======================= DELTA EXCHANGE ROUTES =======================

@api_router.post("/delta/connect")
async def connect_delta(credentials: DeltaCredentials, current_user: dict = Depends(get_current_user)):
    delta_client = DeltaExchangeClient(
        api_key=credentials.api_key,
        api_secret=credentials.api_secret,
        is_testnet=credentials.is_testnet,
        region=credentials.region
    )
    
    result = await delta_client.test_connection()
    
    if result["success"]:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {
                "delta_credentials": {
                    "api_key": credentials.api_key,
                    "api_secret": credentials.api_secret,
                    "is_testnet": credentials.is_testnet,
                    "region": credentials.region
                },
                "delta_last_connected": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Delta Exchange connected successfully", "connected": True}
    else:
        raise HTTPException(status_code=400, detail=f"Connection failed: {result['error']}")

@api_router.get("/delta/status")
async def get_delta_status(current_user: dict = Depends(get_current_user)):
    credentials = current_user.get("delta_credentials")
    
    if not credentials:
        return DeltaConnectionStatus(
            is_connected=False,
            error="No credentials configured"
        )
    
    try:
        delta_client = DeltaExchangeClient(
            api_key=credentials["api_key"],
            api_secret=credentials["api_secret"],
            is_testnet=credentials.get("is_testnet", False),
            region=credentials.get("region", "global")
        )
        
        # Get balance - this is the main check
        balance_result = await delta_client.get_wallet_balance()
        logger.info(f"Wallet balance response: {balance_result}")
        
        total_balance = "0"
        balance_currency = "USD"
        
        if balance_result.get("result"):
            balances = balance_result["result"]
            # Calculate total balance across all assets
            total_usd = 0
            for bal in balances:
                available = float(bal.get("available_balance", 0) or 0)
                symbol = bal.get("asset_symbol", "")
                # Log each balance for debugging
                if available > 0:
                    logger.info(f"Balance found: {symbol} = {available}")
                # Sum up USD-equivalent balances
                if symbol in ["USD", "USDT", "USDC"]:
                    total_usd += available
                elif symbol == "BTC" and available > 0:
                    # Approximate BTC to USD (you may want to fetch actual rate)
                    total_usd += available * 95000  # Rough estimate
                elif symbol == "ETH" and available > 0:
                    total_usd += available * 3000  # Rough estimate
            
            if total_usd > 0:
                total_balance = str(round(total_usd, 2))
            else:
                # If no USD balance found, show first non-zero balance
                for bal in balances:
                    available = float(bal.get("available_balance", 0) or 0)
                    if available > 0:
                        total_balance = str(available)
                        balance_currency = bal.get("asset_symbol", "USD")
                        break
        
        # Try to get positions, but don't fail if it errors
        positions_count = 0
        try:
            positions_result = await delta_client.get_positions()
            positions_list = positions_result.get("result", [])
            # Count only positions with non-zero size
            for pos in positions_list:
                size = abs(float(pos.get("size", 0) or 0))
                if size > 0:
                    positions_count += 1
                    logger.info(f"Position found: {pos.get('product_symbol')} size={size}")
        except Exception as pos_err:
            logger.warning(f"Could not fetch positions (non-critical): {pos_err}")
            positions_count = 0
        
        return DeltaConnectionStatus(
            is_connected=True,
            balance=total_balance,
            positions_count=positions_count,
            last_checked=datetime.now(timezone.utc).isoformat()
        )
    except Exception as e:
        logger.error(f"Delta status check failed: {e}")
        return DeltaConnectionStatus(
            is_connected=False,
            error=str(e)
        )

@api_router.delete("/delta/disconnect")
async def disconnect_delta(current_user: dict = Depends(get_current_user)):
    # Keep credentials saved but mark as disconnected
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"delta_connected": False}}
    )
    return {"message": "Delta Exchange disconnected (credentials saved)"}

@api_router.post("/delta/reconnect")
async def reconnect_delta(current_user: dict = Depends(get_current_user)):
    """Reconnect using saved credentials"""
    credentials = current_user.get("delta_credentials")
    if not credentials:
        raise HTTPException(status_code=400, detail="No saved credentials found")
    
    delta_client = DeltaExchangeClient(
        api_key=credentials["api_key"],
        api_secret=credentials["api_secret"],
        is_testnet=credentials.get("is_testnet", False),
        region=credentials.get("region", "global")
    )
    
    result = await delta_client.test_connection()
    
    if result["success"]:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"delta_connected": True, "delta_last_connected": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Reconnected successfully", "connected": True}
    else:
        raise HTTPException(status_code=400, detail=f"Reconnection failed: {result['error']}")

@api_router.delete("/delta/clear-credentials")
async def clear_delta_credentials(current_user: dict = Depends(get_current_user)):
    """Permanently remove saved credentials"""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"delta_credentials": None, "delta_connected": False}}
    )
    return {"message": "Credentials removed"}

@api_router.get("/delta/products")
async def get_delta_products(current_user: dict = Depends(get_current_user)):
    credentials = current_user.get("delta_credentials")
    if not credentials:
        raise HTTPException(status_code=400, detail="Delta Exchange not connected")
    
    delta_client = DeltaExchangeClient(
        api_key=credentials["api_key"],
        api_secret=credentials["api_secret"],
        is_testnet=credentials.get("is_testnet", False)
    )
    
    products = await delta_client.get_products()
    
    # Filter for BTC and ETH perpetuals
    filtered = []
    for p in products.get("result", []):
        symbol = p.get("symbol", "")
        if ("BTCUSD" in symbol or "ETHUSD" in symbol) and p.get("product_type") == "perpetual_futures":
            filtered.append({
                "product_id": p["id"],
                "symbol": p["symbol"],
                "underlying_asset": p.get("underlying_asset", {}).get("symbol"),
                "tick_size": p.get("tick_size"),
                "contract_value": p.get("contract_value")
            })
    
    return {"products": filtered}

# ======================= TRADING SETTINGS ROUTES =======================

@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    # Fetch fresh user data
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    settings = user.get("trading_settings", {})
    
    # Generate webhook_id if not exists
    if not settings.get("webhook_id"):
        webhook_id = str(uuid.uuid4())[:12]
        settings["webhook_id"] = webhook_id
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"trading_settings.webhook_id": webhook_id}}
        )
    
    return {
        "trading_settings": {
            "instruments": settings.get("instruments", ["BTC", "ETH"]),
            # BTC Strategy Settings
            "btc_futures_enabled": settings.get("btc_futures_enabled", settings.get("trade_futures", True)),
            "btc_futures_lot_size": settings.get("btc_futures_lot_size", settings.get("btc_lot_size", 1)),
            "btc_options_enabled": settings.get("btc_options_enabled", settings.get("trade_options", False)),
            "btc_options_lot_size": settings.get("btc_options_lot_size", 1),
            # ETH Strategy Settings
            "eth_futures_enabled": settings.get("eth_futures_enabled", settings.get("trade_futures", True)),
            "eth_futures_lot_size": settings.get("eth_futures_lot_size", settings.get("eth_lot_size", 1)),
            "eth_options_enabled": settings.get("eth_options_enabled", settings.get("trade_options", False)),
            "eth_options_lot_size": settings.get("eth_options_lot_size", 1),
            # Options Settings
            "options_strike_selection": settings.get("options_strike_selection", "atm"),
            "options_expiry": settings.get("options_expiry", "weekly"),
            # General Settings
            "profit_percentage": settings.get("profit_percentage", 75.0),
            "exit_half_position": settings.get("exit_half_position", False),
            "subscriber_type": settings.get("subscriber_type", "wolffs_alerts"),
            "webhook_id": settings.get("webhook_id"),
            # Legacy fields
            "trade_futures": settings.get("trade_futures", True),
            "trade_options": settings.get("trade_options", False),
            "btc_lot_size": settings.get("btc_lot_size", 1),
            "eth_lot_size": settings.get("eth_lot_size", 1),
            "contract_quantity": settings.get("contract_quantity", 1)
        },
        "has_delta_credentials": user.get("delta_credentials") is not None
    }

@api_router.put("/settings")
async def update_settings(settings: TradingSettings, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"trading_settings": settings.model_dump()}}
    )
    return {"message": "Settings updated successfully", "settings": settings}

# ======================= WEBHOOK ROUTES =======================

# Admin webhook - for WolffsInsta Alerts subscribers
@api_router.post("/webhook/tradingview")
async def tradingview_webhook(request: Request, background_tasks: BackgroundTasks):
    """Admin webhook - alerts go to all WolffsInsta Alert subscribers"""
    return await process_webhook(request, background_tasks, source="wolffs_alerts", source_id="admin")

# User-specific webhook - for custom strategy users
@api_router.post("/webhook/user/{webhook_id}")
async def user_tradingview_webhook(webhook_id: str, request: Request, background_tasks: BackgroundTasks):
    """User-specific webhook - alerts go only to this user"""
    # Verify webhook_id belongs to a user
    user = await db.users.find_one({"trading_settings.webhook_id": webhook_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Invalid webhook ID")
    
    return await process_webhook(request, background_tasks, source="custom_strategy", source_id=user["id"])

async def process_webhook(request: Request, background_tasks: BackgroundTasks, source: str, source_id: str):
    """Common webhook processing logic"""
    try:
        content_type = request.headers.get("content-type", "")
        raw_body = await request.body()
        body_text = raw_body.decode() if raw_body else ""
        
        logger.info(f"Received webhook [{source}] - Content-Type: {content_type}, Body: {body_text}")
        
        # Try to parse as JSON first
        body = {}
        if body_text:
            try:
                body = json.loads(body_text)
                if not isinstance(body, dict):
                    body = {"message": str(body)}
            except json.JSONDecodeError:
                # STRICT: Plain text alerts are NOT supported
                # Require JSON format with symbol and action
                logger.warning(f"Non-JSON webhook rejected: {body_text[:100]}")
                body = {"_rejected": True, "_reason": "Plain text format not supported. Use JSON with symbol and action fields."}
    except Exception as e:
        logger.error(f"Error parsing webhook body: {e}")
        body = {}
    
    # Parse alert data
    symbol = None  # Start with None, not "UNKNOWN"
    action = None
    price = None
    message = ""
    strategy_type = "both"
    
    if isinstance(body, dict):
        symbol = body.get("symbol", body.get("ticker"))
        if symbol:
            symbol = str(symbol).upper()
        action = body.get("action", body.get("strategy.order.action"))
        if action:
            action = str(action).upper()
        price = body.get("price", body.get("close"))
        message = str(body.get("message", body.get("comment", "")))
        strategy_type = str(body.get("strategy", body.get("product", body.get("type", "both")))).lower()
        if strategy_type not in ["futures", "options", "both"]:
            strategy_type = "both"
    
    # REJECT alerts without proper symbol - plain text like "BUY" or "SELL" alone is invalid
    if not symbol:
        logger.warning(f"Alert rejected: No symbol in payload. Raw data: {body_text[:100]}")
        return {"status": "rejected", "reason": "No symbol specified in webhook payload. Use JSON format with 'symbol' field."}
    
    # REJECT alerts without proper action
    if not action:
        logger.warning(f"Alert rejected: No action in payload. Raw data: {body_text[:100]}")
        return {"status": "rejected", "reason": "No action specified in webhook payload. Use JSON format with 'action' field."}
    
    # Normalize symbol - clean up various formats
    original_symbol = symbol
    symbol = symbol.replace(".P", "").replace("-", "").replace("USDT", "USD")
    # Ensure it ends with USD for standard format
    if symbol in ["BTC", "BITCOIN"]:
        symbol = "BTCUSD"
    elif symbol in ["ETH", "ETHEREUM"]:
        symbol = "ETHUSD"
    elif not symbol.endswith("USD"):
        symbol = symbol + "USD"
    
    # Determine instrument from symbol - MUST be explicit
    instrument = None
    if symbol == "BTCUSD" or symbol.startswith("BTC"):
        instrument = "BTC"
        symbol = "BTCUSD"  # Normalize
    elif symbol == "ETHUSD" or symbol.startswith("ETH"):
        instrument = "ETH"
        symbol = "ETHUSD"  # Normalize
    else:
        logger.warning(f"Alert rejected: Unknown instrument for symbol {symbol}")
        return {"status": "rejected", "reason": f"Unknown instrument for symbol: {symbol}. Only BTCUSD and ETHUSD supported."}
    
    logger.info(f"Parsed alert: original={original_symbol}, normalized={symbol}, instrument={instrument}, action={action}")
    
    # Normalize action
    if action in ["BUY", "LONG", "ENTRY_LONG"]:
        action = "BUY"
    elif action in ["SELL", "SHORT", "ENTRY_SHORT", "EXIT"]:
        action = "SELL"
    else:
        logger.warning(f"Alert rejected: Invalid action {action}")
        return {"status": "rejected", "reason": f"Invalid action: {action}. Use BUY or SELL."}
    
    # ROBUST DEDUPLICATION using database lock
    # Create a unique key for this alert type
    dedup_key = f"{instrument}_{action}_{source}"
    current_minute = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")  # Minute-level granularity
    
    # Try to insert a dedup lock - if it exists, this is a duplicate
    try:
        await db.alert_locks.insert_one({
            "key": dedup_key,
            "minute": current_minute,
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"New alert lock created: {dedup_key} at {current_minute}")
    except Exception as lock_error:
        # Duplicate key error means alert already processed this minute
        if "duplicate" in str(lock_error).lower() or "E11000" in str(lock_error):
            logger.info(f"Duplicate alert blocked by lock: {dedup_key} at {current_minute}")
            # Find the existing alert
            existing = await db.alerts.find_one({
                "instrument": instrument,
                "action": action,
                "source": source,
                "timestamp": {"$regex": f"^{current_minute}"}
            }, {"_id": 0})
            return {"status": "duplicate_ignored", "alert_id": existing.get("id") if existing else "locked"}
        else:
            logger.warning(f"Lock insert error (proceeding): {lock_error}")
    
    # Also check for recent alerts as backup (include strategy_type to allow futures + options simultaneously)
    thirty_seconds_ago = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    existing_alert = await db.alerts.find_one({
        "instrument": instrument,
        "action": action,
        "source": source,
        "strategy_type": strategy_type,  # Allow different strategy types for same instrument
        "timestamp": {"$gte": thirty_seconds_ago}
    }, {"_id": 0})
    
    if existing_alert:
        logger.info(f"Duplicate alert ignored (time check): {instrument} {action} {strategy_type}")
        return {"status": "duplicate_ignored", "alert_id": existing_alert.get("id")}
    
    # Create alert record
    alert_id = str(uuid.uuid4())
    alert_record = {
        "id": alert_id,
        "symbol": symbol,  # Normalized symbol (BTCUSD or ETHUSD)
        "instrument": instrument,  # BTC or ETH
        "action": action,
        "strategy_type": strategy_type,  # which product type to execute on
        "price": float(price) if price and str(price).replace('.', '').replace('-', '').isdigit() else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "source": source,  # "wolffs_alerts" or "custom_strategy"
        "source_id": source_id,  # "admin" or user_id
        "executed": False,
        "execution_result": None,
        "raw_data": body_text
    }
    
    await db.alerts.insert_one(alert_record)
    logger.info(f"Alert saved: {alert_id} - {symbol} {action} [source: {source}]")
    
    # INSTANT BROADCAST via WebSocket
    await ws_manager.broadcast_alert(alert_record)
    
    # Execute trades
    if action in ["BUY", "SELL"]:
        background_tasks.add_task(execute_trades_for_alert, alert_record)
    
    return {"status": "received", "alert_id": alert_id, "symbol": symbol, "action": action}

async def execute_trades_for_alert(alert: dict):
    """Background task to execute trades for subscribed users"""
    symbol = alert["symbol"]
    action = alert["action"]
    source = alert.get("source", "wolffs_alerts")
    source_id = alert.get("source_id", "admin")
    alert_strategy_type = alert.get("strategy_type", "both")
    alert_instrument = alert.get("instrument")  # Use pre-determined instrument
    alert_price = alert.get("price")  # Current price from alert
    
    logger.info(f"Processing trade: symbol={symbol}, instrument={alert_instrument}, action={action}, strategy_type={alert_strategy_type}")
    
    if not alert_instrument:
        logger.error("No instrument specified in alert, skipping trade execution")
        return
    
    # Find users based on alert source
    if source == "wolffs_alerts":
        # Admin alerts go to all WolffsInsta Alert subscribers
        users = await db.users.find({
            "delta_credentials": {"$ne": None},
            "trading_settings.subscriber_type": "wolffs_alerts"
        }, {"_id": 0}).to_list(1000)
        logger.info(f"Found {len(users)} WolffsInsta Alert subscribers")
    elif source == "custom_strategy":
        # Custom strategy alerts go only to the specific user
        users = await db.users.find({
            "id": source_id,
            "delta_credentials": {"$ne": None}
        }, {"_id": 0}).to_list(1)
        logger.info(f"Found {len(users)} custom strategy user(s) for user_id: {source_id}")
    else:
        logger.warning(f"Unknown alert source: {source}")
        return
    
    for user in users:
        settings = user.get("trading_settings", {})
        instruments = settings.get("instruments", ["BTC", "ETH"])
        
        # Check if user has this instrument enabled
        if alert_instrument not in [i.upper() for i in instruments]:
            logger.info(f"User {user['id']} does not have {alert_instrument} enabled")
            continue
        
        # Determine which strategies to execute - STRICTLY match instrument
        strategies_to_execute = []
        
        # BTC signals -> Only BTC strategies
        if alert_instrument == "BTC":
            if settings.get("btc_futures_enabled", True) and alert_strategy_type in ["futures", "both"]:
                strategies_to_execute.append({
                    "type": "futures",
                    "instrument": "BTC",
                    "lot_size": settings.get("btc_futures_lot_size", 1)
                })
            if settings.get("btc_options_enabled", False) and alert_strategy_type in ["options", "both"]:
                strategies_to_execute.append({
                    "type": "options",
                    "instrument": "BTC",
                    "lot_size": settings.get("btc_options_lot_size", 1),
                    "strike_selection": settings.get("options_strike_selection", "atm"),
                    "expiry": settings.get("options_expiry", "weekly"),
                    "on_buy_signal": settings.get("options_on_buy_signal", "buy_ce"),
                    "on_sell_signal": settings.get("options_on_sell_signal", "buy_pe")
                })
        
        # ETH signals -> Only ETH strategies
        elif alert_instrument == "ETH":
            if settings.get("eth_futures_enabled", True) and alert_strategy_type in ["futures", "both"]:
                strategies_to_execute.append({
                    "type": "futures",
                    "instrument": "ETH",
                    "lot_size": settings.get("eth_futures_lot_size", 1)
                })
            if settings.get("eth_options_enabled", False) and alert_strategy_type in ["options", "both"]:
                strategies_to_execute.append({
                    "type": "options",
                    "instrument": "ETH",
                    "lot_size": settings.get("eth_options_lot_size", 1),
                    "strike_selection": settings.get("options_strike_selection", "atm"),
                    "expiry": settings.get("options_expiry", "weekly"),
                    "on_buy_signal": settings.get("options_on_buy_signal", "buy_ce"),
                    "on_sell_signal": settings.get("options_on_sell_signal", "buy_pe")
                })
        
        if not strategies_to_execute:
            logger.info(f"No strategies enabled for {alert_instrument} for user {user['id']}")
            continue
        
        logger.info(f"Executing {len(strategies_to_execute)} strategies for user {user['id']}: {strategies_to_execute}")
        
        try:
            credentials = user["delta_credentials"]
            delta_client = DeltaExchangeClient(
                api_key=credentials["api_key"],
                api_secret=credentials["api_secret"],
                is_testnet=credentials.get("is_testnet", False),
                region=credentials.get("region", "global")
            )
            
            # Get all products
            products_response = await delta_client.get_products()
            products = products_response.get("result", [])
            
            # Execute each strategy
            for strategy in strategies_to_execute:
                product_id = None
                product_symbol = None
                strategy_type = strategy["type"]
                instrument = strategy["instrument"]
                quantity = strategy["lot_size"]
                
                if strategy_type == "futures":
                    # FUTURES: Find perpetual contract
                    for p in products:
                        p_symbol = p.get("symbol", "").upper()
                        p_type = str(p.get("product_type", "")).lower()
                        
                        is_perpetual = 'perpetual' in p_type or 'futures' in p_type or p_symbol in ['BTCUSD', 'ETHUSD']
                        if instrument in p_symbol and (is_perpetual or p_symbol in ['BTCUSD', 'ETHUSD']):
                            product_id = p["id"]
                            product_symbol = p["symbol"]
                            logger.info(f"Found futures product: {product_symbol} (ID: {product_id})")
                            break
                
                elif strategy_type == "options":
                    # OPTIONS: Full implementation with ATM/OTM strike selection and expiry
                    strike_selection = strategy.get("strike_selection", "atm")
                    expiry_preference = strategy.get("expiry", "weekly")
                    
                    # Get user's option action preferences
                    on_buy_signal = strategy.get("on_buy_signal", "buy_ce")
                    on_sell_signal = strategy.get("on_sell_signal", "buy_pe")
                    
                    # Determine option type (C/P) and order side (buy/sell) based on signal and user preference
                    if action == "BUY":
                        option_action = on_buy_signal
                    else:  # SELL signal
                        option_action = on_sell_signal
                    
                    # Parse the option action: "buy_ce", "buy_pe", "sell_ce", "sell_pe"
                    if option_action == "buy_ce":
                        option_type = "C"
                        option_side = "buy"
                    elif option_action == "buy_pe":
                        option_type = "P"
                        option_side = "buy"
                    elif option_action == "sell_ce":
                        option_type = "C"
                        option_side = "sell"
                    elif option_action == "sell_pe":
                        option_type = "P"
                        option_side = "sell"
                    else:
                        # Default fallback
                        option_type = "C" if action == "BUY" else "P"
                        option_side = "buy"
                    
                    logger.info(f"Options action: Signal={action} -> Action={option_action} (Type={option_type}, Side={option_side})")
                    
                    # Get spot price - use alert price or fetch from products
                    spot_price = alert_price
                    if not spot_price:
                        # Try to get spot price from perpetual product
                        for p in products:
                            p_symbol = p.get("symbol", "").upper()
                            if instrument in p_symbol and ('perpetual' in str(p.get("product_type", "")).lower() or p_symbol in ['BTCUSD', 'ETHUSD']):
                                spot_price = float(p.get("spot_price") or p.get("mark_price") or 0)
                                if spot_price > 0:
                                    break
                    
                    if not spot_price:
                        # Default prices if we can't fetch
                        spot_price = 95000 if instrument == "BTC" else 3500
                        logger.warning(f"Using default spot price for {instrument}: {spot_price}")
                    else:
                        spot_price = float(spot_price)
                    
                    logger.info(f"Options trading - Instrument: {instrument}, Spot: {spot_price}, Strike Selection: {strike_selection}, Expiry: {expiry_preference}")
                    
                    # Calculate strike interval based on instrument
                    # Based on actual Delta Exchange data:
                    # BTC: $1000 intervals (some $200 near ATM)
                    # ETH: $20 intervals
                    if instrument == "BTC":
                        strike_interval = 1000  # BTC options have $1000 strike intervals
                    else:
                        strike_interval = 20  # ETH options have $20 strike intervals
                    
                    # Calculate ATM strike (nearest round strike)
                    atm_strike = round(spot_price / strike_interval) * strike_interval
                    
                    # Calculate target strike based on selection
                    if strike_selection == "atm":
                        target_strike = atm_strike
                    elif strike_selection == "otm_1":
                        # 1 strike OTM: higher for calls, lower for puts
                        if option_type == "C":
                            target_strike = atm_strike + strike_interval
                        else:
                            target_strike = atm_strike - strike_interval
                    elif strike_selection == "otm_2":
                        # 2 strikes OTM
                        if option_type == "C":
                            target_strike = atm_strike + (2 * strike_interval)
                        else:
                            target_strike = atm_strike - (2 * strike_interval)
                    else:
                        target_strike = atm_strike
                    
                    logger.info(f"Target strike: {target_strike} (ATM: {atm_strike})")
                    
                    # Calculate target expiry date
                    now = datetime.now(timezone.utc)
                    today = now.date()
                    
                    if expiry_preference == "same_day":
                        target_expiry_date = today
                    elif expiry_preference == "next_day":
                        target_expiry_date = today + timedelta(days=1)
                    elif expiry_preference == "day_after":
                        target_expiry_date = today + timedelta(days=2)
                    elif expiry_preference == "weekly":
                        # Find next Friday (or same day if today is Friday)
                        days_until_friday = (4 - today.weekday()) % 7
                        if days_until_friday == 0 and now.hour >= 12:  # If Friday afternoon, use next week
                            days_until_friday = 7
                        target_expiry_date = today + timedelta(days=days_until_friday)
                    elif expiry_preference == "monthly":
                        # Find last Friday of current or next month
                        import calendar
                        year = today.year
                        month = today.month
                        
                        # Get last day of month
                        last_day = calendar.monthrange(year, month)[1]
                        last_date = today.replace(day=last_day)
                        
                        # Find last Friday
                        while last_date.weekday() != 4:  # 4 = Friday
                            last_date -= timedelta(days=1)
                        
                        # If already past this month's expiry, use next month
                        if last_date <= today:
                            if month == 12:
                                year += 1
                                month = 1
                            else:
                                month += 1
                            last_day = calendar.monthrange(year, month)[1]
                            last_date = today.replace(year=year, month=month, day=last_day)
                            while last_date.weekday() != 4:
                                last_date -= timedelta(days=1)
                        
                        target_expiry_date = last_date
                    else:
                        # Default to weekly
                        days_until_friday = (4 - today.weekday()) % 7
                        if days_until_friday == 0:
                            days_until_friday = 7
                        target_expiry_date = today + timedelta(days=days_until_friday)
                    
                    logger.info(f"Target expiry date: {target_expiry_date}")
                    
                    # Delta Exchange ACTUAL format: C-BTC-66000-200226 or P-ETH-3500-200226
                    # Format: {C/P}-{ASSET}-{STRIKE}-{DDMMYY}
                    target_expiry_str = target_expiry_date.strftime("%d%m%y")  # DDMMYY format
                    
                    # Build the expected option symbol prefix
                    # e.g., "C-BTC-" for BTC Call or "P-ETH-" for ETH Put
                    option_prefix = f"{option_type}-{instrument}-"
                    
                    logger.info(f"Looking for options with prefix: {option_prefix}, target strike: {target_strike}, expiry: {target_expiry_str}")
                    
                    # Find matching option product
                    best_match = None
                    best_match_score = float('inf')
                    
                    for p in products:
                        p_symbol = p.get("symbol", "").upper()
                        contract_type = str(p.get("contract_type", "")).lower()
                        
                        # Must be a call or put option
                        is_call_option = contract_type == "call_options" or p_symbol.startswith("C-")
                        is_put_option = contract_type == "put_options" or p_symbol.startswith("P-")
                        
                        if not (is_call_option or is_put_option):
                            continue
                        
                        # Must match the option type we want (C for BUY/Call, P for SELL/Put)
                        if option_type == "C" and not is_call_option:
                            continue
                        if option_type == "P" and not is_put_option:
                            continue
                        
                        # Must match instrument
                        if f"-{instrument}-" not in p_symbol:
                            continue
                        
                        # Parse Delta Exchange symbol format: C-BTC-66000-200226
                        parts = p_symbol.split("-")
                        if len(parts) != 4:
                            continue
                        
                        try:
                            symbol_strike = int(parts[2])
                            symbol_expiry = parts[3]  # DDMMYY format
                        except (ValueError, IndexError):
                            continue
                        
                        # Check expiry match
                        expiry_match = (symbol_expiry == target_expiry_str)
                        
                        # If no exact expiry match, try to find closest available expiry
                        if not expiry_match:
                            # Parse the symbol expiry date
                            try:
                                symbol_expiry_date = datetime.strptime(symbol_expiry, "%d%m%y").date()
                                days_diff = abs((symbol_expiry_date - target_expiry_date).days)
                                # Allow up to 3 days difference for flexibility
                                if days_diff <= 3:
                                    expiry_match = True
                            except ValueError:
                                continue
                        
                        if not expiry_match:
                            continue
                        
                        # Calculate strike difference score (lower is better)
                        strike_diff = abs(symbol_strike - target_strike)
                        score = strike_diff / strike_interval
                        
                        if score < best_match_score:
                            best_match = p
                            best_match_score = score
                            logger.info(f"Potential match: {p_symbol}, strike={symbol_strike}, expiry={symbol_expiry}, score={score:.2f}")
                    
                    # Allow larger tolerance since option chains may not have all strikes
                    # Best match within 50 strikes difference (or any match if none closer)
                    if best_match and best_match_score < 50:
                        product_id = best_match["id"]
                        product_symbol = best_match["symbol"]
                        if best_match_score > 5:
                            logger.warning(f"⚠️ Using closest available strike (score={best_match_score:.1f}): {product_symbol}")
                        logger.info(f"✅ Found options product: {product_symbol} (ID: {product_id})")
                    else:
                        logger.warning(f"No matching options product found for {instrument} {option_type} @ {target_strike} exp {target_expiry_date}")
                        # Record failed trade due to no matching product
                        await db.trades.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user["id"],
                            "alert_id": alert["id"],
                            "symbol": symbol,
                            "strategy_type": strategy_type,
                            "instrument": instrument,
                            "action": action,
                            "quantity": quantity,
                            "status": "failed",
                            "error": f"No matching options product: {instrument} {option_type} @ strike {target_strike} expiry {target_expiry_date}. Check Delta Exchange option chain.",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                        continue
                
                if not product_id:
                    logger.warning(f"No matching {strategy_type} product found for {instrument}")
                    continue
                
                # POSITION REVERSAL LOGIC
                # Step 1: Check current position for this product
                # Step 2: If position exists in opposite direction, close it first
                # Step 3: Then open new position
                
                # For futures: side based on signal (BUY->buy, SELL->sell)
                # For options: side based on user preference (option_side from settings)
                if strategy_type == "options":
                    side = option_side  # Already calculated from user settings
                    opposite_side = "sell" if option_side == "buy" else "buy"
                else:
                    side = "buy" if action == "BUY" else "sell"
                    opposite_side = "sell" if action == "BUY" else "buy"
                
                try:
                    # Get current positions
                    positions = await delta_client.get_positions()
                    current_position = None
                    
                    # DEBUG: Log all positions returned
                    logger.info(f"📊 Positions returned: {len(positions.get('result', []))} positions")
                    for pos in positions.get("result", []):
                        # Delta Exchange uses 'product_symbol' not 'symbol'
                        pos_symbol = pos.get("product_symbol") or pos.get("symbol", "")
                        pos_size = pos.get("size", 0)
                        logger.info(f"   Position: {pos_symbol}, size={pos_size}, product_id={pos.get('product_id')}")
                    
                    # FOR OPTIONS: Close ALL existing option positions on this instrument before opening new
                    if strategy_type == "options":
                        # Look for any CE or PE position on this instrument
                        ce_prefix = f"C-{instrument}-"
                        pe_prefix = f"P-{instrument}-"
                        
                        logger.info(f"🔍 Looking for positions with prefix: {ce_prefix} or {pe_prefix}")
                        
                        for pos in positions.get("result", []):
                            # Delta Exchange uses 'product_symbol' not 'symbol'
                            pos_symbol = (pos.get("product_symbol") or pos.get("symbol", "")).upper()
                            pos_size = float(pos.get("size", 0))
                            
                            # Check if this is ANY option on this instrument (CE or PE)
                            is_instrument_option = pos_symbol.startswith(ce_prefix) or pos_symbol.startswith(pe_prefix)
                            
                            logger.info(f"   Checking: {pos_symbol}, size={pos_size}, matches={is_instrument_option}")
                            
                            if is_instrument_option and pos_size != 0:
                                close_pos_id = pos.get("product_id")
                                close_size = abs(pos_size)
                                close_side = "sell" if pos_size > 0 else "buy"  # Opposite to close
                                
                                # Determine if it's CE or PE for logging
                                opt_type = "CE" if pos_symbol.startswith(ce_prefix) else "PE"
                                
                                logger.info(f"🔄 Closing existing {opt_type} position: {pos_symbol} size={close_size}")
                                
                                try:
                                    close_result = await delta_client.place_order(
                                        product_id=close_pos_id,
                                        order_type="market_order",
                                        size=int(close_size),
                                        side=close_side
                                    )
                                    logger.info(f"✅ {opt_type} position closed: {close_result}")
                                    
                                    # Record the close trade
                                    await db.trades.insert_one({
                                        "id": str(uuid.uuid4()),
                                        "user_id": user["id"],
                                        "alert_id": alert["id"],
                                        "symbol": symbol,
                                        "product_symbol": pos_symbol,
                                        "strategy_type": strategy_type,
                                        "instrument": instrument,
                                        "action": f"CLOSE_{opt_type}",
                                        "side": close_side,
                                        "quantity": int(close_size),
                                        "product_id": close_pos_id,
                                        "result": close_result,
                                        "status": "success",
                                        "timestamp": datetime.now(timezone.utc).isoformat()
                                    })
                                except Exception as close_err:
                                    logger.error(f"Failed to close {opt_type} position: {close_err}")
                    
                    # Check for same product position (for futures)
                    if strategy_type == "futures":
                        for pos in positions.get("result", []):
                            if pos.get("product_id") == product_id or pos.get("symbol", "").upper() == product_symbol:
                                pos_size = float(pos.get("size", 0))
                                if pos_size != 0:
                                    current_position = {
                                        "size": abs(pos_size),
                                        "side": "buy" if pos_size > 0 else "sell"
                                    }
                                    logger.info(f"Current position for {product_symbol}: {current_position}")
                                    break
                    
                    # If there's an opposite position on same product (futures), close it first
                    if current_position and current_position["side"] == opposite_side:
                        close_size = current_position["size"]
                        logger.info(f"Closing opposite position: {close_size} {current_position['side']} -> placing {close_size} {side}")
                        
                        # Close existing position
                        close_result = await delta_client.place_order(
                            product_id=product_id,
                            order_type="market_order",
                            size=int(close_size),
                            side=side  # Opposite side to close
                        )
                        logger.info(f"Position closed: {close_result}")
                        
                        # Record the close trade
                        await db.trades.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user["id"],
                            "alert_id": alert["id"],
                            "symbol": symbol,
                            "product_symbol": product_symbol,
                            "strategy_type": strategy_type,
                            "instrument": instrument,
                            "action": f"CLOSE_{current_position['side'].upper()}",
                            "side": side,
                            "quantity": int(close_size),
                            "product_id": product_id,
                            "result": close_result,
                            "status": "success",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                    
                    # Now open new position
                    logger.info(f"Opening new position: {quantity} {side} for {product_symbol}")
                    result = await delta_client.place_order(
                        product_id=product_id,
                        order_type="market_order",
                        size=quantity,
                        side=side
                    )
                    
                    logger.info(f"New position opened: {result}")
                    
                    # Record the new trade
                    await db.trades.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "alert_id": alert["id"],
                        "symbol": symbol,
                        "product_symbol": product_symbol,
                        "strategy_type": strategy_type,
                        "instrument": instrument,
                        "action": action,
                        "side": side,
                        "quantity": quantity,
                        "product_id": product_id,
                        "result": result,
                        "status": "success",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                    
                except Exception as order_err:
                    logger.error(f"Order placement failed for user {user['id']}: {order_err}")
                    # Record failed trade
                    await db.trades.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "alert_id": alert["id"],
                        "symbol": symbol,
                        "product_symbol": product_symbol if product_symbol else "UNKNOWN",
                        "strategy_type": strategy_type,
                        "instrument": instrument,
                        "action": action,
                        "quantity": quantity,
                        "status": "failed",
                        "error": str(order_err),
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                    
        except Exception as e:
            logger.error(f"Trade execution failed for user {user['id']}: {e}")

# ======================= ALERTS ROUTES =======================

@api_router.get("/alerts")
async def get_alerts(limit: int = 100, current_user: dict = Depends(get_current_user)):
    """Get alerts based on user's subscriber type"""
    settings = current_user.get("trading_settings", {})
    subscriber_type = settings.get("subscriber_type", "wolffs_alerts")
    
    if subscriber_type == "wolffs_alerts":
        # Show only WolffsInsta admin alerts
        query = {"source": "wolffs_alerts"}
    else:
        # Show only user's custom strategy alerts
        query = {"source": "custom_strategy", "source_id": current_user["id"]}
    
    alerts = await db.alerts.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"alerts": alerts}

@api_router.get("/alerts/recent")
async def get_recent_alerts(hours: int = 24):
    """Get recent alerts (public endpoint for display)"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    alerts = await db.alerts.find(
        {"timestamp": {"$gte": cutoff.isoformat()}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    return {"alerts": alerts}

# ======================= TRADES ROUTES =======================

@api_router.get("/trades")
async def get_trades(limit: int = 50, current_user: dict = Depends(get_current_user)):
    trades = await db.trades.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"trades": trades}

# ======================= ROOT ROUTE =======================

@api_router.get("/")
async def root():
    return {"message": "Wolffs Insta AutoTrade API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

# ======================= WEBSOCKET ENDPOINT (must be on main app) =======================

@app.websocket("/api/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket endpoint for real-time alert updates"""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, listen for any client messages
            data = await websocket.receive_text()
            # Echo back as heartbeat
            await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

# ======================= WEBHOOK INFO =======================

@api_router.get("/webhook/info")
async def get_webhook_info(current_user: dict = Depends(get_current_user)):
    """Get webhook URLs based on user's subscriber type"""
    backend_url = os.environ.get('BACKEND_URL', os.environ.get('REACT_APP_BACKEND_URL', ''))
    settings = current_user.get("trading_settings", {})
    subscriber_type = settings.get("subscriber_type", "wolffs_alerts")
    webhook_id = settings.get("webhook_id", "")
    
    if subscriber_type == "wolffs_alerts":
        webhook_url = f"{backend_url}/api/webhook/tradingview"
        webhook_note = "This is the WolffsInsta master webhook (managed by admin)"
    else:
        webhook_url = f"{backend_url}/api/webhook/user/{webhook_id}"
        webhook_note = "This is your personal webhook for custom strategies"
    
    return {
        "subscriber_type": subscriber_type,
        "webhook_url": webhook_url,
        "webhook_note": webhook_note,
        "webhook_id": webhook_id if subscriber_type == "custom_strategy" else None,
        "format": {
            "symbol": "BTCUSD or ETHUSD",
            "action": "BUY or SELL",
            "price": "optional - current price",
            "message": "optional - custom message"
        },
        "example": {
            "symbol": "BTCUSD",
            "action": "BUY",
            "price": 95000,
            "message": "Long signal"
        }
    }

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
