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
    trade_futures: bool = True
    trade_options: bool = False
    contract_quantity: int = 1
    profit_percentage: float = 75.0
    exit_half_position: bool = False

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
        return await self._make_request("GET", "/v2/positions", authenticated=True)
    
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
        return await self._make_request("POST", "/v2/orders", json_body=order_body, authenticated=True)
    
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
    user_doc = {
        "id": user_id,
        "mobile": user_data.mobile,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "delta_credentials": None,
        "trading_settings": {
            "instruments": ["BTC", "ETH"],
            "trade_futures": True,
            "trade_options": False,
            "contract_quantity": 1,
            "profit_percentage": 75.0,
            "exit_half_position": False
        }
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    return {
        "message": "Registration successful",
        "token": token,
        "user": {
            "id": user_id,
            "mobile": user_data.mobile,
            "name": user_data.name
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
    return {
        "id": current_user["id"],
        "mobile": current_user["mobile"],
        "name": current_user.get("name"),
        "has_delta_credentials": current_user.get("delta_credentials") is not None,
        "trading_settings": current_user.get("trading_settings", {})
    }

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
        
        balance_result = await delta_client.get_wallet_balance()
        positions_result = await delta_client.get_positions()
        
        total_balance = "0"
        if balance_result.get("result"):
            for bal in balance_result["result"]:
                if bal.get("asset_symbol") == "USDT":
                    total_balance = bal.get("available_balance", "0")
                    break
        
        positions_count = len(positions_result.get("result", []))
        
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
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"delta_credentials": None}}
    )
    return {"message": "Delta Exchange disconnected"}

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
    return {
        "trading_settings": current_user.get("trading_settings", {
            "instruments": ["BTC", "ETH"],
            "trade_futures": True,
            "trade_options": False,
            "contract_quantity": 1,
            "profit_percentage": 75.0,
            "exit_half_position": False
        }),
        "has_delta_credentials": current_user.get("delta_credentials") is not None
    }

@api_router.put("/settings")
async def update_settings(settings: TradingSettings, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"trading_settings": settings.model_dump()}}
    )
    return {"message": "Settings updated successfully", "settings": settings}

# ======================= WEBHOOK ROUTES =======================

