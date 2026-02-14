import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
    Zap, Settings, LogOut, Bell, Wallet, 
    TrendingUp, TrendingDown, Activity, 
    ChevronRight, RefreshCw, ExternalLink,
    Wifi, WifiOff, Shield, Clock, User, Phone, Calendar
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = API_URL.replace('https://', 'wss://').replace('http://', 'ws://');

export default function DashboardPage() {
    const navigate = useNavigate();
    const { user, logout, refreshUser } = useAuth();
    const [deltaStatus, setDeltaStatus] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const [welcomeConfig, setWelcomeConfig] = useState(null);
    const [wsConnected, setWsConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    // WebSocket connection for real-time alerts
    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(`${WS_URL}/api/ws/alerts`);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            setWsConnected(true);
            // Send heartbeat every 30 seconds
            const heartbeat = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('ping');
                }
            }, 30000);
            ws.heartbeatInterval = heartbeat;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'new_alert') {
                    // Add new alert to the top of the list
                    setAlerts(prev => [data.alert, ...prev]);
                    
                    // Show instant toast notification
                    const alert = data.alert;
                    toast(
                        <div className="flex items-center gap-3">
                            {alert.action === 'BUY' ? (
                                <TrendingUp className="w-5 h-5 text-green-500" />
                            ) : (
                                <TrendingDown className="w-5 h-5 text-red-500" />
                            )}
                            <div>
                                <p className="font-bold">{alert.symbol} {alert.action}</p>
                                {alert.price && <p className="text-sm text-gray-400">${parseFloat(alert.price).toLocaleString()}</p>}
                            </div>
                        </div>,
                        {
                            duration: 5000,
                            style: {
                                background: alert.action === 'BUY' ? 'rgba(0, 255, 148, 0.1)' : 'rgba(255, 59, 48, 0.1)',
                                border: `1px solid ${alert.action === 'BUY' ? 'rgba(0, 255, 148, 0.3)' : 'rgba(255, 59, 48, 0.3)'}`,
                            }
                        }
                    );
                    
                    // Play notification sound (optional)
                    try {
                        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleShCm+LYtWEsMk2R3eLKmVw3P4zesH1+fnx+f4CBg4aJjI+SlZifpq2zub/Fy8/R09TU09LQzcnFv7qynpeMgnd0');
                        audio.volume = 0.3;
                        audio.play().catch(() => {});
                    } catch {}
                }
            } catch (e) {
                console.error('WebSocket message error:', e);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            setWsConnected(false);
            clearInterval(ws.heartbeatInterval);
            // Reconnect after 2 seconds
            reconnectTimeoutRef.current = setTimeout(() => {
                connectWebSocket();
            }, 2000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setWsConnected(false);
        };

        wsRef.current = ws;
    }, []);

    const fetchDeltaStatus = useCallback(async () => {
        try {
            const response = await axios.get(`${API_URL}/api/delta/status`);
            setDeltaStatus(response.data);
        } catch (error) {
            console.error('Failed to fetch delta status:', error);
        }
    }, []);

    const fetchAlerts = useCallback(async () => {
        try {
            const response = await axios.get(`${API_URL}/api/alerts`);
            setAlerts(response.data.alerts || []);
        } catch (error) {
            console.error('Failed to fetch alerts:', error);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchDeltaStatus(), fetchAlerts()]);
        setLoading(false);
    }, [fetchDeltaStatus, fetchAlerts]);

    const fetchWelcomeConfig = useCallback(async () => {
        try {
            const response = await axios.get(`${API_URL}/api/config/welcome`);
            setWelcomeConfig(response.data.welcome);
        } catch (error) {
            console.error('Failed to fetch welcome config:', error);
        }
    }, []);

    useEffect(() => {
        fetchData();
        fetchWelcomeConfig();
        connectWebSocket();
        
        // Check if first login
        const welcomed = localStorage.getItem('welcomed');
        if (!welcomed) {
            setShowWelcome(true);
            localStorage.setItem('welcomed', 'true');
        }
        
        // Cleanup on unmount
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [fetchData, fetchWelcomeConfig, connectWebSocket]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
        toast.success('Data refreshed');
    };

    const handleLogout = () => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        logout();
        navigate('/');
    };

    const dismissWelcome = () => {
        setShowWelcome(false);
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        // Convert to IST (Indian Standard Time - UTC+5:30)
        return date.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        
        // Convert both to IST for comparison
        const istOptions = { timeZone: 'Asia/Kolkata' };
        const dateIST = new Date(date.toLocaleString('en-US', istOptions));
        const todayIST = new Date(now.toLocaleString('en-US', istOptions));
        const yesterdayIST = new Date(todayIST);
        yesterdayIST.setDate(yesterdayIST.getDate() - 1);
        
        const dateStr = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        const todayStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        const yesterdayStr = yesterdayIST.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        
        if (dateStr === todayStr) {
            return 'Today';
        } else if (dateStr === yesterdayStr) {
            return 'Yesterday';
        }
        return date.toLocaleDateString('en-IN', { 
            month: 'short', 
            day: 'numeric',
            timeZone: 'Asia/Kolkata'
        });
    };

    return (
        <div className="min-h-screen bg-obsidian">
            {/* Welcome Modal */}
            {showWelcome && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <Card className="bg-surface border-white/10 max-w-md w-full animate-fade-in">
                        <CardHeader>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-neon-green rounded-md flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-black" />
                                </div>
                                <CardTitle className="text-xl font-headings text-white uppercase">
                                    {welcomeConfig?.title || "Welcome to Wolffs AutoTrade!"}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-gray-300">
                                {welcomeConfig?.description || "Your automated trading dashboard is ready. To get started:"}
                            </p>
                            <ol className="space-y-2 text-gray-400 text-sm">
                                {(welcomeConfig?.steps || [
                                    "Connect your Delta Exchange account in Settings",
                                    "Configure your trading instruments (BTC/ETH)",
                                    "Set up TradingView webhook with the provided URL"
                                ]).map((step, index) => (
                                    <li key={index} className="flex items-start gap-2">
                                        <span className="text-neon-green font-mono">{index + 1}.</span>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                            <Button 
                                onClick={dismissWelcome}
                                data-testid="welcome-dismiss-btn"
                                className="w-full btn-primary"
                            >
                                {welcomeConfig?.button_text || "Got it, Let's Go!"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-white/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-neon-green rounded-md flex items-center justify-center">
                            <Zap className="w-5 h-5 text-black" />
                        </div>
                        <h1 className="logo-text text-xl text-white uppercase hidden sm:block">
                            Wolffs AutoTrade
                        </h1>
                        {/* Live indicator */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${wsConnected ? 'bg-neon-green-dim text-neon-green' : 'bg-neon-red-dim text-neon-red'}`}>
                            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            <span className="font-mono">{wsConnected ? 'LIVE' : 'OFFLINE'}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {user?.is_admin && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/admin')}
                                data-testid="admin-panel-btn"
                                className="text-neon-green border-neon-green/50 hover:bg-neon-green/10 hidden sm:flex"
                            >
                                <Shield className="w-4 h-4 mr-2" />
                                Admin
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            data-testid="refresh-btn"
                            className="text-gray-400 hover:text-white hover:bg-white/10"
                            disabled={refreshing}
                        >
                            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/settings')}
                            data-testid="settings-btn"
                            className="text-gray-400 hover:text-white hover:bg-white/10"
                        >
                            <Settings className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleLogout}
                            data-testid="logout-btn"
                            className="text-gray-400 hover:text-neon-red hover:bg-neon-red/10"
                        >
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1600px] mx-auto p-4 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                    {/* Broker Status Card */}
                    <div className="col-span-12 md:col-span-4 space-y-4">
                        <Card 
                            className="card-dark card-hover cursor-pointer"
                            onClick={() => navigate('/settings')}
                            data-testid="broker-status-card"
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-mono text-gray-500 uppercase tracking-wider">
                                        Crypto Broker Status
                                    </CardTitle>
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`status-indicator ${deltaStatus?.is_connected ? 'status-connected' : 'status-disconnected'}`} />
                                    <span className="text-white font-medium">
                                        Delta Exchange
                                    </span>
                                    <Badge 
                                        variant="outline" 
                                        className={deltaStatus?.is_connected ? 'bg-buy' : 'bg-sell'}
                                    >
                                        {deltaStatus?.is_connected ? 'Connected' : 'Disconnected'}
                                    </Badge>
                                </div>
                                
                                {deltaStatus?.is_connected && (
                                    <div className="space-y-3 pt-3 border-t border-white/10">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                                <Wallet className="w-4 h-4" />
                                                Balance
                                            </span>
                                            <span className="text-white font-mono">
                                                ${parseFloat(deltaStatus.balance || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                                <Activity className="w-4 h-4" />
                                                Open Positions
                                            </span>
                                            <span className="text-white font-mono">
                                                {deltaStatus.positions_count || 0}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                
                                {!deltaStatus?.is_connected && (
                                    <p className="text-gray-500 text-sm mt-2">
                                        Click to connect your Delta Exchange account
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Stocks / MCX / Forex Broker Status */}
                        <Card className="card-dark">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-mono text-gray-500 uppercase tracking-wider">
                                        Stocks / MCX / Forex Brokers Status
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {['Zerodha', 'AngelOne', 'Fyers', 'IIFL', 'Upstox'].map((broker) => (
                                        <div key={broker} className="flex items-center gap-3 opacity-50">
                                            <div className="status-indicator status-disconnected" />
                                            <span className="text-gray-400 text-sm">{broker}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 p-3 bg-obsidian rounded-sm border border-white/10 text-center">
                                    <div className="flex items-center justify-center gap-2 text-neon-green">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-sm font-medium">Coming Soon</span>
                                    </div>
                                    <p className="text-gray-500 text-xs mt-1">
                                        Stock broker integrations in next upgrade
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Trading Settings Quick View */}
                        <Card className="card-dark">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-mono text-gray-500 uppercase tracking-wider">
                                    Trading Config
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Instruments</span>
                                        <div className="flex gap-1">
                                            {(user?.trading_settings?.instruments || ['BTC', 'ETH']).map(inst => (
                                                <Badge key={inst} variant="outline" className="text-xs bg-white/5">
                                                    {inst}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Mode</span>
                                        <span className="text-white text-sm font-mono">
                                            {user?.trading_settings?.trade_futures ? 'Futures' : 'Options'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Contracts</span>
                                        <span className="text-white text-sm font-mono">
                                            {user?.trading_settings?.contract_quantity || 1}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Webhook Info */}
                        <Card className="card-dark">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-mono text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4" />
                                    Webhook URL
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-neon-green bg-obsidian p-2 rounded block break-all">
                                    {API_URL}/api/webhook/tradingview
                                </code>
                                <p className="text-gray-500 text-xs mt-2">
                                    Use this URL in TradingView alerts
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Alerts Window */}
                    <Card 
                        className="col-span-12 md:col-span-8 card-dark cursor-pointer"
                        onClick={() => navigate('/alerts')}
                        data-testid="alerts-card"
                    >
                        <CardHeader className="pb-2 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-mono text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <Bell className="w-4 h-4" />
                                    Trading Alerts
                                    {wsConnected && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green"></span>
                                        </span>
                                    )}
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">
                                        {alerts.length} alerts
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px]">
                                {(() => {
                                    const formatExpiryDate = (dateStr) => {
                                        if (!dateStr) return 'N/A';
                                        const date = new Date(dateStr);
                                        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                                    };

                                    const getPlanDisplayName = (planType) => {
                                        if (planType === 'wolffs_alerts') return 'WolffsInsta Alerts';
                                        if (planType === 'custom_strategy') return 'Custom Strategy';
                                        return planType || 'N/A';
                                    };

                                    return loading ? (
                                    <div className="p-6 space-y-4">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="skeleton h-16 rounded-sm" />
                                        ))}
                                    </div>
                                ) : alerts.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                        <p className="text-gray-500">No alerts yet</p>
                                        <p className="text-gray-600 text-sm mt-1">
                                            Alerts from TradingView will appear here instantly
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {alerts.map((alert, index) => (
                                            <div 
                                                key={alert.id || index}
                                                className="alert-item p-4 hover:bg-white/5"
                                                style={{ animationDelay: `${index * 50}ms` }}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${
                                                            alert.action === 'BUY' 
                                                                ? 'bg-neon-green-dim' 
                                                                : 'bg-neon-red-dim'
                                                        }`}>
                                                            {alert.action === 'BUY' ? (
                                                                <TrendingUp className="w-5 h-5 text-neon-green" />
                                                            ) : (
                                                                <TrendingDown className="w-5 h-5 text-neon-red" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-white font-medium font-mono">
                                                                    {alert.symbol}
                                                                </span>
                                                                <Badge className={alert.action === 'BUY' ? 'bg-buy' : 'bg-sell'}>
                                                                    {alert.action}
                                                                </Badge>
                                                            </div>
                                                            {alert.price && (
                                                                <p className="text-gray-400 text-sm font-mono mt-1">
                                                                    @ ${parseFloat(alert.price).toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-gray-500 text-xs font-mono">
                                                            {formatDate(alert.timestamp)}
                                                        </p>
                                                        <p className="text-gray-400 text-sm font-mono">
                                                            {formatTime(alert.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>
                                                {alert.message && (
                                                    <p className="text-gray-500 text-sm mt-2 pl-13">
                                                        {alert.message}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
