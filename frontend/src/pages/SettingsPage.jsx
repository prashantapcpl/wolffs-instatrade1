import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { 
    ArrowLeft, Zap, Link2, Unlink, Save, 
    ExternalLink, PlayCircle, Eye, EyeOff,
    Bitcoin, Activity
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    
    // Delta credentials
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [isTestnet, setIsTestnet] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [connecting, setConnecting] = useState(false);
    
    // Trading settings
    const [instruments, setInstruments] = useState(['BTC', 'ETH']);
    const [tradeFutures, setTradeFutures] = useState(true);
    const [tradeOptions, setTradeOptions] = useState(false);
    const [contractQuantity, setContractQuantity] = useState(1);
    const [profitPercentage, setProfitPercentage] = useState(75);
    const [exitHalfPosition, setExitHalfPosition] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    
    // Status
    const [deltaStatus, setDeltaStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSettings();
        fetchDeltaStatus();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/settings`);
            const settings = response.data.trading_settings || {};
            setInstruments(settings.instruments || ['BTC', 'ETH']);
            setTradeFutures(settings.trade_futures !== false);
            setTradeOptions(settings.trade_options || false);
            setContractQuantity(settings.contract_quantity || 1);
            setProfitPercentage(settings.profit_percentage || 75);
            setExitHalfPosition(settings.exit_half_position || false);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDeltaStatus = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/delta/status`);
            setDeltaStatus(response.data);
        } catch (error) {
            console.error('Failed to fetch delta status:', error);
        }
    };

    const handleConnect = async () => {
        if (!apiKey || !apiSecret) {
            toast.error('Please enter API Key and Secret');
            return;
        }
        
        setConnecting(true);
        try {
            await axios.post(`${API_URL}/api/delta/connect`, {
                api_key: apiKey,
                api_secret: apiSecret,
                is_testnet: isTestnet
            });
            toast.success('Delta Exchange connected successfully!');
            setApiKey('');
            setApiSecret('');
            await fetchDeltaStatus();
            await refreshUser();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Connection failed');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await axios.delete(`${API_URL}/api/delta/disconnect`);
            toast.success('Delta Exchange disconnected');
            setDeltaStatus(null);
            await refreshUser();
        } catch (error) {
            toast.error('Failed to disconnect');
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await axios.put(`${API_URL}/api/settings`, {
                instruments,
                trade_futures: tradeFutures,
                trade_options: tradeOptions,
                contract_quantity: contractQuantity,
                profit_percentage: profitPercentage,
                exit_half_position: exitHalfPosition
            });
            toast.success('Settings saved successfully!');
            await refreshUser();
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    const toggleInstrument = (inst) => {
        if (instruments.includes(inst)) {
            if (instruments.length > 1) {
                setInstruments(instruments.filter(i => i !== inst));
            }
        } else {
            setInstruments([...instruments, inst]);
        }
    };

    return (
        <div className="min-h-screen bg-obsidian">
            {/* Header */}
            <header className="border-b border-white/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 flex items-center gap-4">
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
                            <Zap className="w-4 h-4 text-black" />
                        </div>
                        <h1 className="logo-text text-xl text-white uppercase">
                            Settings
                        </h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1200px] mx-auto p-4 md:p-6 space-y-6">
                {/* Delta Exchange Connection */}
                <Card className="card-dark">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                                    <Link2 className="w-5 h-5 text-neon-green" />
                                    Delta Exchange Connection
                                </CardTitle>
                                <CardDescription className="text-gray-500 mt-1">
                                    Connect your Delta Exchange account to enable auto-trading
                                </CardDescription>
                            </div>
                            {deltaStatus?.is_connected && (
                                <Badge className="bg-buy">Connected</Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {deltaStatus?.is_connected ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-neon-green-dim rounded-sm border border-neon-green/20">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-neon-green font-medium">Account Connected</p>
                                            <p className="text-gray-400 text-sm mt-1">
                                                Balance: ${parseFloat(deltaStatus.balance || 0).toFixed(2)} USDT
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={handleDisconnect}
                                            data-testid="disconnect-btn"
                                            className="btn-destructive"
                                        >
                                            <Unlink className="w-4 h-4 mr-2" />
                                            Disconnect
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                            API Key
                                        </Label>
                                        <Input
                                            data-testid="api-key-input"
                                            type="text"
                                            placeholder="Enter your API Key"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            className="input-dark font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                            API Secret
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                data-testid="api-secret-input"
                                                type={showSecret ? 'text' : 'password'}
                                                placeholder="Enter your API Secret"
                                                value={apiSecret}
                                                onChange={(e) => setApiSecret(e.target.value)}
                                                className="input-dark font-mono pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowSecret(!showSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                            >
                                                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <Switch
                                        id="testnet"
                                        checked={isTestnet}
                                        onCheckedChange={setIsTestnet}
                                        data-testid="testnet-switch"
                                    />
                                    <Label htmlFor="testnet" className="text-gray-300">
                                        Use Testnet (for testing)
                                    </Label>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    <Button
                                        onClick={handleConnect}
                                        data-testid="connect-btn"
                                        disabled={connecting}
                                        className="btn-primary"
                                    >
                                        {connecting ? 'Connecting...' : 'Connect Account'}
                                    </Button>
                                    <a 
                                        href="https://www.delta.exchange/app/account/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-neon-green text-sm flex items-center gap-1 hover:underline"
                                    >
                                        Get API Keys <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>

                                {/* Help Video */}
                                <div className="p-4 bg-surface-highlight rounded-sm border border-white/10">
                                    <div className="flex items-center gap-3">
                                        <PlayCircle className="w-8 h-8 text-neon-green" />
                                        <div>
                                            <p className="text-white font-medium">Need Help?</p>
                                            <a 
                                                href="https://www.youtube.com/watch?v=delta-exchange-api-setup"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-gray-400 text-sm hover:text-neon-green"
                                            >
                                                Watch: How to create Delta Exchange API Keys
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Trading Settings */}
                <Card className="card-dark">
                    <CardHeader>
                        <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                            <Activity className="w-5 h-5 text-neon-green" />
                            Trading Settings
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            Configure your trading preferences and risk management
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Instruments */}
                        <div className="space-y-3">
                            <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                Trading Instruments
                            </Label>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => toggleInstrument('BTC')}
                                    data-testid="btc-toggle"
                                    className={`${instruments.includes('BTC') 
                                        ? 'bg-neon-green text-black border-neon-green' 
                                        : 'btn-secondary'}`}
                                >
                                    <Bitcoin className="w-4 h-4 mr-2" />
                                    BTC
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => toggleInstrument('ETH')}
                                    data-testid="eth-toggle"
                                    className={`${instruments.includes('ETH') 
                                        ? 'bg-neon-green text-black border-neon-green' 
                                        : 'btn-secondary'}`}
                                >
                                    ETH
                                </Button>
                            </div>
                        </div>

                        <Separator className="bg-white/10" />

                        {/* Trading Mode */}
                        <div className="space-y-3">
                            <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                Trading Mode
                            </Label>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-surface-highlight rounded-sm">
                                    <div>
                                        <p className="text-white">Futures Trading</p>
                                        <p className="text-gray-500 text-sm">Trade perpetual futures contracts</p>
                                    </div>
                                    <Switch
                                        checked={tradeFutures}
                                        onCheckedChange={setTradeFutures}
                                        data-testid="futures-switch"
                                    />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-surface-highlight rounded-sm opacity-50">
                                    <div>
                                        <p className="text-white">Options Trading</p>
                                        <p className="text-gray-500 text-sm">Coming in Phase 1B</p>
                                    </div>
                                    <Switch
                                        checked={tradeOptions}
                                        onCheckedChange={setTradeOptions}
                                        disabled
                                        data-testid="options-switch"
                                    />
                                </div>
                            </div>
                        </div>

                        <Separator className="bg-white/10" />

                        {/* Contract Quantity */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    Contract Quantity
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={contractQuantity}
                                    onChange={(e) => setContractQuantity(parseInt(e.target.value) || 1)}
                                    data-testid="quantity-input"
                                    className="input-dark"
                                />
                                <p className="text-gray-500 text-xs">
                                    Number of contracts per trade
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    Profit Target (%)
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="500"
                                    value={profitPercentage}
                                    onChange={(e) => setProfitPercentage(parseInt(e.target.value) || 75)}
                                    data-testid="profit-input"
                                    className="input-dark"
                                />
                                <p className="text-gray-500 text-xs">
                                    Auto book profit at this percentage
                                </p>
                            </div>
                        </div>

                        <Separator className="bg-white/10" />

                        {/* Exit Strategy */}
                        <div className="flex items-center justify-between p-3 bg-surface-highlight rounded-sm">
                            <div>
                                <p className="text-white">Exit Half Position</p>
                                <p className="text-gray-500 text-sm">Book profit on half, let rest run</p>
                            </div>
                            <Switch
                                checked={exitHalfPosition}
                                onCheckedChange={setExitHalfPosition}
                                data-testid="half-exit-switch"
                            />
                        </div>

                        {/* Save Button */}
                        <Button
                            onClick={handleSaveSettings}
                            data-testid="save-settings-btn"
                            disabled={savingSettings}
                            className="btn-primary w-full md:w-auto"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {savingSettings ? 'Saving...' : 'Save Settings'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Webhook Info */}
                <Card className="card-dark">
                    <CardHeader>
                        <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                            <ExternalLink className="w-5 h-5 text-neon-green" />
                            TradingView Webhook Setup
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            Use this webhook URL in your TradingView alerts
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-obsidian rounded-sm border border-white/10">
                            <Label className="text-gray-400 text-xs uppercase mb-2 block">Webhook URL</Label>
                            <code className="text-neon-green font-mono text-sm break-all">
                                {API_URL}/api/webhook/tradingview
                            </code>
                        </div>
                        
                        <div className="p-4 bg-obsidian rounded-sm border border-white/10">
                            <Label className="text-gray-400 text-xs uppercase mb-2 block">Alert Message Format (JSON)</Label>
                            <pre className="text-gray-300 font-mono text-xs overflow-x-auto">
{`{
  "symbol": "BTCUSD",
  "action": "BUY",
  "price": {{close}},
  "message": "Long signal"
}`}
                            </pre>
                        </div>

                        <p className="text-gray-500 text-sm">
                            <strong className="text-gray-300">Tip:</strong> Use <code className="text-neon-green">{"{{close}}"}</code> to include the candle close price in your alert.
                        </p>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
