import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://qitdxswxhwwfckmlzkal.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdGR4c3d4aHd3ZmNrbWx6a2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjIwOTIsImV4cCI6MjA4NjEzODA5Mn0.p42DcMr1zgYH1z_N7LXXNtG11KBj8VWvng8bVvw2dQQ';
// ⚠️  REPLACE with your Stripe Payment Link URL
// Stripe Dashboard → Payment Links → Create → Copy URL
// Looks like: https://buy.stripe.com/xxxxxxxxx
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/4gM14p0Hc2voe42g7T8og00';
const PRICE_PER_USER = 27.00;

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AuthContext = createContext();

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(null);
            const [organization, setOrganization] = useState(null);
            const [isSuperAdmin, setIsSuperAdmin] = useState(false);
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                checkUser();
                const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
                    if (session?.user) {
                        setUser(session.user);
                        loadOrganization(session.user.id);
                    } else {
                        setUser(null);
                        setOrganization(null);
                    }
                });

                return () => {
                    authListener?.subscription?.unsubscribe();
                };
            }, []);

            const checkUser = async () => {
                const { data: { session } } = await supabase.auth.getSession();
                setUser(session?.user || null);
                if (session?.user) {
                    await loadOrganization(session.user.id);
                    await checkSuperAdmin(session.user.email);
                }
                setLoading(false);
            };

            const checkSuperAdmin = async (email) => {
                // Check if user is super admin
                const { data } = await supabase
                    .from('super_admins')
                    .select('*')
                    .eq('email', email)
                    .eq('is_active', true)
                    .single();
                
                setIsSuperAdmin(!!data);
            };

            const loadOrganization = async (userId) => {
                const { data, error } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('owner_id', userId)
                    .single();
                
                if (data) setOrganization(data);
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

                // Create organization
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
                            subscription_status: 'trial',
                            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
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
                await supabase.auth.signOut();
                setUser(null);
                setOrganization(null);
            };

            return (
                <AuthContext.Provider value={{ user, organization, isSuperAdmin, loading, signUp, signIn, signOut }}>
                    {children}
                </AuthContext.Provider>
            );
        };

        const useAuth = () => useContext(AuthContext);

        // Landing Page
        const LandingPage = () => {
            const [showAuthModal, setShowAuthModal] = useState(false);
            const [authMode, setAuthMode] = useState('signin');

            return (
                <div className="gradient-bg min-h-screen">
                    {/* Navigation */}
                    <nav className="relative z-10 px-6 py-6">
                        <div className="max-w-7xl mx-auto flex justify-between items-center">
                            <div className="heading-font text-3xl font-bold text-white">
                                Bitsy<span className="text-[#5856d6]">CRM</span>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                                    className="btn-secondary"
                                >
                                    Sign In
                                </button>
                                <button 
                                    onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                    className="btn-primary"
                                >
                                    Get Started
                                </button>
                            </div>
                        </div>
                    </nav>

                    {/* Hero Section */}
                    <section className="relative z-10 px-6 py-20">
                        <div className="max-w-6xl mx-auto text-center">
                            <h1 className="heading-font text-6xl md:text-7xl font-black mb-6 leading-tight">
                                Small Business.<br/>
                                <span className="text-[#5856d6]">Big Results.</span>
                            </h1>
                            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
                                The affordable CRM designed specifically for service businesses with under 50 employees. 
                                Manage customers, track jobs, and grow your business—without the enterprise price tag.
                            </p>
                            <button 
                                onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                className="btn-primary text-lg"
                            >
                                Start Free Trial
                            </button>
                            <p className="text-sm text-gray-500 mt-4">No credit card required</p>
                        </div>
                    </section>

                    {/* Features */}
                    <section className="relative z-10 px-6 py-20">
                        <div className="max-w-6xl mx-auto">
                            <h2 className="heading-font text-4xl font-bold text-center mb-16">
                                Everything You Need. Nothing You Don't.
                            </h2>
                            <div className="grid md:grid-cols-3 gap-8">
                                {[
                                    {
                                        title: 'Customer Management',
                                        description: 'Track all your clients in one place with custom fields, tags, and notes.',
                                        icon: '&#128101;'
                                    },
                                    {
                                        title: 'Job Tracking',
                                        description: 'Monitor service jobs from start to finish with status updates and assignments.',
                                        icon: '&#128203;'
                                    },
                                    {
                                        title: 'Team Collaboration',
                                        description: 'Add your team members and assign tasks to keep everyone aligned.',
                                        icon: '&#129309;'
                                    },
                                    {
                                        title: 'Customizable Fields',
                                        description: 'Adapt Bitsy to your business with custom terminology and data fields.',
                                        icon: '&#9881;'
                                    },
                                    {
                                        title: 'Simple Reporting',
                                        description: 'Get insights on revenue, completed jobs, and business performance.',
                                        icon: '&#128202;'
                                    },
                                    {
                                        title: 'Multi-User Access',
                                        description: 'Secure individual logins for each team member with role-based permissions.',
                                        icon: '&#128272;'
                                    }
                                ].map((feature, idx) => (
                                    <div key={idx} className="glass-card p-8 feature-card">
                                        <div className="text-5xl mb-4" dangerouslySetInnerHTML={{__html: feature.icon}}></div>
                                        <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                        <p className="text-gray-400">{feature.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Pricing */}
                    <section className="relative z-10 px-6 py-20">
                        <div className="max-w-5xl mx-auto">
                            <h2 className="heading-font text-4xl font-bold text-center mb-4">
                                Simple, Transparent Pricing
                            </h2>
                            <p className="text-center text-gray-400 mb-16">
                                $27 per user per month. No hidden fees. Cancel anytime.
                            </p>
                            <div className="grid md:grid-cols-1 max-w-xl mx-auto gap-8 max-w-4xl mx-auto">
                                {/* Starter Plan */}
                                <div className="glass-card p-8 pricing-card">
                                    <h3 className="heading-font text-2xl font-bold mb-2">Pay Per User</h3>
                                    <div className="flex items-baseline mb-4">
                                        <span className="text-5xl font-bold">$27</span>
                                        <span className="text-gray-400 ml-2">/user/month</span>
                                    </div>
                                    <div className="mb-6 p-4 bg-[#5856d6]/10 rounded-lg">
                                        <div className="text-sm text-gray-400 mb-2">Example Pricing</div>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div>
                                                <div className="text-2xl font-bold mb-1">$27</div>
                                                <div className="text-xs text-gray-400">1 user</div>
                                            </div>
                                            <div>
                                                <div className="text-2xl font-bold mb-1">$81</div>
                                                <div className="text-xs text-gray-400">3 users</div>
                                            </div>
                                            <div>
                                                <div className="text-2xl font-bold mb-1">$135</div>
                                                <div className="text-xs text-gray-400">5 users</div>
                                            </div>
                                        </div>
                                    </div>
                                    <ul className="space-y-3 mb-8 text-left">
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Unlimited customers</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Unlimited deals & pipeline</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Unlimited tasks & reminders</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Job tracking & management</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Team collaboration</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Notes & activity history</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>Mobile access</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400 text-xl">✓</span>
                                            <span>All features included</span>
                                        </li>
                                    </ul>
                                    <button 
                                        onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                        className="btn-primary w-full"
                                    >
                                        Get Started - $27/month
                                    </button>
                                </div>

                                {/* Professional Plan */}
                                <div className="glass-card p-8 pricing-card border-2 border-[#5856d6]">
                                    <div className="popular-badge">Popular</div>
                                    <h3 className="heading-font text-2xl font-bold mb-2">Professional</h3>
                                    <div className="flex items-baseline mb-6">
                                        <span className="text-5xl font-bold">$39</span>
                                        <span className="text-gray-400 ml-2">/month</span>
                                    </div>
                                    <ul className="space-y-4 mb-8">
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>Up to 10 users</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>500 customers</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>Unlimited jobs</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>Custom fields & tags</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>Advanced reporting</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <span className="text-green-400">&#10003;</span>
                                            <span>Priority support</span>
                                        </li>
                                    </ul>
                                    <button 
                                        onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                        className="btn-primary w-full"
                                    >
                                        Start Free Trial
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="relative z-10 px-6 py-12 border-t border-gray-800">
                        <div className="max-w-6xl mx-auto text-center text-gray-500">
                            <p className="heading-font text-2xl font-bold mb-4">
                                Bitsy<span className="text-[#5856d6]">CRM</span>
                            </p>
                            <p>&copy; 2026 BitsyCRM. All rights reserved.</p>
                        </div>
                    </footer>

                    {/* Auth Modal */}
                    {showAuthModal && (
                        <AuthModal 
                            mode={authMode} 
                            onClose={() => setShowAuthModal(false)}
                            onSwitchMode={(mode) => setAuthMode(mode)}
                        />
                    )}
                </div>
            );
        };

        // Auth Modal Component
        const AuthModal = ({ mode, onClose, onSwitchMode }) => {
            const { signUp, signIn } = useAuth();
            const [formData, setFormData] = useState({
                fullName: '',
                email: '',
                password: '',
                organizationName: '',
                businessDescription: '',
                industry: '',
                teamSize: '1-5',
                plan: 'per_user' // Always per-user pricing
            });
            const [error, setError] = useState('');
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setError('');
                setLoading(true);

                try {
                    if (mode === 'signup') {
                        // Require payment before creating account
                        setLoading(false);
                        onClose();
                        
                        // Store signup data in sessionStorage
                        sessionStorage.setItem('pending_signup', JSON.stringify({
                            fullName: formData.fullName,
                            email: formData.email,
                            password: formData.password,
                            organizationName: formData.organizationName,
                            businessDescription: formData.businessDescription,
                            industry: formData.industry,
                            teamSize: formData.teamSize,
                            plan: formData.plan
                        }));
                        
                        // Redirect to Stripe Payment Link
                        const paymentUrl = `${STRIPE_PAYMENT_LINK}?prefilled_email=${encodeURIComponent(formData.email)}&client_reference_id=${encodeURIComponent(formData.email)}`;
                        window.location.href = paymentUrl;
                    } else {
                        await signIn(formData.email, formData.password);
                        onClose();
                    }
                } catch (err) {
                    setError(err.message);
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="heading-font text-2xl font-bold">
                                {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
                            </h2>
                            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'signup' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Your Full Name *</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="John Smith"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Company Name *</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="Acme Services Inc."
                                            value={formData.organizationName}
                                            onChange={(e) => setFormData({...formData, organizationName: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Business Description *</label>
                                        <textarea
                                            className="input-field"
                                            rows="2"
                                            placeholder="What does your business do?"
                                            value={formData.businessDescription}
                                            onChange={(e) => setFormData({...formData, businessDescription: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Industry</label>
                                            <select
                                                className="input-field"
                                                value={formData.industry}
                                                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                            >
                                                <option value="">Select...</option>
                                                <option value="construction">Construction</option>
                                                <option value="hvac">HVAC</option>
                                                <option value="plumbing">Plumbing</option>
                                                <option value="electrical">Electrical</option>
                                                <option value="landscaping">Landscaping</option>
                                                <option value="cleaning">Cleaning</option>
                                                <option value="consulting">Consulting</option>
                                                <option value="it_services">IT Services</option>
                                                <option value="marketing">Marketing</option>
                                                <option value="real_estate">Real Estate</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Team Size</label>
                                            <select
                                                className="input-field"
                                                value={formData.teamSize}
                                                onChange={(e) => setFormData({...formData, teamSize: e.target.value})}
                                            >
                                                <option value="1-5">1-5 people</option>
                                                <option value="6-10">6-10 people</option>
                                                <option value="11-25">11-25 people</option>
                                                <option value="26-50">26-50 people</option>
                                                <option value="50+">50+ people</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            <div>
                                <label className="block text-sm font-medium mb-2">Email</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="you@company.com"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Password</label>
                                <input
                                    type="password"
                                    className="input-field"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    required
                                />
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
                                    {error}
                                </div>
                            )}

                            <button 
                                type="submit" 
                                className="btn-primary w-full"
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : (mode === 'signup' ? 'Create Account' : 'Sign In')}
                            </button>
                        </form>

                        <div className="mt-6 text-center text-sm text-gray-400">
                            {mode === 'signup' ? (
                                <>
                                    Already have an account?{' '}
                                    <button onClick={() => onSwitchMode('signin')} className="text-[#5856d6] hover:underline">
                                        Sign In
                                    </button>
                                </>
                            ) : (
                                <>
                                    Don't have an account?{' '}
                                    <button onClick={() => onSwitchMode('signup')} className="text-[#5856d6] hover:underline">
                                        Sign Up
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        };

        
        // ============================================
        // SUPER ADMIN DASHBOARD - PLATFORM OWNER
        // ============================================
        const SuperAdminDashboard = () => {
            const { user, isSuperAdmin } = useAuth();
            const [loading, setLoading] = useState(true);
            const [activeTab, setActiveTab] = useState('overview');
            
            // Data states
            const [organizations, setOrganizations] = useState([]);
            const [allUsers, setAllUsers] = useState([]);
            const [stats, setStats] = useState({
                totalOrgs: 0,
                totalUsers: 0,
                activeSubscriptions: 0,
                mrr: 0,
                avgTeamSize: 0
            });
            
            // Filter states
            const [industryFilter, setIndustryFilter] = useState('all');
            const [teamSizeFilter, setTeamSizeFilter] = useState('all');
            const [searchTerm, setSearchTerm] = useState('');

            useEffect(() => {
                if (user && isSuperAdmin) {
                    loadAdminData();
                }
            }, [user, isSuperAdmin]);

            const loadAdminData = async () => {
                setLoading(true);
                try {
                    // Load all organizations
                    const { data: orgsData } = await supabase
                        .from('organizations')
                        .select('*')
                        .order('created_at', { ascending: false });
                    setOrganizations(orgsData || []);

                    // Load all users from auth
                    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
                    setAllUsers(users || []);

                    // Calculate stats
                    const totalOrgs = orgsData?.length || 0;
                    const totalUsers = orgsData?.reduce((sum, org) => sum + (org.active_users || 1), 0) || 0;
                    const activeSubscriptions = orgsData?.filter(o => o.subscription_status === 'active').length || 0;
                    const mrr = orgsData?.filter(o => o.subscription_status === 'active')
                        .reduce((sum, org) => sum + ((org.active_users || 1) * 27), 0) || 0;
                    const avgTeamSize = totalOrgs > 0 ? (totalUsers / totalOrgs).toFixed(1) : 0;

                    setStats({ totalOrgs, totalUsers, activeSubscriptions, mrr, avgTeamSize });
                } catch (err) {
                    console.error('Error loading admin data:', err);
                } finally {
                    setLoading(false);
                }
            };

            const handlePasswordReset = async (email) => {
                if (!confirm(`Send password reset email to ${email}?`)) return;
                
                try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin + '/reset-password',
                        data: {
                            from: 'Matt@bitsycrm.com',
                            reply_to: 'Matt@bitsycrm.com'
                        }
                    });
                    
                    if (error) throw error;
                    alert(`Password reset email sent to ${email}`);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            const handleDeleteOrganization = async (orgId, orgName) => {
                const confirmation = prompt(`⚠️ DELETE "${orgName}"?\n\nThis will permanently delete ALL data.\n\nType DELETE to confirm:`);
                if (confirmation !== 'DELETE') return;
                
                try {
                    const { error } = await supabase.from('organizations').delete().eq('id', orgId);
                    if (error) throw error;
                    alert('Organization deleted');
                    loadAdminData();
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            const handleToggleSubscription = async (orgId, currentStatus) => {
                const newStatus = currentStatus === 'active' ? 'cancelled' : 'active';
                try {
                    const { error } = await supabase
                        .from('organizations')
                        .update({ subscription_status: newStatus })
                        .eq('id', orgId);
                    
                    if (error) throw error;
                    alert(`Subscription ${newStatus}`);
                    loadAdminData();
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            const viewCustomerPortal = (org) => {
                alert(`Customer Portal for ${org.name}\n\nOrganization ID: ${org.id}\n\nView-only access (read-only)`);
                // In production, this would open a view-only dashboard
            };

            const filteredOrgs = organizations.filter(org => {
                if (searchTerm && !org.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
                    !org.business_description?.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return false;
                }
                if (industryFilter !== 'all' && org.industry !== industryFilter) return false;
                if (teamSizeFilter !== 'all' && org.team_size !== teamSizeFilter) return false;
                return true;
            });

            const getUniqueIndustries = () => {
                const industries = organizations.map(o => o.industry).filter(Boolean);
                return [...new Set(industries)];
            };

            const getUniqueTeamSizes = () => {
                const sizes = organizations.map(o => o.team_size).filter(Boolean);
                return [...new Set(sizes)];
            };

            if (!isSuperAdmin) {
                return (
                    <div className="min-h-screen flex items-center justify-center p-6">
                        <div className="glass-card p-8 max-w-md text-center">
                            <div className="text-6xl mb-4">🔒</div>
                            <h2 className="text-2xl font-bold mb-3">Access Denied</h2>
                            <p className="text-gray-400 mb-6">Super admin privileges required</p>
                            <button onClick={() => window.location.hash = ''} className="btn-primary">
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                );
            }

            if (loading) {
                return (
                    <div className="min-h-screen flex items-center justify-center">
                        <div className="loading-spinner"></div>
                    </div>
                );
            }

            return (
                <div className="min-h-screen bg-[#0a0a0f] p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="heading-font text-4xl font-bold mb-2">Super Admin Dashboard</h1>
                                <p className="text-gray-400">Platform owner controls</p>
                            </div>
                            <button onClick={() => window.location.hash = ''} className="btn-secondary">
                                ← Back to CRM
                            </button>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                            <div className="glass-card p-6 stat-card">
                                <div className="text-2xl mb-2">🏢</div>
                                <div className="text-3xl font-bold">{stats.totalOrgs}</div>
                                <div className="text-gray-400 text-sm">Total Organizations</div>
                            </div>
                            <div className="glass-card p-6 stat-card">
                                <div className="text-2xl mb-2">👥</div>
                                <div className="text-3xl font-bold">{stats.totalUsers}</div>
                                <div className="text-gray-400 text-sm">Total Users</div>
                            </div>
                            <div className="glass-card p-6 stat-card">
                                <div className="text-2xl mb-2">✅</div>
                                <div className="text-3xl font-bold">{stats.activeSubscriptions}</div>
                                <div className="text-gray-400 text-sm">Active Subscriptions</div>
                            </div>
                            <div className="glass-card p-6 stat-card">
                                <div className="text-2xl mb-2">💰</div>
                                <div className="text-3xl font-bold">${stats.mrr.toLocaleString()}</div>
                                <div className="text-gray-400 text-sm">MRR</div>
                            </div>
                            <div className="glass-card p-6 stat-card">
                                <div className="text-2xl mb-2">📊</div>
                                <div className="text-3xl font-bold">{stats.avgTeamSize}</div>
                                <div className="text-gray-400 text-sm">Avg Team Size</div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-4 mb-8 overflow-x-auto">
                            <button onClick={() => setActiveTab('overview')} className={activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}>Overview</button>
                            <button onClick={() => setActiveTab('organizations')} className={activeTab === 'organizations' ? 'btn-primary' : 'btn-secondary'}>Organizations</button>
                            <button onClick={() => setActiveTab('analytics')} className={activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}>Analytics</button>
                        </div>

                        {/* Organizations List */}
                        {activeTab === 'organizations' && (
                            <div className="glass-card p-6">
                                <h2 className="text-2xl font-bold mb-6">All Organizations</h2>
                                
                                {/* Filters */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Search organizations..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    <select className="input-field" value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                                        <option value="all">All Industries</option>
                                        {getUniqueIndustries().map(ind => (
                                            <option key={ind} value={ind}>{ind}</option>
                                        ))}
                                    </select>
                                    <select className="input-field" value={teamSizeFilter} onChange={(e) => setTeamSizeFilter(e.target.value)}>
                                        <option value="all">All Team Sizes</option>
                                        {getUniqueTeamSizes().map(size => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="table-header">
                                                <th className="text-left p-4">Company</th>
                                                <th className="text-left p-4">Industry</th>
                                                <th className="text-left p-4">Team Size</th>
                                                <th className="text-left p-4">Users</th>
                                                <th className="text-left p-4">MRR</th>
                                                <th className="text-left p-4">Status</th>
                                                <th className="text-left p-4">Created</th>
                                                <th className="text-left p-4">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOrgs.map(org => (
                                                <tr key={org.id} className="table-row">
                                                    <td className="p-4">
                                                        <div className="font-medium">{org.name}</div>
                                                        {org.business_description && (
                                                            <div className="text-xs text-gray-400 mt-1">{org.business_description.substring(0, 50)}...</div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-gray-400 capitalize">{org.industry || '-'}</td>
                                                    <td className="p-4 text-gray-400">{org.team_size || '-'}</td>
                                                    <td className="p-4 font-bold">{org.active_users || 1}</td>
                                                    <td className="p-4 text-green-400 font-bold">${((org.active_users || 1) * 27).toFixed(2)}</td>
                                                    <td className="p-4">
                                                        <span className={`badge ${org.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                            {org.subscription_status || 'trial'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-gray-400 text-sm">
                                                        {new Date(org.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => viewCustomerPortal(org)}
                                                                className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                                                title="View customer portal (read-only)"
                                                            >
                                                                View
                                                            </button>
                                                            <button 
                                                                onClick={() => handleToggleSubscription(org.id, org.subscription_status)}
                                                                className="text-xs px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                                                            >
                                                                {org.subscription_status === 'active' ? 'Suspend' : 'Activate'}
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteOrganization(org.id, org.name)}
                                                                className="text-xs px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-4 text-sm text-gray-400">
                                    Showing {filteredOrgs.length} of {organizations.length} organizations
                                </div>
                            </div>
                        )}

                        {/* Analytics Tab */}
                        {activeTab === 'analytics' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="glass-card p-6">
                                    <h3 className="text-xl font-bold mb-4">By Industry</h3>
                                    <div className="space-y-3">
                                        {Object.entries(
                                            organizations.reduce((acc, org) => {
                                                const ind = org.industry || 'Unknown';
                                                acc[ind] = (acc[ind] || 0) + 1;
                                                return acc;
                                            }, {})
                                        ).map(([industry, count]) => (
                                            <div key={industry} className="flex justify-between items-center">
                                                <span className="capitalize">{industry}</span>
                                                <span className="font-bold">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="glass-card p-6">
                                    <h3 className="text-xl font-bold mb-4">By Team Size</h3>
                                    <div className="space-y-3">
                                        {Object.entries(
                                            organizations.reduce((acc, org) => {
                                                const size = org.team_size || 'Unknown';
                                                acc[size] = (acc[size] || 0) + 1;
                                                return acc;
                                            }, {})
                                        ).map(([size, count]) => (
                                            <div key={size} className="flex justify-between items-center">
                                                <span>{size}</span>
                                                <span className="font-bold">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="glass-card p-6">
                                <h2 className="text-2xl font-bold mb-6">Recent Organizations</h2>
                                <div className="space-y-4">
                                    {organizations.slice(0, 10).map(org => (
                                        <div key={org.id} className="glass-card p-4 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold">{org.name}</div>
                                                <div className="text-sm text-gray-400">
                                                    {org.industry && <span className="capitalize">{org.industry} • </span>}
                                                    {org.active_users || 1} users • 
                                                    ${((org.active_users || 1) * 27)}/mo
                                                </div>
                                            </div>
                                            <span className={`badge ${org.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                {org.subscription_status || 'trial'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        };

        // Dashboard Component
        const Dashboard = () => {
            const { user, organization, isSuperAdmin, signOut } = useAuth();
            const [activeTab, setActiveTab] = useState('dashboard');
            const [customers, setCustomers] = useState([]);
            const [jobs, setJobs] = useState([]);
            const [teamMembers, setTeamMembers] = useState([]);
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

            const loadData = async () => {
                // Load customers
                const { data: customersData } = await supabase
                    .from('customers')
                    .select('*')
                    .eq('organization_id', organization.id);
                setCustomers(customersData || []);

                // Load jobs
                const { data: jobsData } = await supabase
                    .from('jobs')
                    .select('*')
                    .eq('organization_id', organization.id);
                setJobs(jobsData || []);

                // Load team members
                const { data: teamData } = await supabase
                    .from('team_members')
                    .select('*')
                    .eq('organization_id', organization.id);
                setTeamMembers(teamData || []);

                // Calculate stats
                setStats({
                    totalCustomers: customersData?.length || 0,
                    activeJobs: jobsData?.filter(j => j.status !== 'completed').length || 0,
                    completedJobs: jobsData?.filter(j => j.status === 'completed').length || 0,
                    revenue: jobsData?.reduce((sum, j) => sum + (j.value || 0), 0) || 0
                });
            };

            const renderContent = () => {
                switch(activeTab) {
                    case 'dashboard':
                        return <DashboardHome stats={stats} setActiveTab={setActiveTab} />;
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
                    case 'settings':
                        return <SettingsView organization={organization} onUpdate={loadData} />;
                    default:
                        return <DashboardHome stats={stats} setActiveTab={setActiveTab} />;
                }
            };

            return (
                <div className="flex h-screen bg-[#0a0a0f]">
                    {/* Sidebar */}
                    <div className="dashboard-sidebar w-64 flex flex-col">
                        <div className="p-6 border-b border-gray-800">
                            <div className="heading-font text-2xl font-bold">
                                Bitsy<span className="text-[#5856d6]">CRM</span>
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
                                { id: 'settings', label: 'Settings', icon: '&#9881;' }
                            ].map(item => (
                                <div
                                    key={item.id}
                                    className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(item.id)}
                                >
                                    <span className="text-xl" dangerouslySetInnerHTML={{__html: item.icon}}></span>
                                    <span>{item.label}</span>
                                </div>
                            ))}
                        </nav>

                        <div className="p-4 border-t border-gray-800">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-[#5856d6] flex items-center justify-center text-white font-bold">
                                    {user?.email?.[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{user?.email}</div>
                                    <div className="text-xs text-gray-400 capitalize">{organization?.plan} Plan</div>
                                </div>
                            </div>
                            {isSuperAdmin && (
                                <button 
                                    onClick={() => window.location.hash = 'superadmin'}
                                    className="btn-primary w-full text-sm py-2 mb-2"
                                >
                                    🔧 Super Admin
                                </button>
                            )}
                            <button onClick={signOut} className="btn-secondary w-full text-sm py-2">
                                Sign Out
                            </button>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 overflow-auto">
                        <div className="p-8">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            );
        };

        // Dashboard Home
        const DashboardHome = ({ stats, setActiveTab }) => {
            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Dashboard</h1>
                    
                    <div className="grid grid-cols-1 md:grid-cols-1 max-w-xl mx-auto lg:grid-cols-4 gap-6 mb-8">
                        <div className="glass-card p-6 stat-card">
                            <div className="text-3xl mb-2">&#128101;</div>
                            <div className="text-3xl font-bold mb-1">{stats.totalCustomers}</div>
                            <div className="text-gray-400 text-sm">Total Customers</div>
                        </div>
                        <div className="glass-card p-6 stat-card">
                            <div className="text-3xl mb-2">&#128203;</div>
                            <div className="text-3xl font-bold mb-1">{stats.activeJobs}</div>
                            <div className="text-gray-400 text-sm">Active Jobs</div>
                        </div>
                        <div className="glass-card p-6 stat-card">
                            <div className="text-3xl mb-2">&#9989;</div>
                            <div className="text-3xl font-bold mb-1">{stats.completedJobs}</div>
                            <div className="text-gray-400 text-sm">Completed Jobs</div>
                        </div>
                        <div className="glass-card p-6 stat-card">
                            <div className="text-3xl mb-2">&#128176;</div>
                            <div className="text-3xl font-bold mb-1">${stats.revenue.toLocaleString()}</div>
                            <div className="text-gray-400 text-sm">Total Revenue</div>
                        </div>
                    </div>

                    <div className="glass-card p-6">
                        <h2 className="text-xl font-bold mb-4">Welcome to Bitsy CRM</h2>
                        <p className="text-gray-400 mb-4">
                            Get started by adding your first customer or creating a job. Use the navigation on the left to explore all features.
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setActiveTab('customers')} className="btn-primary">Add Customer</button>
                            <button onClick={() => setActiveTab('jobs')} className="btn-secondary">Create Job</button>
                        </div>
                    </div>
                </div>
            );
        };

        // ============================================
        // CUSTOMER RECORD PAGE COMPONENT
        // ============================================
        const CustomerRecordPage = ({ customerId, onClose }) => {
            const { user } = useAuth();
            const [customer, setCustomer] = useState(null);
            const [notes, setNotes] = useState([]);
            const [transactions, setTransactions] = useState([]);
            const [jobs, setJobs] = useState([]);
            const [loading, setLoading] = useState(true);
            const [activeTab, setActiveTab] = useState('overview');
            const [showEditModal, setShowEditModal] = useState(false);
            const [newNote, setNewNote] = useState('');
            const [savingNote, setSavingNote] = useState(false);
            const [organization, setOrganization] = useState(null);

            useEffect(() => {
                loadCustomerData();
            }, [customerId]);

            const loadCustomerData = async () => {
                setLoading(true);
                try {
                    const { data: orgData } = await supabase.from('organizations').select('*').eq('owner_id', user.id).single();
                    setOrganization(orgData);

                    const { data: customerData } = await supabase.from('customers').select('*').eq('id', customerId).single();
                    setCustomer(customerData);

                    const { data: notesData } = await supabase.from('customer_notes').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
                    setNotes(notesData || []);

                    const { data: transactionsData } = await supabase.from('transactions').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
                    setTransactions(transactionsData || []);

                    const { data: jobsData } = await supabase.from('jobs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
                    setJobs(jobsData || []);
                } catch (err) {
                    console.error('Error loading customer:', err);
                } finally {
                    setLoading(false);
                }
            };

            const handleAddNote = async () => {
                if (!newNote.trim()) return;
                setSavingNote(true);
                try {
                    const { error } = await supabase.from('customer_notes').insert({
                        organization_id: organization.id,
                        customer_id: customerId,
                        created_by: user.id,
                        note_text: newNote
                    });
                    if (error) throw error;
                    setNewNote('');
                    loadCustomerData();
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
                    loadCustomerData();
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            };

            const calculateStats = () => {
                const totalRevenue = transactions.filter(t => t.status === 'paid' && t.transaction_type !== 'expense').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                const outstanding = transactions.filter(t => t.status === 'pending' && t.transaction_type === 'invoice').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                const completedJobs = jobs.filter(j => j.status === 'completed').length;
                const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length;
                return { totalRevenue, outstanding, completedJobs, activeJobs };
            };

            if (loading) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
                    React.createElement('div', { className: 'text-2xl' }, 'Loading...')
                );
            }

            if (!customer) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center p-6' },
                    React.createElement('div', { className: 'glass-card p-8 text-center' },
                        React.createElement('h2', { className: 'text-2xl font-bold mb-4' }, 'Customer Not Found'),
                        React.createElement('button', { onClick: onClose, className: 'btn-primary' }, 'Go Back')
                    )
                );
            }

            const stats = calculateStats();

            return (
                <div className="min-h-screen bg-[#0a0a0f] p-6">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <button onClick={onClose} className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">← Back to Customers</button>
                                <h1 className="heading-font text-4xl font-bold mb-2">{customer.name}</h1>
                                <div className="flex gap-4 text-gray-400 text-sm">
                                    {customer.email && <span>📧 {customer.email}</span>}
                                    {customer.phone && <span>📞 {customer.phone}</span>}
                                </div>
                            </div>
                            <button onClick={() => setShowEditModal(true)} className="btn-primary">Edit</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="glass-card p-6">
                                <div className="text-sm text-gray-400 mb-1">Total Revenue</div>
                                <div className="text-3xl font-bold text-green-400">${stats.totalRevenue.toFixed(2)}</div>
                            </div>
                            <div className="glass-card p-6">
                                <div className="text-sm text-gray-400 mb-1">Outstanding</div>
                                <div className="text-3xl font-bold text-yellow-400">${stats.outstanding.toFixed(2)}</div>
                            </div>
                            <div className="glass-card p-6">
                                <div className="text-sm text-gray-400 mb-1">Completed Jobs</div>
                                <div className="text-3xl font-bold">{stats.completedJobs}</div>
                            </div>
                            <div className="glass-card p-6">
                                <div className="text-sm text-gray-400 mb-1">Active Jobs</div>
                                <div className="text-3xl font-bold text-blue-400">{stats.activeJobs}</div>
                            </div>
                        </div>

                        <div className="flex gap-4 mb-8">
                            <button onClick={() => setActiveTab('overview')} className={activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}>Overview</button>
                            <button onClick={() => setActiveTab('notes')} className={activeTab === 'notes' ? 'btn-primary' : 'btn-secondary'}>Notes ({notes.length})</button>
                            <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? 'btn-primary' : 'btn-secondary'}>Transactions ({transactions.length})</button>
                        </div>

                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="glass-card p-6">
                                    <h2 className="text-xl font-bold mb-4">Details</h2>
                                    <div className="space-y-3">
                                        <div><div className="text-sm text-gray-400">Email</div><div>{customer.email || '-'}</div></div>
                                        <div><div className="text-sm text-gray-400">Phone</div><div>{customer.phone || '-'}</div></div>
                                        <div><div className="text-sm text-gray-400">Address</div><div>{customer.address || '-'}</div></div>
                                        <div><div className="text-sm text-gray-400">Since</div><div>{new Date(customer.created_at).toLocaleDateString()}</div></div>
                                    </div>
                                </div>
                                <div className="glass-card p-6">
                                    <h2 className="text-xl font-bold mb-4">Recent Notes</h2>
                                    {notes.slice(0, 3).map(note => (
                                        <div key={note.id} className="mb-3 p-3 glass-card">
                                            <div className="text-xs text-gray-400">{new Date(note.created_at).toLocaleString()}</div>
                                            <div className="text-sm mt-1">{note.note_text}</div>
                                        </div>
                                    ))}
                                    {notes.length === 0 && <div className="text-gray-400">No notes yet</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="glass-card p-6">
                                <h2 className="text-2xl font-bold mb-6">Notes</h2>
                                <div className="mb-6">
                                    <textarea className="input-field" rows="3" placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                                    <button onClick={handleAddNote} disabled={savingNote} className="btn-primary mt-2">{savingNote ? 'Saving...' : 'Add Note'}</button>
                                </div>
                                <div className="space-y-4">
                                    {notes.map(note => (
                                        <div key={note.id} className="glass-card p-4">
                                            <div className="flex justify-between">
                                                <div className="flex-1">
                                                    <div className="text-sm text-gray-400 mb-2">{new Date(note.created_at).toLocaleString()}</div>
                                                    <div>{note.note_text}</div>
                                                </div>
                                                <button onClick={() => handleDeleteNote(note.id)} className="text-red-400 text-sm ml-4">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                    {notes.length === 0 && <div className="text-center text-gray-400 py-8">No notes yet</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'transactions' && (
                            <div className="glass-card p-6">
                                <h2 className="text-2xl font-bold mb-6">Transactions</h2>
                                {transactions.length === 0 && <div className="text-center text-gray-400 py-8">No transactions yet</div>}
                                {transactions.map(t => (
                                    <div key={t.id} className="glass-card p-4 mb-3 flex justify-between">
                                        <div>
                                            <div className="font-medium capitalize">{t.transaction_type}</div>
                                            <div className="text-sm text-gray-400">{t.description || '-'}</div>
                                            <div className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-lg">${parseFloat(t.amount).toFixed(2)}</div>
                                            <span className={`badge badge-${t.status === 'paid' ? 'success' : 'warning'}`}>{t.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showEditModal && (
                            <EditCustomerModal customer={customer} onClose={() => setShowEditModal(false)} onSuccess={() => { setShowEditModal(false); loadCustomerData(); }} />
                        )}
                    </div>
                </div>
            );
        };

        // Edit Customer Modal
        const EditCustomerModal = ({ customer, onClose, onSuccess }) => {
            const [formData, setFormData] = useState({
                name: customer.name || '',
                email: customer.email || '',
                phone: customer.phone || '',
                address: customer.address || '',
                notes: customer.notes || ''
            });
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                    const { error } = await supabase.from('customers').update(formData).eq('id', customer.id);
                    if (error) throw error;
                    alert('Customer updated!');
                    onSuccess();
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Edit Customer</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Name *</label>
                                <input type="text" className="input-field" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Email</label>
                                <input type="email" className="input-field" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Phone</label>
                                <input type="tel" className="input-field" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Address</label>
                                <input type="text" className="input-field" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                            </div>
                            <div className="flex gap-4">
                                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
                                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // Create Job Modal
        const CreateJobModal = ({ customers, organizationId, onClose, onSuccess }) => {
            const { user } = useAuth();
            const [formData, setFormData] = useState({
                customer_id: '',
                title: '',
                description: '',
                status: 'pending',
                priority: 'medium',
                value: '',
                scheduled_date: ''
            });
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                    const { error } = await supabase.from('jobs').insert({
                        organization_id: organizationId,
                        ...formData,
                        value: formData.value ? parseFloat(formData.value) : 0
                    });
                    if (error) throw error;
                    alert('Job created!');
                    onSuccess();
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Create Job</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Customer *</label>
                                <select className="input-field" value={formData.customer_id} onChange={(e) => setFormData({...formData, customer_id: e.target.value})} required>
                                    <option value="">Select customer...</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Title *</label>
                                <input type="text" className="input-field" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Description</label>
                                <textarea className="input-field" rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Status</label>
                                    <select className="input-field" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
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
                            <div>
                                <label className="block text-sm font-medium mb-2">Value ($)</label>
                                <input type="number" step="0.01" className="input-field" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Scheduled Date</label>
                                <input type="date" className="input-field" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} />
                            </div>
                            <div className="flex gap-4">
                                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Creating...' : 'Create Job'}</button>
                                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // Customers View
        const CustomersView = ({ customers, organization, onUpdate }) => {
            const [showAddModal, setShowAddModal] = useState(false);
            const [showRecordPage, setShowRecordPage] = useState(false);
            const [selectedCustomer, setSelectedCustomer] = useState(null);
            const [searchTerm, setSearchTerm] = useState('');

            const filteredCustomers = customers.filter(c => 
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase())
            );

            const canAddMore = true; // Unlimited customers with per-user pricing

            const handleCustomerClick = (customer) => {
                setSelectedCustomer(customer);
                setShowRecordPage(true);
            };

            if (showRecordPage && selectedCustomer) {
                return (
                    <CustomerRecordPage 
                        customerId={selectedCustomer.id}
                        onClose={() => {
                            setShowRecordPage(false);
                            setSelectedCustomer(null);
                            onUpdate();
                        }}
                    />
                );
            }

            return (
                <div>
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="heading-font text-4xl font-bold">Customers</h1>
                        <button 
                            className="btn-primary"
                            onClick={() => setShowAddModal(true)}
                        >
                            Add Customer
                        </button>
                    </div>

                    <div className="glass-card p-6 mb-6">
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="glass-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="table-header">
                                    <th className="text-left p-4">Name</th>
                                    <th className="text-left p-4">Email</th>
                                    <th className="text-left p-4">Phone</th>
                                    <th className="text-left p-4">Status</th>
                                    <th className="text-left p-4">Created</th>
                                    <th className="text-left p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map(customer => (
                                    <tr key={customer.id} className="table-row">
                                        <td className="p-4 font-medium text-[#5856d6] hover:underline cursor-pointer" onClick={() => handleCustomerClick(customer)}>{customer.name}</td>
                                        <td className="p-4 text-gray-400">{customer.email || '-'}</td>
                                        <td className="p-4 text-gray-400">{customer.phone || '-'}</td>
                                        <td className="p-4">
                                            <span className="badge badge-success">Active</span>
                                        </td>
                                        <td className="p-4 text-gray-400">
                                            {new Date(customer.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-4">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCustomerClick(customer);
                                                }}
                                                className="btn-primary text-sm px-4 py-2"
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredCustomers.length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                {searchTerm ? 'No customers found' : 'No customers yet. Add your first customer to get started!'}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 text-sm text-gray-400">
                        {customers.length} customers (unlimited)
                    </div>

                    {showAddModal && (
                        <AddCustomerModal 
                            organizationId={organization.id}
                            onClose={() => setShowAddModal(false)}
                            onSuccess={() => {
                                setShowAddModal(false);
                                onUpdate();
                            }}
                        />
                    )}
                </div>
            );
        };

        // Add Customer Modal
        const AddCustomerModal = ({ organizationId, onClose, onSuccess }) => {
            const [formData, setFormData] = useState({
                name: '',
                email: '',
                phone: '',
                address: '',
                notes: ''
            });
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);

                try {
                    const { error } = await supabase
                        .from('customers')
                        .insert({
                            ...formData,
                            organization_id: organizationId
                        });

                    if (error) throw error;
                    onSuccess();
                } catch (err) {
                    alert(err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Add New Customer</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Name *</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Email</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Phone</label>
                                <input
                                    type="tel"
                                    className="input-field"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Address</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={formData.address}
                                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Notes</label>
                                <textarea
                                    className="input-field"
                                    rows="3"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                />
                            </div>
                            <div className="flex gap-4">
                                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                                    {loading ? 'Adding...' : 'Add Customer'}
                                </button>
                                <button type="button" onClick={onClose} className="btn-secondary flex-1">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // Jobs View (Simplified)
        // ============================================
        // JOB DETAIL PAGE COMPONENT
        // ============================================
        const JobDetailPage = ({ jobId, onClose }) => {
            const { user } = useAuth();
            const [job, setJob] = useState(null);
            const [customer, setCustomer] = useState(null);
            const [notes, setNotes] = useState([]);
            const [transactions, setTransactions] = useState([]);
            const [loading, setLoading] = useState(true);
            const [showEditModal, setShowEditModal] = useState(false);
            const [newNote, setNewNote] = useState('');
            const [savingNote, setSavingNote] = useState(false);
            const [organization, setOrganization] = useState(null);

            useEffect(() => {
                loadJobData();
            }, [jobId]);

            const loadJobData = async () => {
                setLoading(true);
                try {
                    const { data: orgData } = await supabase.from('organizations').select('*').eq('owner_id', user.id).single();
                    setOrganization(orgData);

                    const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobId).single();
                    setJob(jobData);

                    if (jobData.customer_id) {
                        const { data: customerData } = await supabase.from('customers').select('*').eq('id', jobData.customer_id).single();
                        setCustomer(customerData);
                    }

                    const { data: notesData } = await supabase.from('customer_notes').select('*').eq('customer_id', jobData.customer_id).order('created_at', { ascending: false });
                    setNotes(notesData || []);

                    const { data: transactionsData } = await supabase.from('transactions').select('*').eq('customer_id', jobData.customer_id).order('created_at', { ascending: false });
                    setTransactions(transactionsData || []);
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
                        customer_id: job.customer_id,
                        created_by: user.id,
                        note_text: `[Job: ${job.title}] ${newNote}`
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

            const getStatusBadge = (status) => {
                const badges = {
                    pending: 'badge-warning',
                    in_progress: 'badge-info',
                    completed: 'badge-success',
                    invoiced: 'badge-info',
                    paid: 'badge-success',
                    cancelled: 'badge-error'
                };
                return badges[status] || 'badge-warning';
            };

            const getPriorityBadge = (priority) => {
                const badges = {
                    low: 'badge-success',
                    medium: 'badge-info',
                    high: 'badge-warning',
                    urgent: 'badge-error'
                };
                return badges[priority] || 'badge-info';
            };

            if (loading) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
                    React.createElement('div', { className: 'text-2xl' }, 'Loading...')
                );
            }

            if (!job) {
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center p-6' },
                    React.createElement('div', { className: 'glass-card p-8 text-center' },
                        React.createElement('h2', { className: 'text-2xl font-bold mb-4' }, 'Job Not Found'),
                        React.createElement('button', { onClick: onClose, className: 'btn-primary' }, 'Go Back')
                    )
                );
            }

            return (
                <div className="min-h-screen bg-[#0a0a0f] p-6">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <button onClick={onClose} className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">← Back to Jobs</button>
                                <h1 className="heading-font text-4xl font-bold mb-2">{job.title}</h1>
                                <div className="flex gap-3 mb-4">
                                    <span className={`badge ${getStatusBadge(job.status)}`}>{job.status.replace('_', ' ')}</span>
                                    <span className={`badge ${getPriorityBadge(job.priority)}`}>{job.priority}</span>
                                </div>
                                {customer && (
                                    <div className="text-gray-400">Customer: <span className="text-white font-medium">{customer.name}</span></div>
                                )}
                            </div>
                            <button onClick={() => setShowEditModal(true)} className="btn-primary">Edit Job</button>
                        </div>

                        {/* Quick Status Actions */}
                        <div className="glass-card p-6 mb-8">
                            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={() => handleStatusChange('pending')} className={`btn-${job.status === 'pending' ? 'primary' : 'secondary'} text-sm`}>
                                    Mark Pending
                                </button>
                                <button onClick={() => handleStatusChange('in_progress')} className={`btn-${job.status === 'in_progress' ? 'primary' : 'secondary'} text-sm`}>
                                    Mark In Progress
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
                            </div>
                        </div>

                        {/* Job Details */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <div className="glass-card p-6">
                                <h2 className="text-xl font-bold mb-4">Job Details</h2>
                                <div className="space-y-3">
                                    <div><div className="text-sm text-gray-400">Description</div><div>{job.description || '-'}</div></div>
                                    <div><div className="text-sm text-gray-400">Value</div><div className="text-green-400 font-bold">${parseFloat(job.value || 0).toFixed(2)}</div></div>
                                    <div><div className="text-sm text-gray-400">Scheduled Date</div><div>{job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : '-'}</div></div>
                                    <div><div className="text-sm text-gray-400">Created</div><div>{new Date(job.created_at).toLocaleDateString()}</div></div>
                                </div>
                            </div>
                            {customer && (
                                <div className="glass-card p-6">
                                    <h2 className="text-xl font-bold mb-4">Customer Info</h2>
                                    <div className="space-y-3">
                                        <div><div className="text-sm text-gray-400">Name</div><div>{customer.name}</div></div>
                                        <div><div className="text-sm text-gray-400">Email</div><div>{customer.email || '-'}</div></div>
                                        <div><div className="text-sm text-gray-400">Phone</div><div>{customer.phone || '-'}</div></div>
                                        <div><div className="text-sm text-gray-400">Address</div><div>{customer.address || '-'}</div></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Job Notes */}
                        <div className="glass-card p-6 mb-8">
                            <h2 className="text-2xl font-bold mb-6">Job Notes</h2>
                            <div className="mb-6">
                                <textarea 
                                    className="input-field" 
                                    rows="3" 
                                    placeholder="Add a note about this job..." 
                                    value={newNote} 
                                    onChange={(e) => setNewNote(e.target.value)} 
                                />
                                <button onClick={handleAddNote} disabled={savingNote} className="btn-primary mt-2">
                                    {savingNote ? 'Saving...' : 'Add Note'}
                                </button>
                            </div>
                            <div className="space-y-4">
                                {notes.filter(n => n.note_text.includes(`[Job: ${job.title}]`)).map(note => (
                                    <div key={note.id} className="glass-card p-4">
                                        <div className="flex justify-between">
                                            <div className="flex-1">
                                                <div className="text-sm text-gray-400 mb-2">{new Date(note.created_at).toLocaleString()}</div>
                                                <div>{note.note_text.replace(`[Job: ${job.title}] `, '')}</div>
                                            </div>
                                            <button onClick={() => handleDeleteNote(note.id)} className="text-red-400 text-sm ml-4">Delete</button>
                                        </div>
                                    </div>
                                ))}
                                {notes.filter(n => n.note_text.includes(`[Job: ${job.title}]`)).length === 0 && (
                                    <div className="text-center text-gray-400 py-8">No notes for this job yet</div>
                                )}
                            </div>
                        </div>

                        {showEditModal && (
                            <EditJobModal 
                                job={job} 
                                customers={[customer]} 
                                onClose={() => setShowEditModal(false)} 
                                onSuccess={() => { 
                                    setShowEditModal(false); 
                                    loadJobData(); 
                                }} 
                            />
                        )}
                    </div>
                </div>
            );
        };

        // Edit Job Modal
        const EditJobModal = ({ job, customers, onClose, onSuccess }) => {
            const [formData, setFormData] = useState({
                title: job.title || '',
                description: job.description || '',
                status: job.status || 'pending',
                priority: job.priority || 'medium',
                value: job.value || '',
                scheduled_date: job.scheduled_date || ''
            });
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                    const { error } = await supabase.from('jobs').update({
                        ...formData,
                        value: formData.value ? parseFloat(formData.value) : 0
                    }).eq('id', job.id);
                    if (error) throw error;
                    alert('Job updated!');
                    onSuccess();
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Edit Job</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Title *</label>
                                <input type="text" className="input-field" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Description</label>
                                <textarea className="input-field" rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
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
                            <div>
                                <label className="block text-sm font-medium mb-2">Value ($)</label>
                                <input type="number" step="0.01" className="input-field" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Scheduled Date</label>
                                <input type="date" className="input-field" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} />
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
                                        <span className={`badge ${getStatusBadge(job.status)}`}>{job.status.replace('_', ' ')}</span>
                                        <span className={`badge ${getPriorityBadge(job.priority)}`}>{job.priority}</span>
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
                            organizationId={organization.id}
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

        // Team View (Simplified)
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
                                    <tr key={member.id} className="table-row">
                                        <td className="p-4 font-medium">{member.email}</td>
                                        <td className="p-4 text-gray-400">{member.name || '-'}</td>
                                        <td className="p-4">
                                            <span className="badge badge-info capitalize">{member.role}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                {member.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-400">
                                            {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Pending'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {teamMembers.length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                No team members yet. Invite your first team member!
                            </div>
                        )}
                    </div>

                    <div className="mt-4 text-sm text-gray-400">
                        {teamMembers.length} team members @ $27/user = ${(teamMembers.length * 27).toFixed(2)}/month
                    </div>

                    {showCreateModal && (
                        <CreateTeamMemberModal 
                            organizationId={organization.id}
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

        // Create Team Member Modal
        const CreateTeamMemberModal = ({ organizationId, onClose, onSuccess }) => {
            const [formData, setFormData] = useState({
                email: '',
                name: '',
                password: '',
                role: 'employee'
            });
            const [loading, setLoading] = useState(false);

            const generatePassword = () => {
                const length = 12;
                const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                let password = "";
                for (let i = 0; i < length; i++) {
                    password += charset.charAt(Math.floor(Math.random() * charset.length));
                }
                setFormData({...formData, password: password});
            };

            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                
                try {
                    // Store team member data for after payment
                    sessionStorage.setItem('pending_team_member', JSON.stringify({
                        email: formData.email,
                        password: formData.password,
                        name: formData.name,
                        role: formData.role,
                        organizationId: organizationId
                    }));
                    
                    // Redirect to Stripe Payment Link for new team member
                    const paymentUrl = `${STRIPE_PAYMENT_LINK}?prefilled_email=${encodeURIComponent(formData.email)}&client_reference_id=${encodeURIComponent('team_member_' + formData.email)}`;
                    window.location.href = paymentUrl;
                    
                    onSuccess(); // Close modal
                } catch (err) {
                    alert('Error: ' + err.message);
                    setLoading(false);
                }
            };

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Create Team Member</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Email *</label>
                                <input 
                                    type="email" 
                                    className="input-field" 
                                    value={formData.email} 
                                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Name *</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={formData.name} 
                                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Password *</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="input-field flex-1" 
                                        value={formData.password} 
                                        onChange={(e) => setFormData({...formData, password: e.target.value})} 
                                        required 
                                        placeholder="Enter password or generate one"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={generatePassword} 
                                        className="btn-secondary px-4"
                                    >
                                        Generate
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">You'll need to share this password with the team member securely</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Role *</label>
                                <select className="input-field" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                                    <option value="admin">Admin - Full access except team management</option>
                                    <option value="manager">Manager - Edit but not delete</option>
                                    <option value="employee">Employee - View and edit jobs</option>
                                    <option value="viewer">Viewer - Read-only + Add notes</option>
                                </select>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-sm text-yellow-200">
                                ⚠️ Important: After creating the account, you must securely send the login credentials to the team member.
                            </div>
                            <div className="flex gap-4">
                                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                                    {loading ? 'Creating...' : 'Create Team Member'}
                                </button>
                                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        
        // ============================================
        // PHASE 1: SALES PIPELINE & TASKS COMPONENTS  
        // ============================================

        // This file will be inserted into the main HTML

// ============================================
// PHASE 1: PIPELINE VIEW COMPONENT
// ============================================
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
        { id: 'negotiation', name: 'Negotiation', order: 4 }
    ];

    useEffect(() => { loadData(); }, [organization]);

    const loadData = async () => {
        const { data: dealsData } = await supabase.from('deals').select('*').eq('organization_id', organization.id).eq('status', 'active');
        setDeals(dealsData || []);
        const { data: customersData } = await supabase.from('customers').select('*').eq('organization_id', organization.id);
        setCustomers(customersData || []);
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
                                    <h3 className="font-bold text-lg">{stage.name}</h3>
                                    <div className="text-sm">
                                        <div className="text-gray-400">{getDealsForStage(stage.id).length}</div>
                                        <div className="text-green-400 font-bold">${getStageTotal(stage.id).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="space-y-3 min-h-[200px]">
                                    {getDealsForStage(stage.id).map(deal => (
                                        <div key={deal.id} draggable onDragStart={() => setDraggedDeal(deal)}
                                             onClick={() => setSelectedDeal(deal)}
                                             className="bg-white/5 p-4 rounded border border-gray-700 hover:border-[#5856d6] cursor-move hover:bg-white/10 transition-all">
                                            <div className="font-medium mb-2">{deal.title}</div>
                                            <div className="text-sm text-gray-400 mb-2">
                                                {customers.find(c => c.id === deal.customer_id)?.name || 'No customer'}
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="text-green-400 font-bold">${(deal.value || 0).toLocaleString()}</div>
                                                <div className="text-xs text-gray-500">{deal.probability}%</div>
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

            {showCreateModal && <CreateDealModal organization={organization} customers={customers} onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); loadData(); }} />}
            {selectedDeal && <DealDetailModal deal={selectedDeal} customers={customers} onClose={() => setSelectedDeal(null)} onUpdate={loadData} />}
        </div>
    );
};

const CreateDealModal = ({ organization, customers, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({ title: '', customer_id: '', value: '', probability: 50, stage: 'lead', next_follow_up: '', description: '' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const stageOrders = { lead: 0, contacted: 1, qualified: 2, proposal: 3, negotiation: 4 };
            await supabase.from('deals').insert({
                organization_id: organization.id, created_by: user.id, ...formData,
                value: parseFloat(formData.value) || 0, stage_order: stageOrders[formData.stage] || 0, status: 'active'
            });
            alert('Deal created!');
            onSuccess();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card p-8 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="heading-font text-2xl font-bold mb-6">Create New Deal</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" className="input-field" placeholder="Deal Title *" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
                    <div className="grid grid-cols-2 gap-4">
                        <select className="input-field" value={formData.customer_id} onChange={(e) => setFormData({...formData, customer_id: e.target.value})}>
                            <option value="">Select customer...</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input type="number" step="0.01" className="input-field" placeholder="Value ($)" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
                    </div>
                    <div className="flex gap-4">
                        <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Creating...' : 'Create Deal'}</button>
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DealDetailModal = ({ deal, customers, onClose, onUpdate }) => {
    const handleMarkWon = async () => {
        await supabase.from('deals').update({ status: 'won', stage: 'won', actual_close_date: new Date().toISOString().split('T')[0] }).eq('id', deal.id);
        alert('Deal marked as Won! 🎉');
        onUpdate();
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card p-8 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="heading-font text-2xl font-bold mb-4">{deal.title}</h2>
                <div className="space-y-4">
                    <div className="text-3xl font-bold text-green-400">${(deal.value || 0).toLocaleString()}</div>
                    <div>Probability: {deal.probability}%</div>
                    <div className="flex gap-2">
                        <button onClick={handleMarkWon} className="btn-primary flex-1">Mark Won</button>
                        <button onClick={onClose} className="btn-secondary flex-1">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================
// PHASE 1: TASKS VIEW COMPONENT  
// ============================================
const TasksView = ({ organization, onUpdate }) => {
    const [tasks, setTasks] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [filter, setFilter] = useState('all');

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

            <div className="space-y-3">
                {filteredTasks.map(task => (
                    <div key={task.id} className="glass-card p-4">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <div className="font-medium text-lg mb-2">{task.title}</div>
                                {task.description && <div className="text-gray-400 text-sm mb-2">{task.description}</div>}
                                <div className="flex gap-4 text-sm text-gray-400">
                                    {task.due_date && <div>Due: {new Date(task.due_date).toLocaleDateString()}</div>}
                                    <div className={`badge badge-${task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'info'}`}>{task.priority}</div>
                                    <div className={`badge badge-${task.status === 'completed' ? 'success' : 'warning'}`}>{task.status}</div>
                                </div>
                            </div>
                            {task.status !== 'completed' && (
                                <button onClick={() => handleComplete(task.id)} className="btn-secondary text-sm">Mark Complete</button>
                            )}
                        </div>
                    </div>
                ))}
                {filteredTasks.length === 0 && (
                    <div className="text-center text-gray-400 py-8">No tasks found</div>
                )}
            </div>

            {showCreateModal && <CreateTaskModal organization={organization} onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); loadData(); }} />}
        </div>
    );
};

const CreateTaskModal = ({ organization, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({ title: '', description: '', due_date: '', priority: 'medium', task_type: 'general' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await supabase.from('tasks').insert({
                organization_id: organization.id, created_by: user.id, assigned_to: user.id,
                ...formData, status: 'pending'
            });
            alert('Task created!');
            onSuccess();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card p-8 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="heading-font text-2xl font-bold mb-6">Create Task</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" className="input-field" placeholder="Task Title *" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
                    <textarea className="input-field" rows="3" placeholder="Description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                        <input type="date" className="input-field" value={formData.due_date} onChange={(e) => setFormData({...formData, due_date: e.target.value})} />
                        <select className="input-field" value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                    <div className="flex gap-4">
                        <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Creating...' : 'Create Task'}</button>
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

        // Settings View with Billing
        const SettingsView = ({ organization, onUpdate }) => {
            const [activeSettingsTab, setActiveSettingsTab] = useState('general');
            
            const getSubscriptionStatus = () => {
                if (organization.subscription_status === 'active') {
                    return { label: 'Active', class: 'badge-success' };
                } else if (organization.subscription_status === 'trial') {
                    return { label: 'Trial', class: 'badge-info' };
                } else if (organization.subscription_status === 'cancelled') {
                    return { label: 'Cancelled', class: 'badge-error' };
                } else {
                    return { label: 'Inactive', class: 'badge-warning' };
                }
            };
            
            const handleUpgrade = (plan) => {
                const { user } = useAuth();
                if (!user || !user.email) {
                    alert('Please log in to subscribe');
                    return;
                }
                createSimpleCheckout(plan, user.email);
            };
            
            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Settings</h1>
                    
                    <div className="flex gap-4 mb-8">
                        <button
                            onClick={() => setActiveSettingsTab('general')}
                            className={activeSettingsTab === 'general' ? 'btn-primary' : 'btn-secondary'}
                        >
                            General
                        </button>
                        <button
                            onClick={() => setActiveSettingsTab('billing')}
                            className={activeSettingsTab === 'billing' ? 'btn-primary' : 'btn-secondary'}
                        >
                            Billing
                        </button>
                    </div>
                    
                    {activeSettingsTab === 'general' && (
                        <div className="glass-card p-8">
                            <h2 className="text-xl font-bold mb-6">Organization</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Business Name</label>
                                    <input type="text" className="input-field" value={organization.name} disabled />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Current Plan</label>
                                    <div className="text-lg font-semibold text-[#5856d6]">
                                        ${((organization.active_users || 1) * 27).toFixed(2)}/month for {organization.active_users || 1} user(s)
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeSettingsTab === 'billing' && (
                        <div className="glass-card p-8">
                            <h2 className="text-xl font-bold mb-6">Billing & Subscription</h2>
                            <div className="space-y-6">
                                <div className="grid md:grid-cols-1 max-w-xl mx-auto gap-4">
                                    <div>
                                        <div className="text-sm text-gray-400 mb-1">Plan</div>
                                        <div className="text-2xl font-bold capitalize">{organization.plan}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-gray-400 mb-1">Status</div>
                                        <span className="badge badge-info">
                                            {organization.subscription_status || 'Trial'}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => alert('Stripe Customer Portal: Configure in Stripe Dashboard')} className="btn-primary">
                                    Manage Subscription
                                </button>
                                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-4 py-3 rounded-lg text-sm">
                                    <strong>Payment Setup Required:</strong> Follow STRIPE-INTEGRATION.md to enable billing
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        // Super Admin Dashboard Component
        ;

        // Main App Component
        const AppInner = () => {
            const { user, isSuperAdmin, loading } = useAuth();
            const [isAdminRoute, setIsAdminRoute] = useState(false);

            useEffect(() => {
                const checkHash = () => {
                    setIsAdminRoute(window.location.hash === '#superadmin');
                };
                
                checkHash();
                window.addEventListener('hashchange', checkHash);
                
                return () => window.removeEventListener('hashchange', checkHash);
            }, []);

            if (loading) {
                return (
                    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                        <div className="loading-spinner"></div>
                    </div>
                );
            }

            if (isAdminRoute && user && isSuperAdmin) {
                return <SuperAdminDashboard />;
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
