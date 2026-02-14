import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
    Zap, Users, User, Check, X, Clock, Crown,
    ArrowRight, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const { user, refreshUser, logout } = useAuth();
    const [plans, setPlans] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [processing, setProcessing] = useState(false);

    const subscription = user?.subscription || {};
    const hasActiveSubscription = subscription.status === 'active' || subscription.status === 'trial';
    const currentPlan = subscription.plan_type;

    useEffect(() => {
        fetchPlans();
    }, []);

    // Auto-redirect to dashboard if user has active subscription
    useEffect(() => {
        if (!loading && hasActiveSubscription && currentPlan) {
            // Check if subscription is not expired
            if (subscription.expiry_date) {
                const expiry = new Date(subscription.expiry_date);
                if (expiry > new Date()) {
                    // Give user a moment to see the page, then redirect
                    // Or they can click "Enter App" button
                }
            }
        }
    }, [loading, hasActiveSubscription, currentPlan, subscription.expiry_date]);

    const fetchPlans = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/plans`);
            setPlans(response.data.plans || {});
        } catch (error) {
            console.error('Failed to fetch plans:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlanClick = (planType) => {
        // If user has active subscription for this plan, go to dashboard
        if (hasActiveSubscription && currentPlan === planType) {
            navigate('/dashboard');
            return;
        }
        
        // If user has active subscription for different plan, show upgrade message
        if (hasActiveSubscription && currentPlan !== planType) {
            setSelectedPlan(planType);
            setShowModal(true);
            return;
        }
        
        // No subscription - show plan details
        setSelectedPlan(planType);
        setShowModal(true);
    };

    const handleStartTrial = async () => {
        setProcessing(true);
        try {
            await axios.post(`${API_URL}/api/subscription/start-trial?plan_type=${selectedPlan}`);
            toast.success('Free trial started! Enjoy 2 days of premium access.');
            await refreshUser();
            setShowModal(false);
            navigate('/dashboard');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to start trial');
        } finally {
            setProcessing(false);
        }
    };

    const formatExpiry = (expiryDate) => {
        if (!expiryDate) return '';
        const date = new Date(expiryDate);
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return 'Expired';
        if (diffDays === 0) return 'Expires today';
        if (diffDays === 1) return 'Expires tomorrow';
        return `${diffDays} days remaining`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        });
    };

    const selectedPlanConfig = selectedPlan ? plans[selectedPlan] : null;

    return (
        <div className="min-h-screen bg-obsidian">
            {/* Modal for Plan Details */}
            {showModal && selectedPlanConfig && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <Card className="bg-surface border-white/10 max-w-lg w-full animate-fade-in max-h-[90vh] overflow-y-auto">
                        <CardHeader className="border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {selectedPlan === 'wolffs_alerts' ? (
                                        <Users className="w-6 h-6 text-neon-green" />
                                    ) : (
                                        <User className="w-6 h-6 text-neon-green" />
                                    )}
                                    <CardTitle className="text-xl font-headings text-white uppercase">
                                        {selectedPlanConfig.name}
                                    </CardTitle>
                                </div>
                                <button 
                                    onClick={() => setShowModal(false)}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <p className="text-gray-300">{selectedPlanConfig.description}</p>
                            
                            {/* Features */}
                            <div className="space-y-3">
                                <h4 className="text-white font-medium">What's Included:</h4>
                                <ul className="space-y-2">
                                    {selectedPlanConfig.features?.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-gray-400">
                                            <Check className="w-4 h-4 text-neon-green mt-0.5 flex-shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            
                            {/* Pricing */}
                            <div className="p-4 bg-obsidian rounded-sm border border-white/10">
                                <div className="flex items-end gap-2 mb-2">
                                    <span className="text-3xl font-bold text-white">
                                        ₹{selectedPlanConfig.price?.toLocaleString()}
                                    </span>
                                    <span className="text-gray-500 mb-1">
                                        /{selectedPlanConfig.duration_days} days
                                    </span>
                                </div>
                                {selectedPlanConfig.discount_percent > 0 && (
                                    <Badge className="bg-neon-green-dim text-neon-green">
                                        {selectedPlanConfig.discount_percent}% OFF
                                    </Badge>
                                )}
                            </div>
                            
                            {/* Trial Info */}
                            <div className="p-4 bg-neon-green-dim rounded-sm border border-neon-green/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-5 h-5 text-neon-green" />
                                    <span className="text-neon-green font-medium">Free Trial Available!</span>
                                </div>
                                <p className="text-gray-300 text-sm">
                                    Try {selectedPlanConfig.trial_days} days free. No payment required now.
                                </p>
                            </div>

                            {/* If user already has different subscription */}
                            {hasActiveSubscription && currentPlan !== selectedPlan && (
                                <div className="p-4 bg-neon-red-dim rounded-sm border border-neon-red/20">
                                    <p className="text-neon-red text-sm">
                                        You currently have an active {currentPlan === 'wolffs_alerts' ? 'WolffsInsta Alerts' : 'Custom Strategy'} subscription. 
                                        Starting this plan will replace your current subscription.
                                    </p>
                                </div>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleStartTrial}
                                    disabled={processing}
                                    className="flex-1 btn-primary"
                                    data-testid="start-trial-btn"
                                >
                                    {processing ? 'Processing...' : 'Start Free Trial'}
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                            
                            <p className="text-center text-gray-500 text-xs">
                                Payment gateway coming soon. For now, enjoy free trial!
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-white/10 bg-surface/50 backdrop-blur-sm">
                <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-neon-green rounded-md flex items-center justify-center">
                            <Zap className="w-5 h-5 text-black" />
                        </div>
                        <h1 className="logo-text text-xl text-white uppercase">
                            Wolffs Insta AutoTrade
                        </h1>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={logout}
                        className="text-gray-400 hover:text-white"
                    >
                        Logout
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1200px] mx-auto p-4 md:p-6">
                {/* Welcome & Status */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl md:text-3xl font-headings text-white uppercase mb-2">
                        Welcome{user?.name ? `, ${user.name}` : ''}!
                    </h2>
                    
                    {hasActiveSubscription && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface rounded-full border border-white/10 mt-4">
                            <Crown className="w-4 h-4 text-neon-green" />
                            <span className="text-gray-300">
                                {currentPlan === 'wolffs_alerts' ? 'WolffsInsta Alerts' : 'Custom Strategy'}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatExpiry(subscription.expiry_date)}
                            </span>
                            {subscription.is_trial && (
                                <Badge variant="outline" className="text-xs bg-neon-green-dim text-neon-green">
                                    Trial
                                </Badge>
                            )}
                        </div>
                    )}
                    
                    {!hasActiveSubscription && (
                        <p className="text-gray-400 mt-2">
                            Choose your subscription plan to start automated trading
                        </p>
                    )}
                </div>

                {/* Plan Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {/* WolffsInsta Alerts */}
                    <Card 
                        className={`card-dark cursor-pointer transition-all hover:border-neon-green/50 ${
                            currentPlan === 'wolffs_alerts' && hasActiveSubscription 
                                ? 'border-neon-green ring-1 ring-neon-green/30' 
                                : ''
                        }`}
                        onClick={() => handlePlanClick('wolffs_alerts')}
                        data-testid="wolffs-alerts-plan"
                    >
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-neon-green-dim rounded-md flex items-center justify-center">
                                        <Users className="w-6 h-6 text-neon-green" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-headings text-white uppercase">
                                            WolffsInsta Alerts
                                        </CardTitle>
                                        <p className="text-gray-500 text-sm">Premium Signals</p>
                                    </div>
                                </div>
                                {currentPlan === 'wolffs_alerts' && hasActiveSubscription && (
                                    <Badge className="bg-buy">Active</Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-gray-400 text-sm mb-4">
                                {plans.wolffs_alerts?.description || 'Get premium trading signals from WolffsInsta expert strategies.'}
                            </p>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold text-white">
                                        ₹{plans.wolffs_alerts?.price?.toLocaleString() || '2,999'}
                                    </span>
                                    <span className="text-gray-500 text-sm">/month</span>
                                </div>
                                <Button 
                                    variant="outline" 
                                    className={currentPlan === 'wolffs_alerts' && hasActiveSubscription 
                                        ? 'btn-primary' 
                                        : 'btn-secondary'}
                                >
                                    {currentPlan === 'wolffs_alerts' && hasActiveSubscription 
                                        ? 'Enter App' 
                                        : hasActiveSubscription 
                                            ? 'Subscribed' 
                                            : 'Select'}
                                    <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Custom Strategy */}
                    <Card 
                        className={`card-dark cursor-pointer transition-all hover:border-neon-green/50 ${
                            currentPlan === 'custom_strategy' && hasActiveSubscription 
                                ? 'border-neon-green ring-1 ring-neon-green/30' 
                                : ''
                        }`}
                        onClick={() => handlePlanClick('custom_strategy')}
                        data-testid="custom-strategy-plan"
                    >
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-neon-green-dim rounded-md flex items-center justify-center">
                                        <User className="w-6 h-6 text-neon-green" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-headings text-white uppercase">
                                            Custom Strategy
                                        </CardTitle>
                                        <p className="text-gray-500 text-sm">Your Own Signals</p>
                                    </div>
                                </div>
                                {currentPlan === 'custom_strategy' && hasActiveSubscription && (
                                    <Badge className="bg-buy">Active</Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-gray-400 text-sm mb-4">
                                {plans.custom_strategy?.description || 'Deploy your own TradingView or Chartink strategies.'}
                            </p>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold text-white">
                                        ₹{plans.custom_strategy?.price?.toLocaleString() || '1,999'}
                                    </span>
                                    <span className="text-gray-500 text-sm">/month</span>
                                </div>
                                <Button 
                                    variant="outline" 
                                    className={currentPlan === 'custom_strategy' && hasActiveSubscription 
                                        ? 'btn-primary' 
                                        : 'btn-secondary'}
                                >
                                    {currentPlan === 'custom_strategy' && hasActiveSubscription 
                                        ? 'Enter App' 
                                        : hasActiveSubscription 
                                            ? 'Subscribed' 
                                            : 'Select'}
                                    <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Subscription Details */}
                {hasActiveSubscription && (
                    <div className="mt-8 max-w-4xl mx-auto">
                        <Card className="card-dark">
                            <CardContent className="p-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-white font-medium mb-1">Your Subscription</h3>
                                        <p className="text-gray-400 text-sm">
                                            {subscription.is_trial ? 'Trial' : 'Active'} • Expires on {formatDate(subscription.expiry_date)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-neon-green font-mono text-lg">
                                            {formatExpiry(subscription.expiry_date)}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    );
}
