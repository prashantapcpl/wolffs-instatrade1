import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Set axios default header whenever token changes
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [token]);

    const fetchUser = useCallback(async () => {
        const storedToken = localStorage.getItem('token');
        if (!storedToken) {
            setLoading(false);
            return;
        }

        try {
            axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
            const response = await axios.get(`${API_URL}/api/auth/me`);
            setUser(response.data);
            setToken(storedToken);
        } catch (error) {
            console.error('Failed to fetch user:', error);
            // Only logout if it's an auth error (401)
            if (error.response?.status === 401) {
                localStorage.removeItem('token');
                delete axios.defaults.headers.common['Authorization'];
                setToken(null);
                setUser(null);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch user on mount
    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const login = async (mobile, password) => {
        const response = await axios.post(`${API_URL}/api/auth/login`, {
            mobile,
            password
        });
        const { token: newToken, user: userData } = response.data;
        localStorage.setItem('token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        setToken(newToken);
        setUser(userData);
        return response.data;
    };

    const register = async (mobile, password, name) => {
        const response = await axios.post(`${API_URL}/api/auth/register`, {
            mobile,
            password,
            name
        });
        const { token: newToken, user: userData } = response.data;
        localStorage.setItem('token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        setToken(newToken);
        setUser(userData);
        return response.data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('welcomed');
        delete axios.defaults.headers.common['Authorization'];
        setToken(null);
        setUser(null);
    };

    const refreshUser = async () => {
        await fetchUser();
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            loading,
            login,
            register,
            logout,
            refreshUser,
            isAuthenticated: !!token && !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
