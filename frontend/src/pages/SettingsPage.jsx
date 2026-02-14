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
    Bitcoin, Activity, Copy, Check, Trash2, RefreshCw,
    Users, User, Lock, Key
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    
    // Delta credentials
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [isTestnet, setIsTestnet] = useState(true);
    const [region, setRegion] = useState('global');
    const [showSecret, setShowSecret] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
    
    // Trading settings
    const [instruments, setInstruments] = useState(['BTC', 'ETH']);
    const [tradeFutures, setTradeFutures] = useState(true);
    const [tradeOptions, setTradeOptions] = useState(false);
    const [btcLotSize, setBtcLotSize] = useState(1);
    const [ethLotSize, setEthLotSize] = useState(1);
    const [contractQuantity, setContractQuantity] = useState(1);
    const [profitPercentage, setProfitPercentage] = useState(75);
    const [exitHalfPosition, setExitHalfPosition] = useState(false);
    const [subscriberType, setSubscriberType] = useState('wolffs_alerts');
    const [webhookId, setWebhookId] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);
    
    // Status
    const [deltaStatus, setDeltaStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    
    // Password change
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

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
            setBtcLotSize(settings.btc_lot_size || settings.contract_quantity || 1);
            setEthLotSize(settings.eth_lot_size || settings.contract_quantity || 1);
            setContractQuantity(settings.contract_quantity || 1);
            setProfitPercentage(settings.profit_percentage || 75);
            setExitHalfPosition(settings.exit_half_position || false);
            setSubscriberType(settings.subscriber_type || 'wolffs_alerts');
            setWebhookId(settings.webhook_id || '');
            setHasSavedCredentials(response.data.has_delta_credentials || false);
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
                is_testnet: isTestnet,
                region: region
            });
            toast.success('Delta Exchange connected successfully!');
            setApiKey('');
            setApiSecret('');
            setHasSavedCredentials(true);
            await fetchDeltaStatus();
            await refreshUser();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Connection failed');
        } finally {
            setConnecting(false);
        }
    };

    const handleReconnect = async () => {
        setConnecting(true);
        try {
            await axios.post(`${API_URL}/api/delta/reconnect`);
            toast.success('Reconnected successfully!');
            await fetchDeltaStatus();
            await refreshUser();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Reconnection failed');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await axios.delete(`${API_URL}/api/delta/disconnect`);
            toast.success('Delta Exchange disconnected (credentials saved)');
            await fetchDeltaStatus();
            await refreshUser();
        } catch (error) {
            toast.error('Failed to disconnect');
        }
    };

    const handleClearCredentials = async () => {
        if (!confirm('Are you sure you want to remove saved credentials? You will need to enter them again.')) {
            return;
        }
        try {
            await axios.delete(`${API_URL}/api/delta/clear-credentials`);
            toast.success('Credentials removed');
            setHasSavedCredentials(false);
            await fetchDeltaStatus();
            await refreshUser();
        } catch (error) {
            toast.error('Failed to clear credentials');
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await axios.put(`${API_URL}/api/settings`, {
                instruments,
                trade_futures: tradeFutures,
                trade_options: tradeOptions,
                btc_lot_size: btcLotSize,
                eth_lot_size: ethLotSize,
                contract_quantity: contractQuantity,
                profit_percentage: profitPercentage,
                exit_half_position: exitHalfPosition,
                subscriber_type: subscriberType,
                webhook_id: webhookId
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

    const getWebhookUrl = () => {
        if (subscriberType === 'wolffs_alerts') {
            return `${API_URL}/api/webhook/tradingview`;
        } else {
            return `${API_URL}/api/webhook/user/${webhookId}`;
        }
    };

    const copyWebhook = () => {
        navigator.clipboard.writeText(getWebhookUrl());
        setCopied(true);
        toast.success('Webhook URL copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            toast.error('Please fill all password fields');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }
        
        setChangingPassword(true);
        try {
            await axios.post(`${API_URL}/api/auth/change-password`, {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success('Password changed successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to change password');
        } finally {
            setChangingPassword(false);
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
                
                {/* Subscriber Type Selection */}
                <Card className="card-dark">
                    <CardHeader>
                        <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                            <Users className="w-5 h-5 text-neon-green" />
                            Subscription Type
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            Choose how you want to receive trading alerts
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div 
                                onClick={() => setSubscriberType('wolffs_alerts')}
                                className={`p-4 rounded-sm border cursor-pointer transition-all ${
                                    subscriberType === 'wolffs_alerts' 
                                        ? 'border-neon-green bg-neon-green-dim' 
                                        : 'border-white/10 hover:border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <Users className={`w-5 h-5 ${subscriberType === 'wolffs_alerts' ? 'text-neon-green' : 'text-gray-400'}`} />
                                    <span className={`font-medium ${subscriberType === 'wolffs_alerts' ? 'text-neon-green' : 'text-white'}`}>
                                        WolffsInsta Alerts
                                    </span>
                                </div>
                                <p className="text-gray-500 text-sm">
                                    Receive alerts from WolffsInsta strategies. Trades are executed automatically based on admin signals.
                                </p>
                            </div>
                            
                            <div 
                                onClick={() => setSubscriberType('custom_strategy')}
                                className={`p-4 rounded-sm border cursor-pointer transition-all ${
                                    subscriberType === 'custom_strategy' 
                                        ? 'border-neon-green bg-neon-green-dim' 
                                        : 'border-white/10 hover:border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <User className={`w-5 h-5 ${subscriberType === 'custom_strategy' ? 'text-neon-green' : 'text-gray-400'}`} />
                                    <span className={`font-medium ${subscriberType === 'custom_strategy' ? 'text-neon-green' : 'text-white'}`}>
                                        Custom Strategy
                                    </span>
                                </div>
                                <p className="text-gray-500 text-sm">
                                    Use your own TradingView/Chartink strategies. You get a unique webhook URL for your signals.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

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
                                                Balance: ${parseFloat(deltaStatus.balance || 0).toFixed(2)}
                                            </p>
                                            <p className="text-gray-500 text-xs mt-1">
                                                Open Positions: {deltaStatus.positions_count || 0}
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
                                
                                {/* Connection Info */}
                                <div className="p-3 bg-surface-highlight rounded-sm border border-white/10">
                                    <p className="text-gray-400 text-sm">
                                        <strong className="text-white">Connection Status:</strong> Your API keys are securely saved. 
                                        The connection stays active permanently until you disconnect or revoke keys from Delta Exchange.
                                    </p>
                                    <p className="text-gray-500 text-xs mt-2">
                                        • No need to reconnect daily<br/>
                                        • Keys are encrypted and stored securely<br/>
                                        • Disconnect removes keys from our system
                                    </p>
                                </div>
                            </div>
                        ) : hasSavedCredentials ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-surface-highlight rounded-sm border border-white/10">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-medium">Saved Credentials Found</p>
                                            <p className="text-gray-500 text-sm mt-1">
                                                Your API keys are saved. Click reconnect to restore connection.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleReconnect}
                                                data-testid="reconnect-btn"
                                                disabled={connecting}
                                                className="btn-primary"
                                            >
                                                <RefreshCw className={`w-4 h-4 mr-2 ${connecting ? 'animate-spin' : ''}`} />
                                                {connecting ? 'Reconnecting...' : 'Reconnect'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={handleClearCredentials}
                                                data-testid="clear-credentials-btn"
                                                className="btn-secondary"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* IMPORTANT: Whitelisted IP Notice */}
                                <div className="p-4 bg-neon-green-dim rounded-sm border border-neon-green/30">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 bg-neon-green rounded-md flex items-center justify-center flex-shrink-0">
                                            <Shield className="w-4 h-4 text-black" />
                                        </div>
                                        <div>
                                            <p className="text-neon-green font-medium">Important: Whitelist This IP in Delta Exchange</p>
                                            <p className="text-gray-300 text-sm mt-1">
                                                Before connecting, add this IP to your Delta Exchange API whitelist:
                                            </p>
                                            <div className="mt-2 p-2 bg-obsidian rounded-sm border border-neon-green/20 flex items-center justify-between">
                                                <code className="text-neon-green font-mono text-lg">104.198.214.223</code>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText('104.198.214.223');
                                                        toast.success('IP copied to clipboard!');
                                                    }}
                                                    className="text-neon-green hover:bg-neon-green/10"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            <p className="text-gray-500 text-xs mt-2">
                                                This is a permanent static IP. Add it once during API key creation.
                                            </p>
                                        </div>
                                    </div>
                                </div>

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
                                        Use Testnet (Demo Account)
                                    </Label>
                                </div>

                                {/* Region Selector */}
                                <div className="space-y-2">
                                    <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                        Region (where you created API keys)
                                    </Label>
                                    <div className="flex gap-3">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setRegion('global')}
                                            data-testid="region-global-btn"
                                            className={`flex-1 ${region === 'global' 
                                                ? 'bg-neon-green text-black border-neon-green' 
                                                : 'btn-secondary'}`}
                                        >
                                            Global (testnet.delta.exchange)
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setRegion('india')}
                                            data-testid="region-india-btn"
                                            className={`flex-1 ${region === 'india' 
                                                ? 'bg-neon-green text-black border-neon-green' 
                                                : 'btn-secondary'}`}
                                        >
                                            India (testnet.india.delta.exchange)
                                        </Button>
                                    </div>
                                    <p className="text-gray-500 text-xs">
                                        {isTestnet 
                                            ? (region === 'global' 
                                                ? '→ Will connect to: testnet-api.delta.exchange' 
                                                : '→ Will connect to: cdn-ind.testnet.deltaex.org')
                                            : (region === 'global'
                                                ? '→ Will connect to: api.delta.exchange'
                                                : '→ Will connect to: api.india.delta.exchange')}
                                    </p>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    BTC Lot Size
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={btcLotSize}
                                    onChange={(e) => setBtcLotSize(parseInt(e.target.value) || 1)}
                                    data-testid="btc-lot-input"
                                    className="input-dark"
                                />
                                <p className="text-gray-500 text-xs">
                                    Contracts per BTC trade
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    ETH Lot Size
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={ethLotSize}
                                    onChange={(e) => setEthLotSize(parseInt(e.target.value) || 1)}
                                    data-testid="eth-lot-input"
                                    className="input-dark"
                                />
                                <p className="text-gray-500 text-xs">
                                    Contracts per ETH trade
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
                                    Auto book profit at this % (Phase 1B)
                                </p>
                            </div>
                        </div>

                        <Separator className="bg-white/10" />

                        {/* Exit Strategy */}
                        <div className="flex items-center justify-between p-3 bg-surface-highlight rounded-sm">
                            <div>
                                <p className="text-white">Exit Half Position</p>
                                <p className="text-gray-500 text-sm">Book profit on half, let rest run (Phase 1B)</p>
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

                {/* Change Password */}
                <Card className="card-dark">
                    <CardHeader>
                        <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                            <Key className="w-5 h-5 text-neon-green" />
                            Change Password
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            Update your account password
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                Current Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    type={showCurrentPassword ? "text" : "password"}
                                    placeholder="Enter current password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="input-dark pl-10 pr-10"
                                    data-testid="current-password-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                >
                                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    New Password
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        type={showNewPassword ? "text" : "password"}
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input-dark pl-10 pr-10"
                                        data-testid="new-password-input"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                    >
                                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                    Confirm New Password
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        type={showNewPassword ? "text" : "password"}
                                        placeholder="Confirm new password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        className="input-dark pl-10 pr-10"
                                        data-testid="confirm-new-password-input"
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <Button
                            onClick={handleChangePassword}
                            disabled={changingPassword}
                            className="btn-primary"
                            data-testid="change-password-btn"
                        >
                            <Key className="w-4 h-4 mr-2" />
                            {changingPassword ? 'Changing...' : 'Change Password'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Webhook Info */}
                <Card className="card-dark">
                    <CardHeader>
                        <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                            <ExternalLink className="w-5 h-5 text-neon-green" />
                            {subscriberType === 'wolffs_alerts' ? 'WolffsInsta Webhook' : 'Your Personal Webhook'}
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            {subscriberType === 'wolffs_alerts' 
                                ? 'This webhook is managed by WolffsInsta admin. Alerts are sent automatically.'
                                : 'Use this unique webhook URL in your TradingView/Chartink strategies'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-obsidian rounded-sm border border-white/10">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 overflow-hidden">
                                    <Label className="text-gray-400 text-xs uppercase mb-2 block">Webhook URL</Label>
                                    <code className="text-neon-green font-mono text-sm break-all">
                                        {getWebhookUrl()}
                                    </code>
                                </div>
                                {subscriberType === 'custom_strategy' && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={copyWebhook}
                                        className="flex-shrink-0 btn-secondary"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-neon-green" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {subscriberType === 'custom_strategy' && (
                            <>
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
                            </>
                        )}

                        {subscriberType === 'wolffs_alerts' && (
                            <div className="p-3 bg-surface-highlight rounded-sm border border-white/10">
                                <p className="text-gray-400 text-sm">
                                    <strong className="text-white">Note:</strong> As a WolffsInsta subscriber, you will automatically receive trading signals from our strategies. No webhook setup needed from your side.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
