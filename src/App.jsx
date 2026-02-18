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

        // Error Boundary to catch React crashes
        class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { hasError: false, error: null };
            }

            static getDerivedStateFromError(error) {
                return { hasError: true, error };
            }

            componentDidCatch(error, errorInfo) {
                console.error('React Error Boundary caught:', error, errorInfo);
            }

            render() {
                if (this.state.hasError) {
                    return (
                        <div style={{minHeight:'100vh',background:'#0D0E2E',color:'#E8E8F0',display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
                            <div style={{textAlign:'center',maxWidth:'500px'}}>
                                <div style={{fontSize:'3rem',marginBottom:'1rem'}}>💥</div>
                                <h1 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1rem'}}>React Error</h1>
                                <p style={{color:'#A0A3C4',marginBottom:'1rem',lineHeight:'1.6'}}>
                                    The app crashed due to a React error. This is usually caused by corrupted browser storage.
                                </p>
                                <button onClick={() => {
                                    try { 
                                        Object.keys(localStorage).filter(k => k.includes('supabase')).forEach(k => localStorage.removeItem(k)); 
                                        sessionStorage.clear(); 
                                    } catch(e) {}
                                    window.location.reload();
                                }} style={{background:'#FFD93D',color:'#0D0E2E',padding:'12px 24px',borderRadius:'8px',border:'none',fontWeight:'600',cursor:'pointer'}}>
                                    🔄 Clear Storage & Reload
                                </button>
                            </div>
                        </div>
                    );
                }
                return this.props.children;
            }
        }

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(null);
            const [organization, setOrganization] = useState(null);
            const [isSuperAdmin, setIsSuperAdmin] = useState(false);
            const [loading, setLoading] = useState(true);
            const [crashed, setCrashed] = useState(false);
            const orgLoadedForUser = React.useRef(null);

            // Crash recovery UI
            if (crashed) {
                return (
                    <div style={{minHeight:'100vh',background:'#0D0E2E',color:'#E8E8F0',display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
                        <div style={{textAlign:'center',maxWidth:'400px'}}>
                            <div style={{fontSize:'3rem',marginBottom:'1rem'}}>⚠️</div>
                            <h1 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1rem'}}>App Crashed</h1>
                            <p style={{color:'#A0A3C4',marginBottom:'2rem',lineHeight:'1.6'}}>
                                Something went wrong. This usually happens when browser storage gets corrupted.
                            </p>
                            <button onClick={() => {
                                try {
                                    const authKeys = Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'));
                                    authKeys.forEach(k => localStorage.removeItem(k));
                                    sessionStorage.clear();
                                } catch(e) {}
                                setCrashed(false);
                                setLoading(true);
                                setUser(null);
                                setOrganization(null);
                                orgLoadedForUser.current = null;
                                window.location.reload();
                            }} style={{background:'#FFD93D',color:'#0D0E2E',padding:'12px 24px',borderRadius:'8px',border:'none',fontWeight:'600',cursor:'pointer'}}>
                                🔄 Reset App
                            </button>
                        </div>
                    </div>
                );
            }

            useEffect(() => {
                const initAuth = async () => {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.user) {
                            setLoading(false);
                            return;
                        }

                        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
                            try {
                                if (event === 'SIGNED_OUT' || !session?.user) {
                                    setUser(null);
                                    setOrganization(null);
                                    orgLoadedForUser.current = null;
                                    setLoading(false);
                                    return;
                                }

                                if (session.user.id === orgLoadedForUser.current) {
                                    setLoading(false);
                                    return;
                                }

                                setUser(session.user);
                                await loadOrganization(session.user.id);
                                await checkSuperAdmin(session.user.email);
                                setLoading(false);
                            } catch (e) {
                                console.error('Auth state change error:', e);
                                setCrashed(true);
                            }
                        });

                        const timeout = setTimeout(() => {
                            console.warn('Auth timeout - forcing loading = false');
                            setLoading(false);
                        }, 5000);

                        return () => {
                            authListener?.subscription?.unsubscribe();
                            clearTimeout(timeout);
                        };
                    } catch (e) {
                        console.error('Auth initialization error:', e);
                        setCrashed(true);
                    }
                };
                
                initAuth();
            }, []);

            const checkSuperAdmin = async (email) => {
                const { data } = await supabase
                    .from('super_admins')
                    .select('*')
                    .eq('email', email)
                    .eq('is_active', true)
                    .single();
                
                setIsSuperAdmin(!!data);
            };

            const loadOrganization = async (userId) => {
                try {
                    const { data, error } = await supabase
                        .from('organizations')
                        .select('*')
                        .eq('owner_id', userId)
                        .single();

                    if (data) {
                        setOrganization(data);
                        orgLoadedForUser.current = userId;
                        return;
                    }

                    const errMsg = error?.message || '';
                    if (errMsg.includes('does not exist') || errMsg.includes('42P01')) return;

                    const { data: metaRes } = await supabase.auth.getUser();
                    const meta = metaRes?.user?.user_metadata || {};
                    const orgName = meta.organization_name
                        || (meta.full_name ? meta.full_name + "'s Business" : null)
                        || metaRes?.user?.email?.split('@')[0]
                        || 'My Business';
                    const { data: newOrg } = await supabase
                        .from('organizations')
                        .insert({
                            owner_id: userId,
                            name: orgName,
                            business_description: meta.business_description || '',
                            industry: meta.industry || '',
                            team_size: meta.team_size || '',
                            plan: meta.plan || 'per_user',
                            pricing_model: 'per_user',
                            price_per_user: 27.00,
                            active_users: 1,
                            subscription_status: 'active'
                        })
                        .select()
                        .single();
                    if (newOrg) {
                        setOrganization(newOrg);
                        orgLoadedForUser.current = userId;
                    }
                } catch (e) {
                    console.error('loadOrganization error:', e.message);
                }
            };

            const signUp = async (email, password, organizationName, plan, fullName, businessDescription, industry, teamSize) => {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            organization_name: organizationName,
                            business_description: businessDescription,
                            industry: industry,
                            team_size: teamSize,
                            plan: plan
                        }
                    }
                });

                if (error) throw error;

                if (data.user) {
                    const { error: orgError } = await supabase
                        .from('organizations')
                        .insert({
                            owner_id: data.user.id,
                            name: organizationName,
                            business_description: businessDescription,
                            industry: industry,
                            team_size: teamSize,
                            plan: plan || 'per_user',
                            pricing_model: 'per_user',
                            price_per_user: 27.00,
                            active_users: 1,
                            subscription_status: 'active'
                        });

                    if (orgError) throw orgError;
                }

                return data;
            };

            const signIn = async (email, password) => {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) throw error;
                return data;
            };

            const signOut = async () => {
                setUser(null);
                setOrganization(null);
                orgLoadedForUser.current = null;
                await supabase.auth.signOut();
            };

            return (
                <AuthContext.Provider value={{ user, organization, isSuperAdmin, loading, signUp, signIn, signOut }}>
                    {children}
                </AuthContext.Provider>
            );
        };

        const useAuth = () => {
            const context = useContext(AuthContext);
            if (!context) {
                throw new Error('useAuth must be used within an AuthProvider');
            }
            return context;
        };

        // Landing Page Component
        const LandingPage = () => {
            const { signUp, signIn } = useAuth();
            const [authMode, setAuthMode] = useState('signin');

            return (
                <div className="gradient-bg min-h-screen">
                    {/* Navigation */}
                    <nav className="relative z-10 px-6 py-6">
                        <div className="max-w-7xl mx-auto flex justify-between items-center">
                            <div className="heading-font text-3xl font-bold text-white">
                                Bitsy<span className="text-[#FFD93D]">CRM</span>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setAuthMode('signin')}
                                    className={authMode === 'signin' ? 'btn-primary' : 'btn-secondary'}
                                >
                                    Sign In
                                </button>
                                <button 
                                    onClick={() => setAuthMode('signup')}
                                    className={authMode === 'signup' ? 'btn-primary' : 'btn-secondary'}
                                >
                                    Start Free Trial
                                </button>
                            </div>
                        </div>
                    </nav>

                    {/* Hero Section */}
                    <div className="relative z-10 px-6 py-20">
                        <div className="max-w-6xl mx-auto">
                            <div className="grid lg:grid-cols-2 gap-12 items-center">
                                {/* Left Column - Hero Text */}
                                <div>
                                    <h1 className="heading-font text-6xl lg:text-7xl font-bold text-white mb-6">
                                        Small Business CRM That Actually Works
                                    </h1>
                                    <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                                        The affordable CRM designed specifically for service businesses with under 50 employees. 
                                        Manage customers, track jobs, and grow your business—without the enterprise price tag.
                                    </p>
                                    
                                    <div className="flex flex-wrap gap-4 mb-12">
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <span className="text-[#FFD93D]">✓</span>
                                            30-day free trial
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <span className="text-[#FFD93D]">✓</span>
                                            No setup fees
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <span className="text-[#FFD93D]">✓</span>
                                            Cancel anytime
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                                        <div>
                                            <div className="text-3xl font-bold text-[#FFD93D]">300+</div>
                                            <div className="text-sm text-gray-400">Happy Customers</div>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-bold text-[#FFD93D]">98%</div>
                                            <div className="text-sm text-gray-400">Satisfaction Rate</div>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-bold text-[#FFD93D]">$2.1M</div>
                                            <div className="text-sm text-gray-400">Revenue Tracked</div>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-bold text-[#FFD93D]">24/7</div>
                                            <div className="text-sm text-gray-400">Support</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Auth Form */}
                                <div>
                                    {authMode === 'signup' ? (
                                        <SignupForm onSuccess={() => {}} signUp={signUp} />
                                    ) : (
                                        <SigninForm signIn={signIn} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Features Section */}
                    <div className="relative z-10 px-6 py-20 border-t border-gray-800">
                        <div className="max-w-6xl mx-auto">
                            <h2 className="heading-font text-4xl font-bold text-center text-white mb-16">
                                Everything You Need to Run Your Business
                            </h2>
                            
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {[
                                    {
                                        icon: '👥',
                                        title: 'Customer Management',
                                        description: 'Track all your clients in one place with custom fields, tags, and notes.',
                                    },
                                    {
                                        icon: '💼',
                                        title: 'Job Tracking',
                                        description: 'Monitor service jobs from start to finish with status updates and assignments.',
                                    },
                                    {
                                        icon: '💰',
                                        title: 'Sales Pipeline',
                                        description: 'Manage leads and deals through your sales process with visual boards.',
                                    },
                                    {
                                        icon: '📊',
                                        title: 'Reports & Analytics',
                                        description: 'Get insights on revenue, completed jobs, and business performance.',
                                    },
                                    {
                                        icon: '📅',
                                        title: 'Calendar Integration',
                                        description: 'Schedule appointments and never miss important deadlines.',
                                    },
                                    {
                                        icon: '⚙️',
                                        title: 'Customizable',
                                        description: 'Adapt Bitsy to your business with custom terminology and data fields.',
                                    }
                                ].map((feature, i) => (
                                    <div key={i} className="glass-card p-6">
                                        <div className="text-4xl mb-4">{feature.icon}</div>
                                        <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                        <p className="text-gray-300">{feature.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <footer className="relative z-10 px-6 py-12 border-t border-gray-800">
                        <div className="max-w-6xl mx-auto text-center text-gray-500">
                            <p className="heading-font text-2xl font-bold mb-4">
                                Bitsy<span className="text-[#FFD93D]">CRM</span>
                            </p>
                            <p>&copy; 2026 Bitsy CRM. All rights reserved.</p>
                        </div>
                    </footer>

                </div>
            );
        };

        // Sign-up Form Component
        const SignupForm = ({ onSuccess, signUp }) => {
            const [formData, setFormData] = useState({
                organizationName: '',
                fullName: '',
                email: '',
                password: '',
                businessDescription: '',
                industry: '',
                teamSize: '1-5',
                plan: 'per_user'
            });
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                setError('');

                try {
                    await signUp(
                        formData.email,
                        formData.password,
                        formData.organizationName,
                        formData.plan,
                        formData.fullName,
                        formData.businessDescription,
                        formData.industry,
                        formData.teamSize
                    );
                    onSuccess();
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="glass-card p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-white mb-2">Start Your Free Trial</h2>
                        <p className="text-gray-400">No credit card required • 30 days free</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <input
                                    type="text"
                                    placeholder="Business name"
                                    className="input-field"
                                    value={formData.organizationName}
                                    onChange={(e) => setFormData({...formData, organizationName: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="text"
                                    placeholder="Your full name"
                                    className="input-field"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <input
                            type="email"
                            placeholder="Work email"
                            className="input-field"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            required
                        />

                        <input
                            type="password"
                            placeholder="Create password (min 8 characters)"
                            className="input-field"
                            value={formData.password}
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                            required
                            minLength="8"
                        />

                        <textarea
                            placeholder="Brief business description (optional)"
                            className="input-field resize-none"
                            rows="2"
                            value={formData.businessDescription}
                            onChange={(e) => setFormData({...formData, businessDescription: e.target.value})}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <select
                                className="input-field"
                                value={formData.industry}
                                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                            >
                                <option value="">Select industry</option>
                                <option value="construction">Construction</option>
                                <option value="hvac">HVAC</option>
                                <option value="plumbing">Plumbing</option>
                                <option value="electrical">Electrical</option>
                                <option value="landscaping">Landscaping</option>
                                <option value="cleaning">Cleaning</option>
                                <option value="consulting">Consulting</option>
                                <option value="other">Other</option>
                            </select>
                            <select
                                className="input-field"
                                value={formData.teamSize}
                                onChange={(e) => setFormData({...formData, teamSize: e.target.value})}
                            >
                                <option value="1-5">1-5 employees</option>
                                <option value="6-15">6-15 employees</option>
                                <option value="16-50">16-50 employees</option>
                            </select>
                        </div>

                        <button type="submit" className="btn-primary w-full" disabled={loading}>
                            {loading ? 'Creating account...' : 'Start Free Trial'}
                        </button>

                        <p className="text-xs text-gray-500 text-center">
                            By signing up, you agree to our Terms of Service and Privacy Policy
                        </p>
                    </form>
                </div>
            );
        };

        // Sign-in Form Component
        const SigninForm = ({ signIn }) => {
            const [email, setEmail] = useState('');
            const [password, setPassword] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                setError('');

                try {
                    await signIn(email, password);
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="glass-card p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                        <p className="text-gray-400">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <input
                            type="email"
                            placeholder="Email address"
                            className="input-field"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />

                        <input
                            type="password"
                            placeholder="Password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />

                        <button type="submit" className="btn-primary w-full" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>
            );
        };

        // ── Shared job badge helpers (used by JobDetailPage and JobsView) ──
        const getStatusBadge = (status) => {
            const badges = { new:'badge-info', pending:'badge-warning', scheduled:'badge-info', in_progress:'badge-info', on_hold:'badge-warning', completed:'badge-success', invoiced:'badge-info', paid:'badge-success', cancelled:'badge-error', lost:'badge-error' };
            return badges[status] || 'badge-warning';
        };
        const getPriorityBadge = (priority) => {
            const badges = { low:'badge-success', medium:'badge-info', high:'badge-warning', urgent:'badge-error' };
            return badges[priority] || 'badge-info';
        };

        // Create Job Modal
        const CreateJobModal = ({ customers, organizationId, onClose, onSuccess }) => {
            const { user, organization: authOrg } = useAuth();
            const resolvedOrgId = organizationId || authOrg?.id;
            const [title, setTitle] = useState('');
            const [description, setDescription] = useState('');
            const [customerId, setCustomerId] = useState('');
            const [status, setStatus] = useState('pending');
            const [priority, setPriority] = useState('medium');
            const [value, setValue] = useState('');
            const [scheduledDate, setScheduledDate] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async () => {
                if (!title.trim()) { setError('Title is required'); return; }
                setLoading(true);
                setError('');

                const orgId = resolvedOrgId;
                if (!orgId) { setError('Still loading your account — please wait 2 seconds and try again.'); setLoading(false); return; }

                try {
                    const { error: dbError } = await supabase.from('jobs').insert({
                        organization_id: orgId,
                        title: title.trim(),
                        description: description.trim(),
                        customer_id: customerId || null,
                        status,
                        priority,
                        value: value ? parseFloat(value) : 0,
                        scheduled_date: scheduledDate || null,
                    });
                    if (dbError) { setError(dbError.message); setLoading(false); return; }
                    onSuccess();
                } catch (err) {
                    setError(err.message || 'Something went wrong');
                    setLoading(false);
                }
            };

            const fieldStyle = {width:'100%', padding:'10px 14px', background:'rgba(26,27,75,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#e8e8ed', fontSize:'14px'};
            const labelStyle = {display:'block', fontSize:'0.875rem', fontWeight:'500', marginBottom:'0.5rem', color:'#A0A3C4'};

            return (
                <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
                    <div onClick={e => e.stopPropagation()} style={{background:'#1A1B4B',border:'1px solid rgba(255,217,61,0.5)',borderRadius:'12px',padding:'2rem',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto',color:'#e8e8ed'}}>
                        <h2 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1.5rem'}}>Create Job</h2>

                        {error && (
                            <div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171',padding:'0.75rem',borderRadius:'8px',marginBottom:'1rem',fontSize:'0.875rem'}}>
                                {error}
                            </div>
                        )}

                        <div style={{marginBottom:'1rem'}}>
                            <label style={labelStyle}>Customer</label>
                            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={fieldStyle}>
                                <option value="">Select customer (optional)</option>
                                {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div style={{marginBottom:'1rem'}}>
                            <label style={labelStyle}>Job Title</label>
                            <input type="text" placeholder="Kitchen remodel, Oil change, etc." style={fieldStyle} value={title} onChange={e => setTitle(e.target.value)} />
                        </div>

                        <div style={{marginBottom:'1rem'}}>
                            <label style={labelStyle}>Description</label>
                            <textarea placeholder="Additional details..." style={{...fieldStyle, minHeight:'80px', resize:'vertical'}} value={description} onChange={e => setDescription(e.target.value)} />
                        </div>

                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
                            <div>
                                <label style={labelStyle}>Status</label>
                                <select value={status} onChange={e => setStatus(e.target.value)} style={fieldStyle}>
                                    <option value="new">New</option>
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="on_hold">On Hold</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                    <option value="lost">Lost</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Priority</label>
                                <select value={priority} onChange={e => setPriority(e.target.value)} style={fieldStyle}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                        </div>

                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1.5rem'}}>
                            <div>
                                <label style={labelStyle}>Value ($)</label>
                                <input type="number" step="0.01" style={fieldStyle} value={value} onChange={e => setValue(e.target.value)} />
                            </div>
                            <div>
                                <label style={labelStyle}>Scheduled Date</label>
                                <input type="date" style={fieldStyle} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                            </div>
                        </div>

                        <div style={{display:'flex',gap:'1rem'}}>
                            <button onClick={handleSubmit} disabled={loading} style={{flex:1,padding:'0.75rem',background:'#FFD93D',color:'#0D0E2E',border:'none',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>{loading ? 'Creating...' : 'Create Job'}</button>
                            <button onClick={onClose} style={{flex:1,padding:'0.75rem',background:'rgba(160,163,196,0.1)',color:'#A0A3C4',border:'1px solid rgba(160,163,196,0.2)',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>Cancel</button>
                        </div>
                    </div>
                </div>
            );
        };

        // Dashboard Component with all features
        const Dashboard = () => {
            const { user, organization, isSuperAdmin, signOut } = useAuth();
            const [activeTab, setActiveTab] = useState('dashboard');
            const [sidebarOpen, setSidebarOpen] = useState(false);
            const [orgLoadFailed, setOrgLoadFailed] = useState(false);
            const [customers, setCustomers] = useState([]);
            const [jobs, setJobs] = useState([]);
            const [teamMembers, setTeamMembers] = useState([]);
            const [tasks, setTasks] = useState([]);
            const [stats, setStats] = useState({
                totalCustomers: 0,
                activeJobs: 0,
                completedJobs: 0,
                revenue: 0
            });

            useEffect(() => {
                if (organization) {
                    loadData();
                }
            }, [organization]);

            // Simple fallback — if org still not loaded after 10 seconds, show help message
            useEffect(() => {
                if (organization) return;
                const timer = setTimeout(() => {
                    setOrgLoadFailed(true);
                }, 10000);
                return () => clearTimeout(timer);
            }, [organization]);

            const loadData = async () => {
                if (!organization?.id) return;
                try {
                    const [customersRes, jobsRes, teamRes, tasksRes] = await Promise.all([
                        supabase.from('customers').select('*').eq('organization_id', organization.id),
                        supabase.from('jobs').select('*').eq('organization_id', organization.id),
                        supabase.from('team_members').select('*').eq('organization_id', organization.id),
                        supabase.from('tasks').select('*').eq('organization_id', organization.id),
                    ]);

                    const customersData = customersRes.data || [];
                    const jobsData      = jobsRes.data      || [];
                    const teamData      = teamRes.data      || [];
                    const tasksData     = tasksRes.data     || [];

                    setCustomers(customersData);
                    setJobs(jobsData);
                    setTeamMembers(teamData);
                    setTasks(tasksData);
                    setStats({
                        totalCustomers: customersData.length,
                        activeJobs:     jobsData.filter(j => !['completed', 'cancelled', 'lost'].includes(j.status)).length,
                        completedJobs:  jobsData.filter(j => j.status === 'completed').length,
                        revenue:        jobsData.reduce((sum, j) => sum + (j.value || 0), 0),
                    });
                } catch(e) {
                    console.error('loadData error:', e.message);
                }
            };

            const renderContent = () => {
                if (!organization) {
                    if (orgLoadFailed) {
                        return (
                            <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D0E2E',color:'#E8E8F0'}}>
                                <div style={{textAlign:'center',maxWidth:'500px',padding:'2rem'}}>
                                    <div style={{fontSize:'3rem',marginBottom:'1rem'}}>🔧</div>
                                    <h1 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1rem'}}>Database Setup Needed</h1>
                                    <p style={{color:'#A0A3C4',marginBottom:'2rem',lineHeight:'1.6'}}>
                                        Your account is ready, but the database schema needs to be set up. Run the schema-fresh.sql file in Supabase SQL Editor.
                                    </p>
                                    <div style={{background:'rgba(255,217,61,0.1)',border:'1px solid rgba(255,217,61,0.3)',borderRadius:'8px',padding:'1rem',marginBottom:'2rem',textAlign:'left'}}>
                                        <div style={{fontWeight:'600',marginBottom:'0.5rem',color:'#FFD93D'}}>📋 Instructions:</div>
                                        <div style={{fontSize:'0.875rem',color:'#A0A3C4'}}>
                                            1. Go to Supabase → SQL Editor<br/>
                                            2. Create new query<br/>
                                            3. Copy and run schema-fresh.sql<br/>
                                            4. Refresh this page
                                        </div>
                                    </div>
                                    <button onClick={() => window.location.reload()} className="btn-primary" style={{marginTop:'0.5rem'}}>
                                        🔄 I ran the SQL — Reload Now
                                    </button>
                                </div>
                            </div>
                        );
                    } else {
                        return (
                            <div className="min-h-screen flex items-center justify-center">
                                <div className="text-center">
                                    <div className="loading-spinner mx-auto mb-4"></div>
                                    <div className="text-xl text-gray-400 mb-4">Loading your account...</div>
                                    <button onClick={() => {
                                        try { 
                                            const authKeys = Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'));
                                            authKeys.forEach(k => localStorage.removeItem(k));
                                            sessionStorage.clear();
                                        } catch(e) {}
                                        window.location.reload();
                                    }} style={{background:'rgba(160,163,196,0.1)',color:'#A0A3C4',padding:'8px 16px',borderRadius:'6px',border:'1px solid rgba(160,163,196,0.2)',fontSize:'0.875rem',cursor:'pointer'}}>
                                        🔄 Reset App
                                    </button>
                                </div>
                            </div>
                        );
                    }
                }

                switch (activeTab) {
                    case 'pipeline':
                        return <PipelineView organization={organization} onUpdate={loadData} />;
                    case 'customers':
                        return <CustomersView customers={customers} organization={organization} onUpdate={loadData} />;
                    case 'jobs':
                        return <JobsView jobs={jobs} customers={customers} organization={organization} onUpdate={loadData} />;
                    case 'tasks':
                        return <TasksView organization={organization} onUpdate={loadData} />;
                    case 'team':
                        return <TeamView teamMembers={teamMembers} organization={organization} onUpdate={loadData} />;
                    case 'reports':
                        return <ReportsView customers={customers} jobs={jobs} tasks={tasks} />;
                    case 'calendar':
                        return <CalendarView tasks={tasks} jobs={jobs} onUpdate={loadData} />;
                    case 'settings':
                        return <SettingsView organization={organization} onUpdate={loadData} />;
                    default:
                        return <DashboardHome stats={stats} setActiveTab={setActiveTab} />;
                }
            };

            return (
                <div className="flex h-screen bg-[#0D0E2E] overflow-hidden">
                    {/* Mobile overlay */}
                    {sidebarOpen && (
                        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
                    )}
                    {/* Sidebar */}
                    <div className={`dashboard-sidebar flex flex-col fixed md:relative z-30 h-full transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{width: '16rem'}}>
                        <div className="p-6 border-b border-gray-800">
                            <div className="heading-font text-2xl font-bold">
                                Bitsy<span className="text-[#FFD93D]">CRM</span>
                            </div>
                            <div className="text-sm text-gray-400 mt-2">{organization?.name}</div>
                        </div>

                        <nav className="flex-1 py-4">
                            {[
                                { id: 'dashboard', label: 'Dashboard', icon: '&#128202;' },
                                { id: 'pipeline', label: 'Pipeline', icon: '&#128200;' },
                                { id: 'customers', label: 'Customers', icon: '&#128101;' },
                                { id: 'jobs', label: 'Jobs', icon: '&#128203;' },
                                { id: 'tasks', label: 'Tasks', icon: '&#9745;' },
                                { id: 'team', label: 'Team', icon: '&#129309;' },
                                { id: 'reports', label: 'Reports', icon: '&#128202;' },
                                { id: 'calendar', label: 'Calendar', icon: '&#128197;' },
                                { id: 'settings', label: 'Settings', icon: '&#9881;' }
                            ].map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setActiveTab(item.id);
                                        setSidebarOpen(false);
                                    }}
                                    className={`nav-button ${activeTab === item.id ? 'nav-button-active' : ''}`}
                                >
                                    <span dangerouslySetInnerHTML={{__html: item.icon}} />
                                    {item.label}
                                </button>
                            ))}
                        </nav>

                        <div className="p-4 border-t border-gray-800">
                            <button onClick={() => setActiveTab('jobs')} className="btn-secondary w-full text-sm py-2 mb-2">
                                <span dangerouslySetInnerHTML={{__html: '&#43;'}} /> Create Job
                            </button>
                            <button onClick={signOut} className="btn-secondary w-full text-sm py-2">
                                Sign Out
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto w-full">
                        {/* Mobile header */}
                        <div className="md:hidden flex items-center gap-4 p-4 border-b border-gray-800 sticky top-0 bg-[#0D0E2E] z-10">
                            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-2xl">&#9776;</button>
                            <div className="heading-font text-xl font-bold">Bitsy<span className="text-[#FFD93D]">CRM</span></div>
                        </div>
                        <div className="p-4 md:p-8">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            );
        };

        // Dashboard Home with stats
        const DashboardHome = ({ stats, setActiveTab }) => {
            return (
                <div className="space-y-8">
                    <div>
                        <h1 className="heading-font text-4xl font-bold mb-2">Dashboard</h1>
                        <p className="text-gray-400">Welcome back! Here's what's happening with your business.</p>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="glass-card p-6 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setActiveTab('customers')}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-3xl">👥</div>
                                <div className="text-[#FFD93D] text-sm font-medium">Customers</div>
                            </div>
                            <div className="text-3xl font-bold mb-1">{stats.totalCustomers}</div>
                            <div className="text-gray-400 text-sm">Total customers</div>
                        </div>

                        <div className="glass-card p-6 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setActiveTab('jobs')}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-3xl">🔧</div>
                                <div className="text-[#FFD93D] text-sm font-medium">Active</div>
                            </div>
                            <div className="text-3xl font-bold mb-1">{stats.activeJobs}</div>
                            <div className="text-gray-400 text-sm">Active jobs</div>
                        </div>

                        <div className="glass-card p-6 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setActiveTab('jobs')}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-3xl">✅</div>
                                <div className="text-green-400 text-sm font-medium">Completed</div>
                            </div>
                            <div className="text-3xl font-bold mb-1">{stats.completedJobs}</div>
                            <div className="text-gray-400 text-sm">Jobs completed</div>
                        </div>

                        <div className="glass-card p-6 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setActiveTab('reports')}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-3xl">💰</div>
                                <div className="text-green-400 text-sm font-medium">Revenue</div>
                            </div>
                            <div className="text-3xl font-bold mb-1">${stats.revenue.toLocaleString()}</div>
                            <div className="text-gray-400 text-sm">Total value</div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-bold mb-6">Quick Actions</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <button onClick={() => setActiveTab('customers')} className="quick-action-btn">
                                <span className="text-2xl mb-2">➕</span>
                                Add Customer
                            </button>
                            <button onClick={() => setActiveTab('jobs')} className="quick-action-btn">
                                <span className="text-2xl mb-2">🔧</span>
                                Create Job
                            </button>
                            <button onClick={() => setActiveTab('pipeline')} className="quick-action-btn">
                                <span className="text-2xl mb-2">💼</span>
                                Add Deal
                            </button>
                            <button onClick={() => setActiveTab('tasks')} className="quick-action-btn">
                                <span className="text-2xl mb-2">📋</span>
                                Add Task
                            </button>
                        </div>
                    </div>
                </div>
            );
        };

        // Pipeline View Component  
        const PipelineView = ({ organization, onUpdate }) => {
            const [deals, setDeals] = useState([]);
            const [customers, setCustomers] = useState([]);
            const [showCreateModal, setShowCreateModal] = useState(false);
            const [selectedDeal, setSelectedDeal] = useState(null);
            const [draggedDeal, setDraggedDeal] = useState(null);

            const stages = [
                { id: 'lead', name: 'Lead', order: 0 },
                { id: 'contacted', name: 'Contacted', order: 1 },
                { id: 'qualified', name: 'Qualified', order: 2 },
                { id: 'proposal', name: 'Proposal', order: 3 },
                { id: 'negotiation', name: 'Negotiation', order: 4 },
                { id: 'won', name: '🏆 Won', order: 5 }
            ];

            useEffect(() => { loadData(); }, [organization]);

            const loadData = async () => {
                if (!organization?.id) return;
                try {
                    const [dealsRes, customersRes] = await Promise.all([
                        supabase.from('deals').select('*').eq('organization_id', organization.id).not('status', 'eq', 'lost'),
                        supabase.from('customers').select('*').eq('organization_id', organization.id),
                    ]);
                    setDeals(dealsRes.data || []);
                    setCustomers(customersRes.data || []);
                } catch(e) { console.error('Pipeline loadData:', e.message); }
            };

            const handleDrop = async (stage) => {
                if (!draggedDeal) return;
                await supabase.from('deals').update({ stage: stage.id, stage_order: stage.order }).eq('id', draggedDeal.id);
                await supabase.from('activities').insert({
                    organization_id: organization.id, deal_id: draggedDeal.id,
                    activity_type: 'status_change', title: `Deal moved to ${stage.name}`
                });
                loadData();
                setDraggedDeal(null);
            };

            const getDealsForStage = (stageId) => deals.filter(d => d.stage === stageId);
            const getStageTotal = (stageId) => getDealsForStage(stageId).reduce((sum, d) => sum + (d.value || 0), 0);
            const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
            const weightedValue = deals.reduce((sum, d) => sum + ((d.value || 0) * (d.probability / 100)), 0);

            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="heading-font text-4xl font-bold mb-2">Sales Pipeline</h1>
                            <div className="flex gap-6 text-sm">
                                <div>Total: <span className="text-green-400 font-bold">${totalValue.toLocaleString()}</span></div>
                                <div>Weighted: <span className="text-blue-400 font-bold">${weightedValue.toFixed(0).toLocaleString()}</span></div>
                                <div>Deals: <span className="font-bold">{deals.length}</span></div>
                            </div>
                        </div>
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">+ New Deal</button>
                    </div>

                    <div className="overflow-x-auto pb-4">
                        <div className="inline-flex gap-4 min-w-full">
                            {stages.map(stage => (
                                <div key={stage.id} className="flex-1 min-w-[280px]" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(stage)}>
                                    <div className="glass-card p-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-bold text-white">{stage.name}</h3>
                                            <div className="text-sm text-green-400 font-bold">${getStageTotal(stage.id).toLocaleString()}</div>
                                        </div>
                                        <div className="space-y-3 min-h-[200px]">
                                            {getDealsForStage(stage.id).map(deal => (
                                                <div key={deal.id} className="deal-card" draggable onDragStart={() => setDraggedDeal(deal)} onClick={() => setSelectedDeal(deal)}>
                                                    <div className="font-medium text-white mb-1">{deal.title}</div>
                                                    <div className="text-sm text-gray-400 mb-2">{customers.find(c => c.id === deal.customer_id)?.name || 'Unknown'}</div>
                                                    <div className="flex justify-between items-center">
                                                        <div className="text-green-400 font-bold">${(deal.value || 0).toLocaleString()}</div>
                                                        <div className="text-xs text-gray-500">{deal.probability || 50}%</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="glass-card p-4">
                            <h3 className="font-bold text-green-400 mb-2">Won</h3>
                            <div className="text-2xl font-bold">${getStageTotal('won').toLocaleString()}</div>
                            <div className="text-sm text-gray-400">{getDealsForStage('won').length} deals</div>
                        </div>
                        <div className="glass-card p-4">
                            <h3 className="font-bold text-red-400 mb-2">Lost</h3>
                            <div className="text-2xl font-bold">${getStageTotal('lost').toLocaleString()}</div>
                            <div className="text-sm text-gray-400">{getDealsForStage('lost').length} deals</div>
                        </div>
                    </div>

                    {showCreateModal && <CreateDealModal customers={customers} organization={organization} onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); loadData(); }} />}
                    {selectedDeal && <DealDetailModal deal={selectedDeal} customers={customers} onClose={() => setSelectedDeal(null)} onUpdate={loadData} />}
                </div>
            );
        };

        // Simple components for other tabs to prevent crashes
        const CustomersView = ({ customers, organization, onUpdate }) => {
            const [showCreateModal, setShowCreateModal] = useState(false);
            
            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="heading-font text-4xl font-bold">Customers</h1>
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">+ Add Customer</button>
                    </div>
                    <div className="glass-card">
                        <div className="p-6">
                            <p className="text-gray-400">Customer management coming soon...</p>
                        </div>
                    </div>
                </div>
            );
        };

        const JobsView = ({ jobs, customers, organization, onUpdate }) => {
            const [showCreateModal, setShowCreateModal] = useState(false);
            const [showDetailPage, setShowDetailPage] = useState(false);
            const [selectedJob, setSelectedJob] = useState(null);
            const [filter, setFilter] = useState('all');

            const filteredJobs = jobs.filter(job => {
                if (filter === 'all') return true;
                return job.status === filter;
            });

            const getCustomerName = (customerId) => {
                const customer = customers.find(c => c.id === customerId);
                return customer ? customer.name : 'Unknown';
            };

            const handleJobClick = (job) => {
                setSelectedJob(job);
                setShowDetailPage(true);
            };

            if (showDetailPage && selectedJob) {
                return (
                    <JobDetailPage 
                        jobId={selectedJob.id}
                        onClose={() => {
                            setShowDetailPage(false);
                            setSelectedJob(null);
                            onUpdate();
                        }}
                    />
                );
            }

            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="heading-font text-4xl font-bold">Jobs</h1>
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">Create Job</button>
                    </div>

                    <div className="flex gap-4 mb-6">
                        <button onClick={() => setFilter('all')} className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}>All</button>
                        <button onClick={() => setFilter('pending')} className={filter === 'pending' ? 'btn-primary' : 'btn-secondary'}>Pending</button>
                        <button onClick={() => setFilter('in_progress')} className={filter === 'in_progress' ? 'btn-primary' : 'btn-secondary'}>In Progress</button>
                        <button onClick={() => setFilter('completed')} className={filter === 'completed' ? 'btn-primary' : 'btn-secondary'}>Completed</button>
                        <button onClick={() => setFilter('lost')} className={filter === 'lost' ? 'btn-primary' : 'btn-secondary'}>Lost</button>
                    </div>

                    <div className="space-y-4">
                        {filteredJobs.map(job => (
                            <div key={job.id} className="glass-card p-6 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleJobClick(job)}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold mb-2">{job.title}</h3>
                                        <p className="text-gray-400 mb-3">{job.description}</p>
                                        <div className="flex gap-4 text-sm">
                                            <span className="text-gray-400">Customer: <span className="text-white">{getCustomerName(job.customer_id)}</span></span>
                                            {job.scheduled_date && (
                                                <span className="text-gray-400">Scheduled: <span className="text-white">{new Date(job.scheduled_date).toLocaleDateString()}</span></span>
                                            )}
                                            {job.value > 0 && (
                                                <span className="text-gray-400">Value: <span className="text-green-400 font-bold">${parseFloat(job.value).toFixed(2)}</span></span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`badge ${getStatusBadge(job.status)}`}>{(job.status || 'pending').replace('_', ' ')}</span>
                                        <span className={`badge ${getPriorityBadge(job.priority)}`}>{job.priority || 'medium'}</span>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleJobClick(job);
                                            }}
                                            className="btn-primary text-sm px-4 py-2 mt-2"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredJobs.length === 0 && (
                            <div className="glass-card p-12 text-center text-gray-400">
                                {filter === 'all' ? 'No jobs yet. Create your first job!' : `No ${filter.replace('_', ' ')} jobs`}
                            </div>
                        )}
                    </div>

                    {showCreateModal && (
                        <CreateJobModal 
                            customers={customers}
                            organizationId={organization?.id}
                            onClose={() => setShowCreateModal(false)}
                            onSuccess={() => {
                                setShowCreateModal(false);
                                onUpdate();
                            }}
                        />
                    )}
                </div>
            );
        };

        // Job Detail Page Component
        const JobDetailPage = ({ jobId, onClose }) => {
            const { user, organization } = useAuth();
            const [job, setJob] = useState(null);
            const [customer, setCustomer] = useState(null);
            const [notes, setNotes] = useState([]);
            const [transactions, setTransactions] = useState([]);
            const [loading, setLoading] = useState(true);
            const [showEditModal, setShowEditModal] = useState(false);
            const [newNote, setNewNote] = useState('');
            const [savingNote, setSavingNote] = useState(false);

            useEffect(() => {
                loadJobData();
            }, [jobId]);

            const loadJobData = async () => {
                setLoading(true);
                try {
                    const [jobRes, notesRes] = await Promise.all([
                        supabase.from('jobs').select('*').eq('id', jobId).single(),
                        supabase.from('customer_notes').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
                    ]);
                    const jobData = jobRes.data;
                    setJob(jobData);
                    setNotes(notesRes.data || []);

                    if (jobData?.customer_id) {
                        const [customerRes, txRes] = await Promise.all([
                            supabase.from('customers').select('*').eq('id', jobData.customer_id).single(),
                            supabase.from('transactions').select('*').eq('customer_id', jobData.customer_id).order('created_at', { ascending: false }),
                        ]);
                        setCustomer(customerRes.data);
                        setTransactions(txRes.data || []);
                    }
                } catch (err) {
                    console.error('Error loading job:', err);
                } finally {
                    setLoading(false);
                }
            };

            const handleStatusChange = async (newStatus) => {
                try {
                    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
                    if (error) throw error;
                    setJob({...job, status: newStatus});
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            const handleAddNote = async () => {
                if (!newNote.trim()) return;
                setSavingNote(true);
                try {
                    const { error } = await supabase.from('customer_notes').insert({
                        organization_id: organization.id,
                        customer_id: job.customer_id || null,
                        job_id: job.id,
                        created_by: user.id,
                        note_text: newNote.trim()
                    });
                    if (error) throw error;
                    setNewNote('');
                    loadJobData();
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    setSavingNote(false);
                }
            };

            const handleDeleteNote = async (noteId) => {
                if (!confirm('Delete this note?')) return;
                try {
                    const { error } = await supabase.from('customer_notes').delete().eq('id', noteId);
                    if (error) throw error;
                    loadJobData();
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            if (loading) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
                    React.createElement('div', { className: 'text-2xl' }, 'Loading...')
                );
            }

            if (!job) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
                    React.createElement('div', null,
                        React.createElement('div', { className: 'text-2xl mb-4' }, 'Job not found'),
                        React.createElement('button', { onClick: onClose, className: 'btn-primary' }, 'Go Back')
                    )
                );
            }

            return (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <div className="flex items-center gap-4 mb-4">
                            <button onClick={onClose} className="btn-secondary">← Back</button>
                            <button onClick={() => setShowEditModal(true)} className="btn-primary">Edit Job</button>
                        </div>
                        
                        <h1 className="heading-font text-4xl font-bold mb-2">{job.title}</h1>
                        <p className="text-gray-400 mb-4">{job.description || 'No description'}</p>
                        
                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => handleStatusChange('pending')} className={`btn-${job.status === 'pending' ? 'primary' : 'secondary'} text-sm`}>
                                Pending
                            </button>
                            <button onClick={() => handleStatusChange('in_progress')} className={`btn-${job.status === 'in_progress' ? 'primary' : 'secondary'} text-sm`}>
                                In Progress
                            </button>
                            <button onClick={() => handleStatusChange('completed')} className={`btn-${job.status === 'completed' ? 'primary' : 'secondary'} text-sm`}>
                                Mark Completed
                            </button>
                            <button onClick={() => handleStatusChange('invoiced')} className={`btn-${job.status === 'invoiced' ? 'primary' : 'secondary'} text-sm`}>
                                Mark Invoiced
                            </button>
                            <button onClick={() => handleStatusChange('paid')} className={`btn-${job.status === 'paid' ? 'primary' : 'secondary'} text-sm`}>
                                Mark Paid
                            </button>
                            <button onClick={() => handleStatusChange('cancelled')} className={`btn-${job.status === 'cancelled' ? 'secondary' : 'secondary'} text-sm`}>
                                Cancel Job
                            </button>
                            <button onClick={() => handleStatusChange('lost')} className={`btn-${job.status === 'lost' ? 'secondary' : 'secondary'} text-sm`}>
                                Mark Lost
                            </button>
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-4">Job Information</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Status:</span>
                                    <span className={`badge ${getStatusBadge(job.status)}`}>{(job.status || 'pending').replace('_', ' ')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Priority:</span>
                                    <span className={`badge ${getPriorityBadge(job.priority)}`}>{job.priority || 'medium'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Value:</span>
                                    <span className="text-green-400 font-bold">${parseFloat(job.value || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Scheduled:</span>
                                    <span>{job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'Not scheduled'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Created:</span>
                                    <span>{new Date(job.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {customer && (
                            <div className="glass-card p-6">
                                <h2 className="text-xl font-bold mb-4">Customer Information</h2>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Name:</span>
                                        <span className="font-medium">{customer.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Email:</span>
                                        <span>{customer.email || 'Not provided'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Phone:</span>
                                        <span>{customer.phone || 'Not provided'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Address:</span>
                                        <span className="text-right">{customer.address || 'Not provided'}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes Section */}
                    <div className="glass-card p-6 mb-8">
                        <h2 className="text-xl font-bold mb-4">Job Notes</h2>
                        
                        <div className="mb-4">
                            <textarea 
                                placeholder="Add a note about this job..."
                                className="input-field resize-none"
                                rows="3"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                            />
                            <button 
                                onClick={handleAddNote}
                                disabled={!newNote.trim() || savingNote}
                                className="btn-primary mt-2"
                            >
                                {savingNote ? 'Adding...' : 'Add Note'}
                            </button>
                        </div>

                        <div className="space-y-4">
                            {notes.map(note => (
                                <div key={note.id} className="border border-gray-700 rounded-lg p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="text-sm text-gray-400">{new Date(note.created_at).toLocaleString()}</div>
                                        <button onClick={() => handleDeleteNote(note.id)} className="text-red-400 text-sm hover:text-red-300">
                                            Delete
                                        </button>
                                    </div>
                                    <p className="text-gray-200">{note.note_text}</p>
                                </div>
                            ))}
                            {notes.length === 0 && (
                                <p className="text-gray-400 text-center py-8">No notes yet. Add the first note above.</p>
                            )}
                        </div>
                    </div>

                    {/* Edit Modal */}
                    {showEditModal && (
                        <EditJobModal 
                            job={job}
                            customers={[]}
                            onClose={() => setShowEditModal(false)}
                            onSuccess={() => {
                                setShowEditModal(false);
                                loadJobData();
                            }}
                        />
                    )}
                </div>
            );
        };

        // Edit Job Modal Component
        const EditJobModal = ({ job, customers, onClose, onSuccess }) => {
            const [formData, setFormData] = useState({
                title: job.title || '',
                description: job.description || '',
                customer_id: job.customer_id || '',
                status: job.status || 'pending',
                priority: job.priority || 'medium',
                value: job.value || '',
                scheduled_date: job.scheduled_date || ''
            });
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async (e) => {
                e.preventDefault();
                if (!formData.title.trim()) {
                    setError('Title is required');
                    return;
                }

                setLoading(true);
                setError('');

                try {
                    const { error } = await supabase.from('jobs').update({
                        title: formData.title.trim(),
                        description: formData.description.trim(),
                        customer_id: formData.customer_id || null,
                        status: formData.status,
                        priority: formData.priority,
                        value: formData.value ? parseFloat(formData.value) : 0,
                        scheduled_date: formData.scheduled_date || null
                    }).eq('id', job.id);

                    if (error) throw error;
                    onSuccess();
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
                    <div className="glass-card p-8 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-6">Edit Job</h2>
                        
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded-lg mb-4 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Job Title</label>
                                <input type="text" className="input-field" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Description</label>
                                <textarea className="input-field resize-none" rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Status</label>
                                    <select className="input-field" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="invoiced">Invoiced</option>
                                        <option value="paid">Paid</option>
                                        <option value="cancelled">Cancelled</option>
                                        <option value="lost">Lost</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Priority</label>
                                    <select className="input-field" value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})}>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Value ($)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Scheduled Date</label>
                                    <input type="date" className="input-field" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
                                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // Simple placeholder components for other views
        const TasksView = ({ organization, onUpdate }) => {
            const [tasks, setTasks] = useState([]);
            const [filter, setFilter] = useState('all');
            const [showCreateModal, setShowCreateModal] = useState(false);

            useEffect(() => { loadData(); }, [organization]);

            const loadData = async () => {
                const { data } = await supabase.from('tasks').select('*').eq('organization_id', organization.id).order('due_date', { ascending: true });
                setTasks(data || []);
            };

            const filteredTasks = tasks.filter(t => {
                if (filter === 'all') return true;
                if (filter === 'overdue') return t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
                if (filter === 'today') return t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString();
                return t.status === filter;
            });

            const handleComplete = async (taskId) => {
                await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskId);
                loadData();
            };

            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="heading-font text-4xl font-bold">Tasks</h1>
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">+ New Task</button>
                    </div>

                    <div className="flex gap-4 mb-6">
                        {['all', 'pending', 'overdue', 'today', 'completed'].map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn-primary' : 'btn-secondary'}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        {filteredTasks.map(task => (
                            <div key={task.id} className="glass-card p-4 flex items-center gap-4">
                                <input type="checkbox" checked={task.status === 'completed'} onChange={() => handleComplete(task.id)} />
                                <div className="flex-1">
                                    <div className="font-medium">{task.title}</div>
                                    {task.due_date && <div className="text-sm text-gray-400">Due: {new Date(task.due_date).toLocaleDateString()}</div>}
                                </div>
                            </div>
                        ))}
                        {filteredTasks.length === 0 && (
                            <div className="glass-card p-12 text-center text-gray-400">No {filter} tasks</div>
                        )}
                    </div>
                </div>
            );
        };

        const TeamView = ({ teamMembers, organization, onUpdate }) => {
            const [showCreateModal, setShowCreateModal] = useState(false);

            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="heading-font text-4xl font-bold">Team Members</h1>
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">Add Team Member</button>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="table-header">
                                    <th className="text-left p-4">Email</th>
                                    <th className="text-left p-4">Name</th>
                                    <th className="text-left p-4">Role</th>
                                    <th className="text-left p-4">Status</th>
                                    <th className="text-left p-4">Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teamMembers.map(member => (
                                    <tr key={member.id} className="border-b border-gray-800">
                                        <td className="p-4">{member.email}</td>
                                        <td className="p-4">{member.name}</td>
                                        <td className="p-4 capitalize">{member.role}</td>
                                        <td className="p-4">
                                            <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                {member.status}
                                            </span>
                                        </td>
                                        <td className="p-4">{new Date(member.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {teamMembers.length === 0 && (
                            <div className="p-12 text-center text-gray-400">No team members yet</div>
                        )}
                    </div>
                </div>
            );
        };

        const ReportsView = ({ customers, jobs, tasks }) => {
            const jobsByStatus = [
                { label: 'pending', count: jobs.filter(j => j.status === 'pending').length, color: '#FFD93D' },
                { label: 'in progress', count: jobs.filter(j => j.status === 'in_progress').length, color: '#4ade80' },
                { label: 'completed', count: jobs.filter(j => j.status === 'completed').length, color: '#34d399' },
                { label: 'lost', count: jobs.filter(j => j.status === 'lost').length, color: '#f87171' },
            ];

            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Reports</h1>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-6">Jobs by Status</h2>
                            <div className="space-y-3">
                                {jobsByStatus.filter(s => s.count > 0).map((s, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-24 text-sm capitalize text-gray-400">{s.label}</div>
                                        <div className="flex-1 bg-gray-800 rounded-full h-3">
                                            <div className="h-3 rounded-full" style={{width: `${(s.count / jobs.length) * 100}%`, backgroundColor: s.color}}></div>
                                        </div>
                                        <div className="w-8 text-sm font-bold text-right">{s.count}</div>
                                    </div>
                                ))}
                                {jobs.length === 0 && <div className="text-gray-400 text-sm">No jobs yet</div>}
                            </div>
                        </div>

                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-6">Quick Stats</h2>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span>Total Customers</span>
                                    <span className="font-bold">{customers.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Active Jobs</span>
                                    <span className="font-bold">{jobs.filter(j => !['completed', 'cancelled', 'lost'].includes(j.status)).length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Total Revenue</span>
                                    <span className="font-bold text-green-400">${jobs.reduce((sum, j) => sum + (j.value || 0), 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Pending Tasks</span>
                                    <span className="font-bold">{tasks.filter(t => t.status === 'pending').length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        const CalendarView = ({ tasks, jobs, onUpdate }) => {
            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Calendar</h1>
                    <div className="glass-card p-6">
                        <p className="text-gray-400">Calendar view coming soon...</p>
                    </div>
                </div>
            );
        };

        const SettingsView = ({ organization, onUpdate }) => {
            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Settings</h1>
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-bold mb-4">Organization: {organization?.name}</h2>
                        <p className="text-gray-400">Settings coming soon...</p>
                    </div>
                </div>
            );
        };

        // Create Deal Modal (placeholder)
        const CreateDealModal = ({ customers, organization, onClose, onSuccess }) => {
            const { user } = useAuth();
            const [title, setTitle] = useState('');
            const [customerId, setCustomerId] = useState('');
            const [value, setValue] = useState('');
            const [probability, setProbability] = useState(50);
            const [stage, setStage] = useState('lead');
            const [nextFollowUp, setNextFollowUp] = useState('');
            const [description, setDescription] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async () => {
                if (!title.trim()) { setError('Title is required'); return; }
                setLoading(true);
                setError('');
                const stageOrders = { lead: 0, contacted: 1, qualified: 2, proposal: 3, negotiation: 4 };

                let orgId = organization?.id;
                if (!orgId) {
                    const { data: orgData } = await supabase.from('organizations').select('id').eq('owner_id', user.id).single();
                    orgId = orgData?.id;
                }
                console.log('[CreateDeal] orgId:', orgId, '  userId:', user?.id);
                if (!orgId) { setError('Could not find your organization. Please refresh.'); setLoading(false); return; }

                const payload = {
                    organization_id: orgId,
                    created_by: user.id,
                    title: title.trim(),
                    description: description.trim(),
                    customer_id: customerId || null,
                    value: parseFloat(value) || 0,
                    probability: parseInt(probability) || 50,
                    stage,
                    stage_order: stageOrders[stage] || 0,
                    next_follow_up: nextFollowUp || null,
                    status: 'active'
                };

                try {
                    const { error: dbError } = await supabase.from('deals').insert(payload);
                    if (dbError) { console.error('[CreateDeal] DB Error:', dbError); setError(dbError.message); setLoading(false); return; }
                    onSuccess();
                } catch (err) {
                    console.error('[CreateDeal] Exception:', err);
                    setError(err.message || 'Something went wrong');
                    setLoading(false);
                }
            };

            return (
                <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
                    <div onClick={e => e.stopPropagation()} style={{background:'#1A1B4B',borderRadius:'12px',padding:'2rem',maxWidth:'500px',width:'100%',color:'#E8E8F0'}}>
                        <h2 style={{fontSize:'1.5rem',fontWeight:'bold',marginBottom:'1.5rem'}}>Create Deal</h2>
                        {error && <div style={{color:'#f87171',marginBottom:'1rem',fontSize:'0.875rem'}}>{error}</div>}
                        
                        <div style={{marginBottom:'1rem'}}>
                            <label style={{display:'block',marginBottom:'0.5rem',fontSize:'0.875rem',color:'#A0A3C4'}}>Deal Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={{width:'100%',padding:'0.75rem',background:'rgba(26,27,75,0.95)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'8px',color:'#E8E8F0'}} />
                        </div>

                        <div style={{display:'flex',gap:'1rem',marginBottom:'1.5rem'}}>
                            <button onClick={handleSubmit} disabled={loading} style={{flex:1,padding:'0.75rem',background:'#FFD93D',color:'#0D0E2E',border:'none',borderRadius:'8px',fontWeight:'600'}}>
                                {loading ? 'Creating...' : 'Create Deal'}
                            </button>
                            <button onClick={onClose} style={{flex:1,padding:'0.75rem',background:'rgba(160,163,196,0.1)',color:'#A0A3C4',border:'1px solid rgba(160,163,196,0.2)',borderRadius:'8px'}}>Cancel</button>
                        </div>
                    </div>
                </div>
            );
        };

        // Deal Detail Modal (placeholder)
        const DealDetailModal = ({ deal, customers, onClose, onUpdate }) => {
            const handleMarkWon = async () => {
                await supabase.from('deals').update({ status: 'won', stage: 'won', actual_close_date: new Date().toISOString().split('T')[0] }).eq('id', deal.id);
                alert('Deal marked as Won! 🎉');
                onUpdate();
                onClose();
            };

            return (
                <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
                    <div style={{background:"#1A1B4B",padding:"2rem",borderRadius:"12px",maxWidth:"500px",width:"90%",color:"#E8E8F0"}} onClick={e => e.stopPropagation()}>
                        <h2 style={{fontSize:"1.5rem",fontWeight:"bold",marginBottom:"1rem"}}>{deal.title}</h2>
                        <p style={{color:"#A0A3C4",marginBottom:"1.5rem"}}>{deal.description}</p>
                        <div style={{display:"flex",gap:"1rem"}}>
                            <button onClick={handleMarkWon} className="btn-primary flex-1">Mark Won</button>
                            <button onClick={onClose} className="btn-secondary flex-1">Close</button>
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
                    <div className="min-h-screen bg-[#0D0E2E] flex items-center justify-center">
                        <div className="text-center">
                            <div className="loading-spinner mx-auto mb-4"></div>
                            <div className="text-xl text-gray-400 mb-4">Loading your account...</div>
                            <div style={{color:'#A0A3C4',fontSize:'0.875rem',marginBottom:'1rem'}}>
                                Taking longer than expected?
                            </div>
                            <button onClick={() => {
                                try { 
                                    const authKeys = Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'));
                                    authKeys.forEach(k => localStorage.removeItem(k));
                                    sessionStorage.clear();
                                } catch(e) {}
                                window.location.reload();
                            }} style={{background:'rgba(160,163,196,0.1)',color:'#A0A3C4',padding:'8px 16px',borderRadius:'6px',border:'1px solid rgba(160,163,196,0.2)',fontSize:'0.875rem',cursor:'pointer'}}>
                                🔄 Reset App
                            </button>
                        </div>
                    </div>
                );
            }

            return user ? <Dashboard /> : <LandingPage />;
        };

        const App = () => {
            return (
                <ErrorBoundary>
                    <AuthProvider>
                        <AppInner />
                    </AuthProvider>
                </ErrorBoundary>
            );
        };

export default App;
