import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import LoginPage from "./pages/LoginPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AlertsPage from "./pages/AlertsPage";
import AdminPage from "./pages/AdminPage";
import "./App.css";

// Loading Component
const LoadingScreen = () => (
    <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="text-center">
            <div className="w-12 h-12 border-4 border-neon-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
        </div>
    </div>
);

// Protected Route - requires authentication
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) return <LoadingScreen />;
    if (!isAuthenticated) return <Navigate to="/" replace />;
    
    return children;
};

// Subscription Required Route - requires active subscription
const SubscriptionRequiredRoute = ({ children }) => {
    const { user, isAuthenticated, loading } = useAuth();
    
    if (loading) return <LoadingScreen />;
    if (!isAuthenticated) return <Navigate to="/" replace />;
    
    const subscription = user?.subscription || {};
    const hasActiveSubscription = subscription.status === 'active' || subscription.status === 'trial';
    
    // Check if expired
    if (subscription.expiry_date) {
        const expiry = new Date(subscription.expiry_date);
        if (expiry < new Date()) {
            return <Navigate to="/subscription" replace />;
        }
    }
    
    if (!hasActiveSubscription) {
        return <Navigate to="/subscription" replace />;
    }
    
    return children;
};

// Public Route - redirects to subscription page if already logged in
const PublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) return <LoadingScreen />;
    if (isAuthenticated) return <Navigate to="/subscription" replace />;
    
    return children;
};

function AppRoutes() {
    return (
        <Routes>
            {/* Public - Login/Register */}
            <Route 
                path="/" 
                element={
                    <PublicRoute>
                        <LoginPage />
                    </PublicRoute>
                } 
            />
            
            {/* Protected - Subscription Selection */}
            <Route 
                path="/subscription" 
                element={
                    <ProtectedRoute>
                        <SubscriptionPage />
                    </ProtectedRoute>
                } 
            />
            
            {/* Protected + Subscription Required - Main App */}
            <Route 
                path="/dashboard" 
                element={
                    <SubscriptionRequiredRoute>
                        <DashboardPage />
                    </SubscriptionRequiredRoute>
                } 
            />
            <Route 
                path="/settings" 
                element={
                    <SubscriptionRequiredRoute>
                        <SettingsPage />
                    </SubscriptionRequiredRoute>
                } 
            />
            <Route 
                path="/alerts" 
                element={
                    <SubscriptionRequiredRoute>
                        <AlertsPage />
                    </SubscriptionRequiredRoute>
                } 
            />
            
            {/* Admin Panel */}
            <Route 
                path="/admin" 
                element={
                    <ProtectedRoute>
                        <AdminPage />
                    </ProtectedRoute>
                } 
            />
            
            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
                <Toaster 
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: '#0F0F10',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                        },
                    }}
                />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
