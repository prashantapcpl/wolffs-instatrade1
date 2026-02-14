import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Textarea } from '../components/ui/textarea';
import { 
    ArrowLeft, Zap, Users, Settings, Save, 
    Plus, Clock, Crown, Search, RefreshCw, Trash2, MessageSquare, X
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [plans, setPlans] = useState({});
    const [welcomeConfig, setWelcomeConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [extendDays, setExtendDays] = useState(7);
    const [savingPlans, setSavingPlans] = useState(false);
    const [savingWelcome, setSavingWelcome] = useState(false);

    useEffect(() => {
        if (!user?.is_admin) {
            navigate('/subscription');
            return;
        }
        fetchData();
    }, [user, navigate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, plansRes, welcomeRes] = await Promise.all([
                axios.get(`${API_URL}/api/admin/users`),
                axios.get(`${API_URL}/api/admin/plans`),
                axios.get(`${API_URL}/api/admin/welcome`).catch(() => ({ data: { welcome: {} } }))
            ]);
            setUsers(usersRes.data.users || []);
            setPlans(plansRes.data.plans || {});
            setWelcomeConfig(welcomeRes.data.welcome || {});
        } catch (error) {
            console.error('Failed to fetch data:', error);
            if (error.response?.status === 403) {
                toast.error('Admin access required');
                navigate('/subscription');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleExtendSubscription = async (userId) => {
        try {
            await axios.put(`${API_URL}/api/admin/user/${userId}/extend?days=${extendDays}`);
            toast.success(`Subscription extended by ${extendDays} days`);
            await fetchData();
            setSelectedUser(null);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to extend subscription');
        }
    };

    const handleActivatePlan = async (userId, planType, days) => {
        try {
            await axios.put(`${API_URL}/api/admin/user/${userId}/subscription?plan_type=${planType}&days=${days}&status=active`);
            toast.success('Subscription activated');
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to activate subscription');
        }
    };

    const handleSavePlans = async () => {
        setSavingPlans(true);
        try {
            await axios.put(`${API_URL}/api/admin/plans`, plans);
            toast.success('Plan configurations saved');
        } catch (error) {
            toast.error('Failed to save plans');
        } finally {
            setSavingPlans(false);
        }
    };

    const handleSaveWelcome = async () => {
        setSavingWelcome(true);
        try {
            await axios.put(`${API_URL}/api/admin/welcome`, welcomeConfig);
            toast.success('Welcome message saved');
        } catch (error) {
            toast.error('Failed to save welcome message');
        } finally {
            setSavingWelcome(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            await axios.delete(`${API_URL}/api/admin/user/${userId}`);
            toast.success('User deleted successfully');
            setUserToDelete(null);
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to delete user');
        }
    };

    const updateWelcomeField = (field, value) => {
        setWelcomeConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const updatePlanField = (planType, field, value) => {
        setPlans(prev => ({
            ...prev,
            [planType]: {
                ...prev[planType],
                [field]: value
            }
        }));
    };

    const filteredUsers = users.filter(u => 
        u.mobile?.includes(searchTerm) || 
        u.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        });
    };

    const getStatusBadge = (subscription) => {
        if (!subscription?.status) return <Badge variant="outline" className="bg-white/5">Inactive</Badge>;
        
        switch (subscription.status) {
            case 'active':
                return <Badge className="bg-buy">Active</Badge>;
            case 'trial':
                return <Badge className="bg-neon-green-dim text-neon-green">Trial</Badge>;
            case 'expired':
                return <Badge className="bg-sell">Expired</Badge>;
            default:
                return <Badge variant="outline" className="bg-white/5">Inactive</Badge>;
        }
    };

    if (!user?.is_admin) {
        return null;
    }

    return (
        <div className="min-h-screen bg-obsidian">
            {/* Extend Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <Card className="bg-surface border-white/10 max-w-md w-full">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">
                                Extend Subscription
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-gray-400">
                                Extend subscription for <strong className="text-white">{selectedUser.name || selectedUser.mobile}</strong>
                            </p>
                            <div className="space-y-2">
                                <Label className="text-gray-300">Days to Add</Label>
                                <Input
                                    type="number"
                                    value={extendDays}
                                    onChange={(e) => setExtendDays(parseInt(e.target.value) || 0)}
                                    className="input-dark"
                                    min="1"
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => handleExtendSubscription(selectedUser.id)}
                                    className="btn-primary flex-1"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Extend
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedUser(null)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {userToDelete && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <Card className="bg-surface border-white/10 max-w-md w-full">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg text-neon-red flex items-center gap-2">
                                    <Trash2 className="w-5 h-5" />
                                    Delete User
                                </CardTitle>
                                <button onClick={() => setUserToDelete(null)} className="text-gray-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-gray-400">
                                Are you sure you want to delete <strong className="text-white">{userToDelete.name || userToDelete.mobile}</strong>?
                            </p>
                            <p className="text-neon-red text-sm">
                                This action cannot be undone. All user data, alerts, and trades will be permanently deleted.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => handleDeleteUser(userToDelete.id)}
                                    className="flex-1 bg-neon-red hover:bg-neon-red/80 text-white"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete User
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setUserToDelete(null)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-white/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/subscription')}
                        className="text-gray-400 hover:text-white hover:bg-white/10"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-neon-green rounded-md flex items-center justify-center">
                            <Crown className="w-4 h-4 text-black" />
                        </div>
                        <h1 className="logo-text text-xl text-white uppercase">
                            Admin Panel
                        </h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="card-dark">
                        <CardContent className="p-4">
                            <p className="text-gray-500 text-sm">Total Users</p>
                            <p className="text-2xl font-bold text-white">{users.length}</p>
                        </CardContent>
                    </Card>
                    <Card className="card-dark">
                        <CardContent className="p-4">
                            <p className="text-gray-500 text-sm">Active Subscriptions</p>
                            <p className="text-2xl font-bold text-neon-green">
                                {users.filter(u => ['active', 'trial'].includes(u.subscription?.status)).length}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="card-dark">
                        <CardContent className="p-4">
                            <p className="text-gray-500 text-sm">WolffsInsta Users</p>
                            <p className="text-2xl font-bold text-white">
                                {users.filter(u => u.subscription?.plan_type === 'wolffs_alerts').length}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="card-dark">
                        <CardContent className="p-4">
                            <p className="text-gray-500 text-sm">Custom Strategy Users</p>
                            <p className="text-2xl font-bold text-white">
                                {users.filter(u => u.subscription?.plan_type === 'custom_strategy').length}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Users List */}
                    <Card className="card-dark lg:col-span-2">
                        <CardHeader className="border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                                    <Users className="w-5 h-5 text-neon-green" />
                                    Users
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={fetchData}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                            <div className="relative mt-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    placeholder="Search by mobile or name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="input-dark pl-10"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px]">
                                {loading ? (
                                    <div className="p-6 space-y-4">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="skeleton h-16 rounded-sm" />
                                        ))}
                                    </div>
                                ) : filteredUsers.length === 0 ? (
                                    <div className="p-12 text-center text-gray-500">
                                        No users found
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {filteredUsers.map((u) => (
                                            <div key={u.id} className="p-4 hover:bg-white/5">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-white font-medium">
                                                                {u.name || 'No Name'}
                                                            </span>
                                                            {u.is_admin && (
                                                                <Badge className="bg-neon-green text-black text-xs">Admin</Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-gray-500 text-sm font-mono">{u.mobile}</p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {getStatusBadge(u.subscription)}
                                                            {u.subscription?.plan_type && (
                                                                <Badge variant="outline" className="text-xs bg-white/5">
                                                                    {u.subscription.plan_type === 'wolffs_alerts' ? 'WolffsInsta' : 'Custom'}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {u.subscription?.expiry_date && (
                                                            <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                Expires: {formatDate(u.subscription.expiry_date)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setSelectedUser(u)}
                                                            className="btn-secondary text-xs"
                                                        >
                                                            <Plus className="w-3 h-3 mr-1" />
                                                            Extend
                                                        </Button>
                                                        {!u.subscription?.status || u.subscription?.status === 'inactive' ? (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleActivatePlan(u.id, 'wolffs_alerts', 30)}
                                                                className="btn-primary text-xs"
                                                            >
                                                                Activate
                                                            </Button>
                                                        ) : null}
                                                        {!u.is_admin && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setUserToDelete(u)}
                                                                className="text-xs text-neon-red border-neon-red/30 hover:bg-neon-red/10"
                                                            >
                                                                <Trash2 className="w-3 h-3 mr-1" />
                                                                Delete
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Plan Configuration */}
                    <Card className="card-dark">
                        <CardHeader className="border-b border-white/10">
                            <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                                <Settings className="w-5 h-5 text-neon-green" />
                                Plan Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-6">
                            {/* WolffsInsta Plan */}
                            <div className="space-y-3">
                                <h4 className="text-white font-medium">WolffsInsta Alerts</h4>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Description</Label>
                                    <Textarea
                                        value={plans.wolffs_alerts?.description || ''}
                                        onChange={(e) => updatePlanField('wolffs_alerts', 'description', e.target.value)}
                                        className="input-dark min-h-[60px] text-sm"
                                        placeholder="Plan description..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Price (INR)</Label>
                                    <Input
                                        type="number"
                                        value={plans.wolffs_alerts?.price || 0}
                                        onChange={(e) => updatePlanField('wolffs_alerts', 'price', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Trial Days</Label>
                                    <Input
                                        type="number"
                                        value={plans.wolffs_alerts?.trial_days || 2}
                                        onChange={(e) => updatePlanField('wolffs_alerts', 'trial_days', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Discount %</Label>
                                    <Input
                                        type="number"
                                        value={plans.wolffs_alerts?.discount_percent || 0}
                                        onChange={(e) => updatePlanField('wolffs_alerts', 'discount_percent', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                            </div>

                            {/* Custom Strategy Plan */}
                            <div className="space-y-3">
                                <h4 className="text-white font-medium">Custom Strategy</h4>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Price (INR)</Label>
                                    <Input
                                        type="number"
                                        value={plans.custom_strategy?.price || 0}
                                        onChange={(e) => updatePlanField('custom_strategy', 'price', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Trial Days</Label>
                                    <Input
                                        type="number"
                                        value={plans.custom_strategy?.trial_days || 2}
                                        onChange={(e) => updatePlanField('custom_strategy', 'trial_days', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Discount %</Label>
                                    <Input
                                        type="number"
                                        value={plans.custom_strategy?.discount_percent || 0}
                                        onChange={(e) => updatePlanField('custom_strategy', 'discount_percent', parseInt(e.target.value))}
                                        className="input-dark"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={handleSavePlans}
                                disabled={savingPlans}
                                className="btn-primary w-full"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {savingPlans ? 'Saving...' : 'Save Plan Settings'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Welcome Message Configuration */}
                    <Card className="card-dark lg:col-span-3">
                        <CardHeader className="border-b border-white/10">
                            <CardTitle className="text-lg font-headings text-white uppercase flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-neon-green" />
                                Welcome Message Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Welcome Title</Label>
                                    <Input
                                        value={welcomeConfig.title || ''}
                                        onChange={(e) => updateWelcomeField('title', e.target.value)}
                                        className="input-dark"
                                        placeholder="Welcome to Wolffs AutoTrade!"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs">Button Text</Label>
                                    <Input
                                        value={welcomeConfig.button_text || ''}
                                        onChange={(e) => updateWelcomeField('button_text', e.target.value)}
                                        className="input-dark"
                                        placeholder="Got it, Let's Go!"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs">Description</Label>
                                <Textarea
                                    value={welcomeConfig.description || ''}
                                    onChange={(e) => updateWelcomeField('description', e.target.value)}
                                    className="input-dark min-h-[80px]"
                                    placeholder="Your automated trading dashboard is ready. To get started:"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs">Steps (one per line)</Label>
                                <Textarea
                                    value={(welcomeConfig.steps || []).join('\n')}
                                    onChange={(e) => updateWelcomeField('steps', e.target.value.split('\n').filter(s => s.trim()))}
                                    className="input-dark min-h-[100px]"
                                    placeholder="Connect your Delta Exchange account&#10;Configure your trading instruments&#10;Set up TradingView webhook"
                                />
                            </div>
                            <Button
                                onClick={handleSaveWelcome}
                                disabled={savingWelcome}
                                className="btn-primary w-full"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {savingWelcome ? 'Saving...' : 'Save Welcome Message'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
