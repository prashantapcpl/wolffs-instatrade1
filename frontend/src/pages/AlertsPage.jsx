import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
    ArrowLeft, Zap, Bell, TrendingUp, TrendingDown,
    RefreshCw, Filter
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AlertsPage() {
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all'); // all, buy, sell

    useEffect(() => {
        fetchAlerts();
        
        // Auto-refresh every 15 seconds
        const interval = setInterval(fetchAlerts, 15000);
        return () => clearInterval(interval);
    }, []);

    const fetchAlerts = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/alerts?limit=100`);
            setAlerts(response.data.alerts || []);
        } catch (error) {
            console.error('Failed to fetch alerts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchAlerts();
        setRefreshing(false);
        toast.success('Alerts refreshed');
    };

    const filteredAlerts = alerts.filter(alert => {
        if (filter === 'all') return true;
        return alert.action?.toLowerCase() === filter;
    });

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
            hour12: true 
        });
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }
        return date.toLocaleDateString('en-US', { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric' 
        });
    };

    // Group alerts by date
    const groupedAlerts = filteredAlerts.reduce((groups, alert) => {
        const dateKey = formatDate(alert.timestamp);
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(alert);
        return groups;
    }, {});

    return (
        <div className="min-h-screen bg-obsidian">
            {/* Header */}
            <header className="border-b border-white/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/dashboard')}
                            data-testid="back-btn"
                            className="text-gray-400 hover:text-white hover:bg-white/10"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-neon-green rounded-md flex items-center justify-center">
                                <Bell className="w-4 h-4 text-black" />
                            </div>
                            <h1 className="logo-text text-xl text-white uppercase">
                                Trading Alerts
                            </h1>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            data-testid="refresh-alerts-btn"
                            className="text-gray-400 hover:text-white hover:bg-white/10"
                            disabled={refreshing}
                        >
                            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Filter Bar */}
            <div className="border-b border-white/10 bg-surface">
                <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-3">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500 text-sm mr-2">Filter:</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilter('all')}
                            data-testid="filter-all-btn"
                            className={`${filter === 'all' ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                        >
                            All ({alerts.length})
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilter('buy')}
                            data-testid="filter-buy-btn"
                            className={`${filter === 'buy' ? 'bg-neon-green-dim text-neon-green' : 'text-gray-400'}`}
                        >
                            Buy ({alerts.filter(a => a.action === 'BUY').length})
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilter('sell')}
                            data-testid="filter-sell-btn"
                            className={`${filter === 'sell' ? 'bg-neon-red-dim text-neon-red' : 'text-gray-400'}`}
                        >
                            Sell ({alerts.filter(a => a.action === 'SELL').length})
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-[1200px] mx-auto p-4 md:p-6">
                <Card className="card-dark">
                    <ScrollArea className="h-[calc(100vh-240px)]">
                        {loading ? (
                            <div className="p-6 space-y-4">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="skeleton h-20 rounded-sm" />
                                ))}
                            </div>
                        ) : filteredAlerts.length === 0 ? (
                            <div className="p-12 text-center">
                                <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-400 text-lg">No alerts found</p>
                                <p className="text-gray-600 text-sm mt-2">
                                    {filter !== 'all' 
                                        ? `No ${filter.toUpperCase()} alerts yet` 
                                        : 'Alerts from TradingView will appear here'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {Object.entries(groupedAlerts).map(([dateKey, dateAlerts]) => (
                                    <div key={dateKey}>
                                        {/* Date Header */}
                                        <div className="px-4 py-2 bg-surface-highlight sticky top-0 z-10">
                                            <span className="text-gray-500 text-xs font-mono uppercase tracking-wider">
                                                {dateKey}
                                            </span>
                                        </div>
                                        
                                        {/* Alerts for this date */}
                                        {dateAlerts.map((alert, index) => (
                                            <div 
                                                key={alert.id || index}
                                                className="alert-item p-4 hover:bg-white/5"
                                                data-testid={`alert-item-${index}`}
                                                style={{ animationDelay: `${index * 30}ms` }}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0 ${
                                                            alert.action === 'BUY' 
                                                                ? 'bg-neon-green-dim' 
                                                                : 'bg-neon-red-dim'
                                                        }`}>
                                                            {alert.action === 'BUY' ? (
                                                                <TrendingUp className="w-6 h-6 text-neon-green" />
                                                            ) : (
                                                                <TrendingDown className="w-6 h-6 text-neon-red" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-white font-medium font-mono text-lg">
                                                                    {alert.symbol}
                                                                </span>
                                                                <Badge className={`${alert.action === 'BUY' ? 'bg-buy' : 'bg-sell'} text-xs`}>
                                                                    {alert.action}
                                                                </Badge>
                                                                {alert.executed && (
                                                                    <Badge variant="outline" className="text-xs bg-white/5 text-gray-400">
                                                                        Executed
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {alert.price && (
                                                                <p className="text-gray-300 font-mono mt-1">
                                                                    Price: <span className="text-white">${parseFloat(alert.price).toLocaleString()}</span>
                                                                </p>
                                                            )}
                                                            {alert.message && (
                                                                <p className="text-gray-500 text-sm mt-1">
                                                                    {alert.message}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-white font-mono text-sm">
                                                            {formatTime(alert.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </Card>
            </main>
        </div>
    );
}
