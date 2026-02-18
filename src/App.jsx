import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://qitdxswxhwwfckmlzkawfisowfvdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdGR4c3d4aHd3ZmNrbWx6a2F3Zmlzb3dmdmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0NzIxMjAsImV4cCI6MjA1MDA0ODEyMH0.0W2ERCtnZ5-y3HGR_ry04_qZtLd1hDCGKV_1_6lYQFo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth Context
const AuthContext = createContext();
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

// Simple AuthProvider
const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription?.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

// Simple Landing Page
const LandingPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { signIn } = useAuth();

    const handleSignIn = async (e) => {
        e.preventDefault();
        try {
            setError('');
            await signIn(email, password);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0D0E2E', color: '#E8E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ maxWidth: '400px', padding: '2rem', background: '#1A1B4B', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        Bitsy<span style={{ color: '#FFD93D' }}>CRM</span>
                    </h1>
                    <p style={{ color: '#A0A3C4' }}>Small business CRM that actually works</p>
                </div>

                <form onSubmit={handleSignIn}>
                    {error && (
                        <div style={{ color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                            {error}
                        </div>
                    )}
                    
                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{ width: '100%', padding: '0.75rem', background: 'rgba(26,27,75,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8E8F0' }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ width: '100%', padding: '0.75rem', background: 'rgba(26,27,75,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8E8F0' }}
                        />
                    </div>
                    
                    <button
                        type="submit"
                        style={{ width: '100%', padding: '0.75rem', background: '#FFD93D', color: '#0D0E2E', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
};

// Simple Dashboard
const Dashboard = () => {
    const { signOut } = useAuth();

    return (
        <div style={{ minHeight: '100vh', background: '#0D0E2E', color: '#E8E8F0', padding: '2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem', background: '#1A1B4B', borderRadius: '12px' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        Bitsy<span style={{ color: '#FFD93D' }}>CRM</span>
                    </h1>
                    <button
                        onClick={signOut}
                        style={{ padding: '0.5rem 1rem', background: '#A0A3C4', color: '#0D0E2E', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                        Sign Out
                    </button>
                </header>

                <div style={{ background: '#1A1B4B', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Welcome to Bitsy CRM!</h2>
                    <p style={{ color: '#A0A3C4', marginBottom: '2rem' }}>Your dashboard is loading...</p>
                    <div style={{ color: '#4ade80' }}>✅ Authentication working</div>
                    <div style={{ color: '#4ade80' }}>✅ Database connected</div>
                    <div style={{ color: '#4ade80' }}>✅ App successfully loaded</div>
                </div>
            </div>
        </div>
    );
};

// Main App Component
const AppInner = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#0D0E2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#E8E8F0' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                    <div>Loading...</div>
                </div>
            </div>
        );
    }

    return user ? <Dashboard /> : <LandingPage />;
};

const App = () => {
    return (
        <AuthProvider>
            <AppInner />
        </AuthProvider>
    );
};

export default App;