@api_router.post("/webhook/tradingview")
async def tradingview_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive TradingView alerts and execute trades"""
    try:
        content_type = request.headers.get("content-type", "")
        raw_body = await request.body()
        body_text = raw_body.decode() if raw_body else ""
        
        logger.info(f"Received TradingView webhook - Content-Type: {content_type}, Body: {body_text}")
        
        # Try to parse as JSON first
        body = {}
        if body_text:
            try:
                body = json.loads(body_text)
                if not isinstance(body, dict):
                    # If it's not a dict (e.g., just a number or string), wrap it
                    body = {"message": str(body)}
            except json.JSONDecodeError:
                # Not JSON, treat as plain text message
                # Try to parse common formats like "BUY BTCUSD" or "BTCUSD BUY"
                parts = body_text.strip().upper().split()
                if len(parts) >= 2:
                    if parts[0] in ["BUY", "SELL", "LONG", "SHORT"]:
                        body = {"action": parts[0], "symbol": parts[1]}
                    elif parts[1] in ["BUY", "SELL", "LONG", "SHORT"]:
                        body = {"symbol": parts[0], "action": parts[1]}
                    else:
                        body = {"message": body_text}
                else:
                    body = {"message": body_text}
    except Exception as e:
        logger.error(f"Error parsing webhook body: {e}")
        body = {}
    
    # Parse alert data with safe defaults
    symbol = "UNKNOWN"
    action = "UNKNOWN"
    price = None
    message = ""
    
    if isinstance(body, dict):
        symbol = str(body.get("symbol", body.get("ticker", "UNKNOWN"))).upper()
        action = str(body.get("action", body.get("strategy.order.action", ""))).upper()
        price = body.get("price", body.get("close"))
        message = str(body.get("message", body.get("comment", "")))
    
    # Normalize action
    if action in ["BUY", "LONG", "ENTRY_LONG"]:
        action = "BUY"
    elif action in ["SELL", "SHORT", "ENTRY_SHORT", "EXIT"]:
        action = "SELL"
    
    # Create alert record
    alert_id = str(uuid.uuid4())
    alert_record = {
        "id": alert_id,
        "symbol": symbol,
        "action": action,
        "price": float(price) if price and str(price).replace('.', '').isdigit() else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "executed": False,
        "execution_result": None,
        "raw_data": body_text
    }
    
    await db.alerts.insert_one(alert_record)
    logger.info(f"Alert saved: {alert_id} - {symbol} {action}")
    
    # INSTANT BROADCAST via WebSocket to all connected clients
    await ws_manager.broadcast_alert(alert_record)
    
    # Execute trades for all users with matching instruments
    if action in ["BUY", "SELL"]:
        background_tasks.add_task(execute_trades_for_alert, alert_record)
    
    return {"status": "received", "alert_id": alert_id, "symbol": symbol, "action": action}

async def execute_trades_for_alert(alert: dict):
    """Background task to execute trades for all subscribed users"""
    symbol = alert["symbol"]
    action = alert["action"]
    
    # Find users with Delta credentials and matching instrument settings
    users = await db.users.find({
        "delta_credentials": {"$ne": None}
    }, {"_id": 0}).to_list(1000)
    
    for user in users:
        settings = user.get("trading_settings", {})
        instruments = settings.get("instruments", [])
        
        # Check if symbol matches user's instruments
        should_trade = False
        for inst in instruments:
            if inst.upper() in symbol:
                should_trade = True
                break
        
        if not should_trade or not settings.get("trade_futures", True):
            continue
        
        try:
            credentials = user["delta_credentials"]
            delta_client = DeltaExchangeClient(
                api_key=credentials["api_key"],
                api_secret=credentials["api_secret"],
                is_testnet=credentials.get("is_testnet", False)
            )
            
            # Get product ID
            products = await delta_client.get_products()
            product_id = None
            for p in products.get("result", []):
                if symbol.replace("USD", "") in p.get("symbol", "") and p.get("product_type") == "perpetual_futures":
                    product_id = p["id"]
                    break
            
            if not product_id:
                logger.warning(f"No matching product found for {symbol}")
                continue
            
            # Calculate quantity
            quantity = settings.get("contract_quantity", 1)
            if settings.get("exit_half_position", False):
                quantity = max(1, int(quantity / 2 + 0.5))
            
            # Place order
            side = "buy" if action == "BUY" else "sell"
            result = await delta_client.place_order(
                product_id=product_id,
                order_type="market_order",
                size=quantity,
                side=side
            )
            
            logger.info(f"Order placed for user {user['id']}: {result}")
            
            # Record trade
            await db.trades.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "alert_id": alert["id"],
                "symbol": symbol,
                "action": action,
                "quantity": quantity,
                "result": result,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to execute trade for user {user['id']}: {e}")

# ======================= ALERTS ROUTES =======================

@api_router.get("/alerts")
async def get_alerts(limit: int = 100, current_user: dict = Depends(get_current_user)):
    alerts = await db.alerts.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
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
async def get_webhook_info():
    """Get webhook URL and format info for TradingView setup"""
    backend_url = os.environ.get('BACKEND_URL', os.environ.get('REACT_APP_BACKEND_URL', ''))
    return {
        "webhook_url": f"{backend_url}/api/webhook/tradingview",
        "format": {
            "symbol": "BTC or ETH",
            "action": "BUY or SELL",
            "price": "optional - current price",
            "message": "optional - custom message"
        },
        "example": {
            "symbol": "BTCUSD",
            "action": "BUY",
            "price": 95000,
            "message": "Long signal from strategy"
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
