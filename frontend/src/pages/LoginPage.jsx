import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Zap, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, register } = useAuth();
    const [loading, setLoading] = useState(false);
    
    // Login form state
    const [loginMobile, setLoginMobile] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    
    // Register form state
    const [regName, setRegName] = useState('');
    const [regMobile, setRegMobile] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [showRegPassword, setShowRegPassword] = useState(false);
    const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginMobile || !loginPassword) {
            toast.error('Please fill all fields');
            return;
        }
        
        setLoading(true);
        try {
            await login(loginMobile, loginPassword);
            toast.success('Welcome back!');
            // Navigate to subscription page first - it will redirect to dashboard if user has active subscription
            navigate('/subscription');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regMobile || !regPassword || !regConfirmPassword) {
            toast.error('Please fill all required fields');
            return;
        }
        
        if (regPassword !== regConfirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        
        if (regPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        
        setLoading(true);
        try {
            await register(regMobile, regPassword, regName);
            toast.success('Account created successfully!');
            // Navigate to subscription page for new users to select a plan
            navigate('/subscription');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left side - Branding */}
            <div className="hidden lg:flex lg:w-1/2 login-bg relative">
                <div className="absolute inset-0 bg-gradient-to-r from-obsidian/90 to-obsidian/50" />
                <div className="relative z-10 flex flex-col justify-center p-12">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-12 h-12 bg-neon-green rounded-md flex items-center justify-center">
                            <Zap className="w-7 h-7 text-black" />
                        </div>
                        <h1 className="logo-text text-3xl text-white uppercase">
                            Wolffs Insta AutoTrade
                        </h1>
                    </div>
                    <p className="text-xl text-gray-300 max-w-md leading-relaxed">
                        Automated crypto trading powered by TradingView signals. 
                        Connect your Delta Exchange account and let the system trade for you.
                    </p>
                    <div className="mt-12 space-y-4">
                        <div className="flex items-center gap-3 text-gray-400">
                            <div className="w-2 h-2 bg-neon-green rounded-full" />
                            <span>TradingView Webhook Integration</span>
                        </div>
                        <div className="flex items-center gap-3 text-gray-400">
                            <div className="w-2 h-2 bg-neon-green rounded-full" />
                            <span>BTC & ETH Futures Trading</span>
                        </div>
                        <div className="flex items-center gap-3 text-gray-400">
                            <div className="w-2 h-2 bg-neon-green rounded-full" />
                            <span>Real-time Alert Notifications</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right side - Auth Forms */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-obsidian">
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
                        <div className="w-10 h-10 bg-neon-green rounded-md flex items-center justify-center">
                            <Zap className="w-6 h-6 text-black" />
                        </div>
                        <h1 className="logo-text text-2xl text-white uppercase">
                            Wolffs AutoTrade
                        </h1>
                    </div>

                    <Card className="bg-surface border-white/10">
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-2xl font-headings text-white uppercase tracking-wide">
                                Welcome
                            </CardTitle>
                            <CardDescription className="text-gray-400">
                                Sign in or create an account to start trading
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="login" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 bg-obsidian">
                                    <TabsTrigger 
                                        value="login"
                                        data-testid="login-tab"
                                        className="data-[state=active]:bg-surface data-[state=active]:text-neon-green"
                                    >
                                        Sign In
                                    </TabsTrigger>
                                    <TabsTrigger 
                                        value="register"
                                        data-testid="register-tab"
                                        className="data-[state=active]:bg-surface data-[state=active]:text-neon-green"
                                    >
                                        Register
                                    </TabsTrigger>
                                </TabsList>

                                {/* Login Tab */}
                                <TabsContent value="login" className="mt-6">
                                    <form onSubmit={handleLogin} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="login-mobile" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Mobile Number
                                            </Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="login-mobile"
                                                    data-testid="login-mobile-input"
                                                    type="tel"
                                                    placeholder="Enter mobile number"
                                                    value={loginMobile}
                                                    onChange={(e) => setLoginMobile(e.target.value)}
                                                    className="input-dark pl-10"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="login-password" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Password
                                            </Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="login-password"
                                                    data-testid="login-password-input"
                                                    type={showLoginPassword ? "text" : "password"}
                                                    placeholder="Enter password"
                                                    value={loginPassword}
                                                    onChange={(e) => setLoginPassword(e.target.value)}
                                                    className="input-dark pl-10 pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                                >
                                                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <Button
                                            type="submit"
                                            data-testid="login-submit-btn"
                                            disabled={loading}
                                            className="w-full btn-primary mt-6"
                                        >
                                            {loading ? 'Signing in...' : 'Sign In'}
                                        </Button>
                                    </form>
                                </TabsContent>

                                {/* Register Tab */}
                                <TabsContent value="register" className="mt-6">
                                    <form onSubmit={handleRegister} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="reg-name" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Name (Optional)
                                            </Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="reg-name"
                                                    data-testid="register-name-input"
                                                    type="text"
                                                    placeholder="Enter your name"
                                                    value={regName}
                                                    onChange={(e) => setRegName(e.target.value)}
                                                    className="input-dark pl-10"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reg-mobile" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Mobile Number *
                                            </Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="reg-mobile"
                                                    data-testid="register-mobile-input"
                                                    type="tel"
                                                    placeholder="Enter mobile number"
                                                    value={regMobile}
                                                    onChange={(e) => setRegMobile(e.target.value)}
                                                    className="input-dark pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reg-password" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Password *
                                            </Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="reg-password"
                                                    data-testid="register-password-input"
                                                    type="password"
                                                    placeholder="Create password (min 6 chars)"
                                                    value={regPassword}
                                                    onChange={(e) => setRegPassword(e.target.value)}
                                                    className="input-dark pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reg-confirm" className="text-gray-300 font-mono text-xs uppercase tracking-wider">
                                                Confirm Password *
                                            </Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <Input
                                                    id="reg-confirm"
                                                    data-testid="register-confirm-input"
                                                    type="password"
                                                    placeholder="Confirm password"
                                                    value={regConfirmPassword}
                                                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                                                    className="input-dark pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="submit"
                                            data-testid="register-submit-btn"
                                            disabled={loading}
                                            className="w-full btn-primary mt-6"
                                        >
                                            {loading ? 'Creating Account...' : 'Create Account'}
                                        </Button>
                                    </form>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    <p className="text-center text-gray-500 text-sm mt-6">
                        By continuing, you agree to our Terms of Service
                    </p>
                </div>
            </div>
        </div>
    );
}
