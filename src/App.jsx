import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://qitdxswxhwwfckmlzkal.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdGR4c3d4aHd3ZmNrbWx6a2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjIwOTIsImV4cCI6MjA4NjEzODA5Mn0.p42DcMr1zgYH1z_N7LXXNtG11KBj8VWvng8bVvw2dQQ';
// ⚠️  REPLACE with your Stripe Payment Link URL
// Stripe Dashboard → Payment Links → Create → Copy URL
// Looks like: https://buy.stripe.com/xxxxxxxxx
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/4gM14p0Hc2voe42g7T8og00';
const STRIPE_TEAM_PAYMENT_LINK = 'https://buy.stripe.com/4gMbJ3ey25HA7FE4pb8og01';
const PRICE_PER_USER = 27.00;

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AuthContext = createContext();

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(null);
            const [organization, setOrganization] = useState(null);
            const [isSuperAdmin, setIsSuperAdmin] = useState(false);
            const [loading, setLoading] = useState(true);
            // Prevent concurrent or redundant loadOrganization calls
            const loadingOrgRef = React.useRef(false);
            const orgLoadedRef  = React.useRef(false);

            useEffect(() => {
                const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
                    // TOKEN_REFRESHED and USER_UPDATED don't need a full reload —
                    // only act on events that represent a real login/logout change
                    if (event === 'SIGNED_OUT') {
                        setUser(null);
                        setOrganization(null);
                        orgLoadedRef.current = false;
                        setLoading(false);
                        return;
                    }

                    if (session?.user) {
                        setUser(session.user);
                        // Only load org if not already loading or already loaded
                        if (!loadingOrgRef.current) {
                            loadingOrgRef.current = true;
                            await loadOrganization(session.user.id);
                            await checkSuperAdmin(session.user.email);
                            loadingOrgRef.current = false;
                        }
                    }

                    setLoading(false);
                });

                return () => authListener?.subscription?.unsubscribe();
            }, []);

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
                // Already loaded — no need to re-fetch
                if (orgLoadedRef.current) return;

                // Try to load existing org row
                const { data, error } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('owner_id', userId)
                    .single();

                if (data) { setOrganization(data); orgLoadedRef.current = true; return; }

                // Table missing entirely — schema not run yet, bail out
                const errMsg = error?.message || '';
                if (errMsg.includes('does not exist') || errMsg.includes('relation') || errMsg.includes('42P01')) return;

                // Table exists but no row — try auto-create from signup metadata
                try {
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
                    if (newOrg) { setOrganization(newOrg); orgLoadedRef.current = true; }
                } catch (e) { /* silent — Dashboard diagnostic timeout will handle */ }
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
                                Bitsy<span className="text-[#FFD93D]">CRM</span>
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
                                <span className="text-[#FFD93D]">Big Results.</span>
                            </h1>
                            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
                                The affordable CRM designed specifically for service businesses with under 50 employees. 
                                Manage customers, track jobs, and grow your business—without the enterprise price tag.
                            </p>
                            <button 
                                onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                className="btn-primary text-lg"
                            >
                                Get Started - $27/month
                            </button>
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
                                    <div className="mb-6 p-4 bg-[#FFD93D]/10 rounded-lg">
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

                            </div>
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="relative z-10 px-6 py-12 border-t border-gray-800">
                        <div className="max-w-6xl mx-auto text-center text-gray-500">
                            <p className="heading-font text-2xl font-bold mb-4">
                                Bitsy<span className="text-[#FFD93D]">CRM</span>
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
                <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
                    <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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
                                    <button onClick={() => onSwitchMode('signin')} className="text-[#FFD93D] hover:underline">
                                        Sign In
                                    </button>
                                </>
                            ) : (
                                <>
                                    Don't have an account?{' '}
                                    <button onClick={() => onSwitchMode('signup')} className="text-[#FFD93D] hover:underline">
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
                <div className="min-h-screen bg-[#0D0E2E] p-6">
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
                                                            {org.subscription_status || 'active'}
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
                                                {org.subscription_status || 'active'}
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
                        activeJobs:     jobsData.filter(j => j.status !== 'completed').length,
                        completedJobs:  jobsData.filter(j => j.status === 'completed').length,
                        revenue:        jobsData.reduce((sum, j) => sum + (j.value || 0), 0),
                    });
                } catch(e) {
                    console.error('loadData error:', e.message);
                }
            };

            const renderContent = () => {
                // If org isn't loaded yet, show a spinner instead of crashing children
                if (!organization && activeTab !== 'dashboard') {
                    return (
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'60vh',gap:'1rem',textAlign:'center',padding:'2rem'}}>
                            {orgLoadFailed ? (
                                <>
                                    <div style={{fontSize:'2.5rem'}}>⚠️</div>
                                    <div style={{color:'#f87171',fontWeight:'700',fontSize:'1.1rem'}}>Database not set up yet</div>
                                    <div style={{color:'#A0A3C4',fontSize:'0.875rem',maxWidth:'460px',lineHeight:'1.7',textAlign:'left',background:'rgba(255,217,61,0.06)',border:'1px solid rgba(255,217,61,0.15)',borderRadius:'12px',padding:'1.25rem'}}>
                                        <div style={{fontWeight:'600',color:'#E8E8F0',marginBottom:'0.75rem'}}>3 steps to fix this:</div>
                                        <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                                            <div>① Go to <strong style={{color:'#FFD93D'}}>Supabase → SQL Editor → New Query</strong></div>
                                            <div>② Paste the <strong style={{color:'#FFD93D'}}>supabase-schema.sql</strong> file and click <strong style={{color:'#FFD93D'}}>Run</strong></div>
                                            <div>③ Click the button below</div>
                                        </div>
                                    </div>
                                    <button onClick={() => window.location.reload()} className="btn-primary" style={{marginTop:'0.5rem'}}>
                                        🔄 I ran the SQL — Reload Now
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="loading-spinner"></div>
                                    <div className="text-gray-400">Loading your account...</div>
                                </>
                            )}
                        </div>
                    );
                }
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
                                <div className="w-10 h-10 rounded-full bg-[#FFD93D] flex items-center justify-center text-white font-bold">
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
            const { user, organization } = useAuth();
            const [customer, setCustomer] = useState(null);
            const [notes, setNotes] = useState([]);
            const [transactions, setTransactions] = useState([]);
            const [jobs, setJobs] = useState([]);
            const [loading, setLoading] = useState(true);
            const [activeTab, setActiveTab] = useState('overview');
            const [showEditModal, setShowEditModal] = useState(false);
            const [newNote, setNewNote] = useState('');
            const [savingNote, setSavingNote] = useState(false);

            useEffect(() => {
                loadCustomerData();
            }, [customerId]);

            const loadCustomerData = async () => {
                setLoading(true);
                try {
                    // Fetch everything in parallel — no sequential stalling
                    const [customerRes, notesRes, txRes, jobsRes] = await Promise.all([
                        supabase.from('customers').select('*').eq('id', customerId).single(),
                        supabase.from('customer_notes').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
                        supabase.from('transactions').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
                        supabase.from('jobs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
                    ]);
                    setCustomer(customerRes.data);
                    setNotes(notesRes.data || []);
                    setTransactions(txRes.data || []);
                    setJobs(jobsRes.data || []);
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
                <div className="min-h-screen bg-[#0D0E2E] p-6">
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
                <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
                    <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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

        // ── Shared job badge helpers (used by JobDetailPage and JobsView) ──
        const getStatusBadge = (status) => {
            const badges = { pending:'badge-warning', in_progress:'badge-info', completed:'badge-success', invoiced:'badge-info', paid:'badge-success', cancelled:'badge-error' };
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

                // Use prop orgId, or fetch it directly if not loaded yet
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
                            <label style={labelStyle}>Job Title *</label>
                            <input type="text" placeholder="e.g. Roof repair, Plumbing inspection..." value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} />
                        </div>

                        <div style={{marginBottom:'1rem'}}>
                            <label style={labelStyle}>Description</label>
                            <textarea placeholder="Job details..." value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{...fieldStyle, resize:'vertical'}} />
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
                                <input type="number" step="0.01" placeholder="0.00" value={value} onChange={e => setValue(e.target.value)} style={fieldStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Scheduled Date</label>
                                <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} style={fieldStyle} />
                            </div>
                        </div>

                        <div style={{display:'flex',gap:'0.75rem'}}>
                            <button onClick={handleSubmit} disabled={loading}
                                style={{flex:1,padding:'12px',background:'#FFD93D',color:'#0D0E2E',border:'none',borderRadius:'8px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
                                {loading ? 'Creating...' : 'Create Job'}
                            </button>
                            <button onClick={onClose}
                                style={{flex:1,padding:'12px',background:'rgba(255,255,255,0.05)',color:'#e8e8ed',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            );
        };

        // Customers View
        const CustomersView = ({ customers, organization: orgProp, onUpdate }) => {
            const { user, organization: authOrg } = useAuth();
            const organization = orgProp || authOrg;
            // ALL hooks at the very top
            const [showAddModal, setShowAddModal] = useState(false);
            const [showRecordPage, setShowRecordPage] = useState(false);
            const [selectedCustomer, setSelectedCustomer] = useState(null);
            const [searchTerm, setSearchTerm] = useState('');
            const [importing, setImporting] = useState(false);
            const [importPreview, setImportPreview] = useState(null);
            // Add customer form state (inlined — no separate component)
            const [newName, setNewName] = useState('');
            const [newEmail, setNewEmail] = useState('');
            const [newPhone, setNewPhone] = useState('');
            const [newAddress, setNewAddress] = useState('');
            const [newNotes, setNewNotes] = useState('');
            const [saving, setSaving] = useState(false);
            const [saveError, setSaveError] = useState('');

            const filteredCustomers = (customers || []).filter(c =>
                (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
            );

            const openAddModal = () => {
                setNewName(''); setNewEmail(''); setNewPhone('');
                setNewAddress(''); setNewNotes(''); setSaveError('');
                setShowAddModal(true);
            };

            const handleSaveCustomer = async () => {
                if (!newName.trim()) { setSaveError('Name is required'); return; }
                setSaving(true); setSaveError('');

                // Use prop org, or fetch it directly if not loaded yet
                const orgId = organization?.id;
                if (!orgId) { setSaveError('Still loading your account — please wait 2 seconds and try again.'); setSaving(false); return; }

                const { error } = await supabase.from('customers').insert({
                    organization_id: orgId,
                    name: newName.trim(),
                    email: newEmail.trim(),
                    phone: newPhone.trim(),
                    address: newAddress.trim(),
                    notes: newNotes.trim(),
                });
                setSaving(false);
                if (error) { setSaveError(error.message); return; }
                setShowAddModal(false);
                onUpdate();
            };

            const handleCSVUpload = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const lines = evt.target.result.trim().split('\n');
                    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                    const rows = lines.slice(1).map(line => {
                        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
                        const obj = {};
                        headers.forEach((h, i) => obj[h.toLowerCase()] = vals[i] || '');
                        return obj;
                    }).filter(r => r.name || r.email);
                    setImportPreview(rows);
                };
                reader.readAsText(file);
            };

            const confirmImport = async () => {
                const orgId = organization?.id;
                if (!orgId) { alert('Still loading — please wait a moment and try again.'); return; }
                setImporting(true);
                for (const row of importPreview) {
                    await supabase.from('customers').insert({
                        organization_id: orgId,
                        name: row.name || row['full name'] || '',
                        email: row.email || '',
                        phone: row.phone || '',
                        address: row.address || '',
                        notes: row.notes || ''
                    });
                }
                setImportPreview(null);
                setImporting(false);
                onUpdate();
                alert('✅ Import complete!');
            };

            if (showRecordPage && selectedCustomer) {
                return (
                    <CustomerRecordPage
                        customerId={selectedCustomer.id}
                        onClose={() => { setShowRecordPage(false); setSelectedCustomer(null); onUpdate(); }}
                    />
                );
            }

            return (
                <div>
                    <div className="flex justify-between items-center mb-8 flex-wrap gap-3">
                        <h1 className="heading-font text-4xl font-bold">Customers</h1>
                        <div className="flex gap-3 flex-wrap">
                            <label className="btn-secondary cursor-pointer">
                                📂 Import CSV
                                <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                            </label>
                            <button className="btn-primary" onClick={openAddModal}>+ Add Customer</button>
                        </div>
                    </div>

                    <div className="glass-card p-6 mb-6">
                        <input type="text" className="input-field" placeholder="Search customers..."
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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
                                        <td className="p-4 font-medium text-[#FFD93D] hover:underline cursor-pointer"
                                            onClick={() => { setSelectedCustomer(customer); setShowRecordPage(true); }}>
                                            {customer.name}
                                        </td>
                                        <td className="p-4 text-gray-400">{customer.email || '-'}</td>
                                        <td className="p-4 text-gray-400">{customer.phone || '-'}</td>
                                        <td className="p-4"><span className="badge badge-success">Active</span></td>
                                        <td className="p-4 text-gray-400">{new Date(customer.created_at).toLocaleDateString()}</td>
                                        <td className="p-4">
                                            <button onClick={() => { setSelectedCustomer(customer); setShowRecordPage(true); }}
                                                className="btn-primary text-sm px-4 py-2">View Details</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredCustomers.length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                {searchTerm ? 'No customers found' : 'No customers yet. Click + Add Customer to get started!'}
                            </div>
                        )}
                    </div>
                    <div className="mt-4 text-sm text-gray-400">{(customers || []).length} customers</div>

                    {/* ── INLINE ADD CUSTOMER MODAL ── */}
                    {showAddModal && (
                        <div onClick={() => setShowAddModal(false)} style={{
                            position: 'fixed', inset: 0,
                            background: 'rgba(0,0,0,0.8)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 9999
                        }}>
                            <div onClick={e => e.stopPropagation()} style={{
                                background: '#1A1B4B',
                                border: '1px solid rgba(255,217,61,0.5)',
                                borderRadius: '12px',
                                padding: '2rem',
                                width: '100%', maxWidth: '480px',
                                maxHeight: '90vh', overflowY: 'auto',
                                color: '#e8e8ed'
                            }}>
                                <h2 style={{fontSize:'1.5rem', fontWeight:'700', marginBottom:'1.5rem'}}>Add New Customer</h2>

                                {saveError && (
                                    <div style={{background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)', color:'#f87171', padding:'0.75rem', borderRadius:'8px', marginBottom:'1rem', fontSize:'0.875rem'}}>
                                        {saveError}
                                    </div>
                                )}

                                {[
                                    { label: 'Name *', value: newName, setter: setNewName, type: 'text', placeholder: 'Customer name' },
                                    { label: 'Email', value: newEmail, setter: setNewEmail, type: 'email', placeholder: 'email@example.com' },
                                    { label: 'Phone', value: newPhone, setter: setNewPhone, type: 'tel', placeholder: 'Phone number' },
                                    { label: 'Address', value: newAddress, setter: setNewAddress, type: 'text', placeholder: 'Street address' },
                                ].map(f => (
                                    <div key={f.label} style={{marginBottom:'1rem'}}>
                                        <label style={{display:'block', fontSize:'0.875rem', fontWeight:'500', marginBottom:'0.5rem', color:'#A0A3C4'}}>{f.label}</label>
                                        <input type={f.type} placeholder={f.placeholder} value={f.value}
                                            onChange={e => f.setter(e.target.value)}
                                            style={{width:'100%', padding:'10px 14px', background:'rgba(26,27,75,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#e8e8ed', fontSize:'14px'}}
                                        />
                                    </div>
                                ))}

                                <div style={{marginBottom:'1.5rem'}}>
                                    <label style={{display:'block', fontSize:'0.875rem', fontWeight:'500', marginBottom:'0.5rem', color:'#A0A3C4'}}>Notes</label>
                                    <textarea placeholder="Any notes..." value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3}
                                        style={{width:'100%', padding:'10px 14px', background:'rgba(26,27,75,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#e8e8ed', fontSize:'14px', resize:'vertical'}}
                                    />
                                </div>

                                <div style={{display:'flex', gap:'0.75rem'}}>
                                    <button onClick={handleSaveCustomer} disabled={saving}
                                        style={{flex:1, padding:'12px', background:'#FFD93D', color:'#0D0E2E', border:'none', borderRadius:'8px', fontWeight:'600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1}}>
                                        {saving ? 'Adding...' : 'Add Customer'}
                                    </button>
                                    <button onClick={() => setShowAddModal(false)}
                                        style={{flex:1, padding:'12px', background:'rgba(255,255,255,0.05)', color:'#e8e8ed', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', fontWeight:'600', cursor:'pointer'}}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── CSV IMPORT MODAL ── */}
                    {importPreview && (
                        <div onClick={() => setImportPreview(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
                            <div onClick={e => e.stopPropagation()} style={{background:'#1A1B4B',border:'1px solid rgba(255,217,61,0.5)',borderRadius:'12px',padding:'2rem',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto',color:'#e8e8ed'}}>
                                <h2 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1rem'}}>Preview: {importPreview.length} customers</h2>
                                <div style={{maxHeight:'240px',overflowY:'auto',marginBottom:'1.5rem'}}>
                                    {importPreview.slice(0,10).map((row,i) => (
                                        <div key={i} style={{padding:'0.75rem',background:'rgba(255,255,255,0.05)',borderRadius:'8px',marginBottom:'0.5rem',fontSize:'0.875rem'}}>
                                            <div style={{fontWeight:'600'}}>{row.name||'(no name)'}</div>
                                            <div style={{color:'#A0A3C4'}}>{row.email} {row.phone?'· '+row.phone:''}</div>
                                        </div>
                                    ))}
                                    {importPreview.length > 10 && <div style={{color:'#A0A3C4',fontSize:'0.875rem'}}>...and {importPreview.length-10} more</div>}
                                </div>
                                <div style={{display:'flex',gap:'0.75rem'}}>
                                    <button onClick={confirmImport} disabled={importing} style={{flex:1,padding:'12px',background:'#FFD93D',color:'#0D0E2E',border:'none',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>
                                        {importing ? 'Importing...' : `Import ${importPreview.length}`}
                                    </button>
                                    <button onClick={() => setImportPreview(null)} style={{flex:1,padding:'12px',background:'rgba(255,255,255,0.05)',color:'#e8e8ed',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        // Add Customer Modal
        const AddCustomerModal = ({ organizationId, onClose, onSuccess }) => {
            const [name, setName] = useState('');
            const [email, setEmail] = useState('');
            const [phone, setPhone] = useState('');
            const [address, setAddress] = useState('');
            const [notes, setNotes] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            const handleSubmit = async () => {
                if (!name.trim()) {
                    setError('Name is required');
                    return;
                }
                setLoading(true);
                setError('');
                try {
                    const { data, error: dbError } = await supabase
                        .from('customers')
                        .insert({
                            name: name.trim(),
                            email: email.trim(),
                            phone: phone.trim(),
                            address: address.trim(),
                            notes: notes.trim(),
                            organization_id: organizationId
                        })
                        .select();

                    if (dbError) {
                        setError(dbError.message);
                        setLoading(false);
                        return;
                    }
                    onSuccess();
                } catch (err) {
                    setError(err.message || 'Something went wrong');
                    setLoading(false);
                }
            };

            return (
                <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}} onClick={onClose}>
                    <div style={{background:'#1A1B4B',border:'1px solid rgba(255,217,61,0.25)',borderRadius:'16px',padding:'2rem',width:'90%',maxWidth:'500px',maxHeight:'90vh',overflowY:'auto'}} onClick={(e) => e.stopPropagation()}>
                        <h2 className="heading-font text-2xl font-bold mb-6">Add New Customer</h2>

                        {error && (
                            <div style={{background:'rgba(239,68,68,0.2)',border:'1px solid rgba(239,68,68,0.5)',color:'#f87171',padding:'0.75rem 1rem',borderRadius:'8px',marginBottom:'1rem',fontSize:'0.875rem'}}>
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Name *</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Customer name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Email</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="email@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Phone</label>
                                <input
                                    type="tel"
                                    className="input-field"
                                    placeholder="Phone number"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Address</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Street address"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Notes</label>
                                <textarea
                                    className="input-field"
                                    rows="3"
                                    placeholder="Any notes about this customer..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className="btn-primary flex-1"
                                >
                                    {loading ? 'Adding...' : 'Add Customer'}
                                </button>
                                <button onClick={onClose} className="btn-secondary flex-1">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // Jobs View (Simplified)
        // ============================================
        // JOB DETAIL PAGE COMPONENT
        // ============================================
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
                    // Fetch job and notes in parallel
                    const [jobRes, notesRes] = await Promise.all([
                        supabase.from('jobs').select('*').eq('id', jobId).single(),
                        supabase.from('customer_notes').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
                    ]);
                    const jobData = jobRes.data;
                    setJob(jobData);
                    setNotes(notesRes.data || []);

                    // If job has a customer, fetch customer + transactions in parallel
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
                return React.createElement('div', { className: 'min-h-screen flex items-center justify-center p-6' },
                    React.createElement('div', { className: 'glass-card p-8 text-center' },
                        React.createElement('h2', { className: 'text-2xl font-bold mb-4' }, 'Job Not Found'),
                        React.createElement('button', { onClick: onClose, className: 'btn-primary' }, 'Go Back')
                    )
                );
            }

            return (
                <div className="min-h-screen bg-[#0D0E2E] p-6">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <button onClick={onClose} className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">← Back to Jobs</button>
                                <h1 className="heading-font text-4xl font-bold mb-2">{job.title}</h1>
                                <div className="flex gap-3 mb-4">
                                    <span className={`badge ${getStatusBadge(job.status)}`}>{(job.status || 'pending').replace('_', ' ')}</span>
                                    <span className={`badge ${getPriorityBadge(job.priority)}`}>{job.priority || 'medium'}</span>
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
                                {notes.length === 0 && (
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
                <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
                    <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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
                    const paymentUrl = `${STRIPE_TEAM_PAYMENT_LINK}?prefilled_email=${encodeURIComponent(formData.email)}&client_reference_id=${encodeURIComponent('team_member_' + formData.email)}`;
                    window.location.href = paymentUrl;
                    
                    onSuccess(); // Close modal
                } catch (err) {
                    alert('Error: ' + err.message);
                    setLoading(false);
                }
            };

            return (
                <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
                    <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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
                                             className="bg-white/5 p-4 rounded border border-gray-700 hover:border-[#FFD93D] cursor-move hover:bg-white/10 transition-all">
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

        // Get org id — use prop or fetch directly
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
        console.log('[CreateDeal] inserting:', payload);

        const { data: inserted, error: dbError } = await supabase.from('deals').insert(payload).select().single();
        console.log('[CreateDeal] result — data:', inserted, '  error:', dbError);

        setLoading(false);
        if (dbError) { 
            console.error('[CreateDeal] FAILED:', dbError);
            setError(dbError.message);
            alert('Deal save failed: ' + dbError.message);
            return; 
        }
        onSuccess();
    };

    const fieldStyle = {width:'100%',padding:'10px 14px',background:'rgba(17,18,54,0.90)',border:'1px solid rgba(160,163,196,0.20)',borderRadius:'8px',color:'#E8E8F0',fontSize:'14px'};
    const labelStyle = {display:'block',fontSize:'0.8rem',fontWeight:'500',marginBottom:'0.4rem',color:'#A0A3C4'};

    return (
        <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
            <div onClick={e => e.stopPropagation()} style={{background:'#1A1B4B',border:'1px solid rgba(255,217,61,0.25)',borderRadius:'16px',padding:'2rem',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto',color:'#E8E8F0'}}>
                <h2 style={{fontSize:'1.5rem',fontWeight:'700',marginBottom:'1.5rem'}}>Create New Deal</h2>

                {error && (
                    <div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171',padding:'0.75rem',borderRadius:'8px',marginBottom:'1rem',fontSize:'0.875rem'}}>
                        {error}
                    </div>
                )}

                <div style={{marginBottom:'1rem'}}>
                    <label style={labelStyle}>Deal Title *</label>
                    <input type="text" placeholder="e.g. Website Redesign for Acme Co" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} />
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
                    <div>
                        <label style={labelStyle}>Customer</label>
                        <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={fieldStyle}>
                            <option value="">Select customer...</option>
                            {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Value ($)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={value} onChange={e => setValue(e.target.value)} style={fieldStyle} />
                    </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
                    <div>
                        <label style={labelStyle}>Stage</label>
                        <select value={stage} onChange={e => setStage(e.target.value)} style={fieldStyle}>
                            <option value="lead">Lead</option>
                            <option value="contacted">Contacted</option>
                            <option value="qualified">Qualified</option>
                            <option value="proposal">Proposal</option>
                            <option value="negotiation">Negotiation</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Probability (%)</label>
                        <input type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} style={fieldStyle} />
                    </div>
                </div>

                <div style={{marginBottom:'1rem'}}>
                    <label style={labelStyle}>Next Follow-up Date</label>
                    <input type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} style={fieldStyle} />
                </div>

                <div style={{marginBottom:'1.5rem'}}>
                    <label style={labelStyle}>Description</label>
                    <textarea placeholder="Deal notes..." value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{...fieldStyle, resize:'vertical'}} />
                </div>

                <div style={{display:'flex',gap:'0.75rem'}}>
                    <button onClick={handleSubmit} disabled={loading}
                        style={{flex:1,padding:'12px',background:'#FFD93D',color:'#0D0E2E',border:'none',borderRadius:'8px',fontWeight:'700',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
                        {loading ? 'Creating...' : 'Create Deal'}
                    </button>
                    <button onClick={onClose}
                        style={{flex:1,padding:'12px',background:'rgba(160,163,196,0.1)',color:'#E8E8F0',border:'1px solid rgba(160,163,196,0.25)',borderRadius:'8px',fontWeight:'600',cursor:'pointer'}}>
                        Cancel
                    </button>
                </div>
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
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
            <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
            <div style={{background:"#1A1B4B",border:"1px solid rgba(255,217,61,0.25)",borderRadius:"16px",padding:"2rem",width:"90%",maxWidth:"520px",maxHeight:"90vh",overflowY:"auto"}} onClick={(e) => e.stopPropagation()}>
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
            const { user } = useAuth();
            const [activeSettingsTab, setActiveSettingsTab] = useState('general');
            
            const getSubscriptionStatus = () => {
                if (organization.subscription_status === 'active') {
                    return { label: 'Active', class: 'badge-success' };
                } else if (organization.subscription_status === 'cancelled') {
                    return { label: 'Cancelled', class: 'badge-error' };
                } else {
                    return { label: 'Inactive', class: 'badge-warning' };
                }
            };
            
            const handleManageBilling = () => {
                const email = user?.email || '';
                const url = `${STRIPE_PAYMENT_LINK}?prefilled_email=${encodeURIComponent(email)}`;
                window.open(url, '_blank');
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
                                    <div className="text-lg font-semibold text-[#FFD93D]">
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
                                            {organization.subscription_status || 'Active'}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={handleManageBilling} className="btn-primary">
                                    Manage Subscription
                                </button>
                                <div className="bg-[#FFD93D]/10 border border-[#FFD93D]/30 text-[#FFD93D] px-4 py-3 rounded-lg text-sm">
                                    <strong>$27/user/month</strong> — Add team members from the Team tab
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        // ============================================
        // REPORTS VIEW
        // ============================================
        const ReportsView = ({ customers, jobs, tasks }) => {
            const completedJobs = jobs.filter(j => j.status === 'completed');
            const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
            const totalRevenue = completedJobs.reduce((sum, j) => sum + (j.value || 0), 0);
            const avgJobValue = completedJobs.length ? totalRevenue / completedJobs.length : 0;
            const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed');

            // Jobs by status
            const jobStatuses = ['new', 'scheduled', 'in_progress', 'completed', 'cancelled'];
            const jobsByStatus = jobStatuses.map(s => ({
                label: s.replace('_', ' '),
                count: jobs.filter(j => j.status === s).length,
                color: s === 'completed' ? '#22c55e' : s === 'cancelled' ? '#ef4444' : s === 'in_progress' ? '#FFD93D' : s === 'scheduled' ? '#f59e0b' : '#6b7280'
            }));

            // Revenue by month (last 6 months)
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const label = d.toLocaleString('default', { month: 'short' });
                const revenue = completedJobs
                    .filter(j => j.completed_at && new Date(j.completed_at).getMonth() === d.getMonth() && new Date(j.completed_at).getFullYear() === d.getFullYear())
                    .reduce((sum, j) => sum + (j.value || 0), 0);
                months.push({ label, revenue });
            }
            const maxRevenue = Math.max(...months.map(m => m.revenue), 1);

            // Tasks by priority
            const priorities = ['urgent', 'high', 'medium', 'low'];
            const tasksByPriority = priorities.map(p => ({
                label: p,
                count: tasks.filter(t => t.priority === p).length,
                color: p === 'urgent' ? '#ef4444' : p === 'high' ? '#f59e0b' : p === 'medium' ? '#FFD93D' : '#22c55e'
            }));

            const Bar = ({ value, max, color }) => (
                <div className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-gray-800 rounded-t" style={{height: '120px', display: 'flex', alignItems: 'flex-end'}}>
                        <div className="w-full rounded-t transition-all" style={{height: `${(value/max)*100}%`, backgroundColor: color, minHeight: value > 0 ? '4px' : '0'}}></div>
                    </div>
                </div>
            );

            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Reports</h1>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        {[
                            { label: 'Total Revenue', value: '$' + totalRevenue.toLocaleString(), icon: '💰' },
                            { label: 'Avg Job Value', value: '$' + Math.round(avgJobValue).toLocaleString(), icon: '📊' },
                            { label: 'Active Jobs', value: activeJobs.length, icon: '🔧' },
                            { label: 'Overdue Tasks', value: overdueTasks.length, icon: '⚠️' },
                        ].map((kpi, i) => (
                            <div key={i} className="glass-card p-5">
                                <div className="text-2xl mb-2">{kpi.icon}</div>
                                <div className="text-2xl font-bold mb-1">{kpi.value}</div>
                                <div className="text-gray-400 text-sm">{kpi.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        {/* Revenue by Month */}
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-6">Revenue Last 6 Months</h2>
                            <div className="flex items-end gap-2" style={{height: '140px'}}>
                                {months.map((m, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="w-full bg-gray-800 rounded-t" style={{height: '120px', display: 'flex', alignItems: 'flex-end'}}>
                                            <div className="w-full rounded-t transition-all" style={{height: `${(m.revenue/maxRevenue)*100}%`, backgroundColor: '#FFD93D', minHeight: m.revenue > 0 ? '4px' : '0'}}></div>
                                        </div>
                                        <div className="text-xs text-gray-400">{m.label}</div>
                                        {m.revenue > 0 && <div className="text-xs font-bold">${m.revenue.toLocaleString()}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Jobs by Status */}
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
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Tasks by Priority */}
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-6">Tasks by Priority</h2>
                            <div className="space-y-3">
                                {tasksByPriority.map((p, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-16 text-sm capitalize text-gray-400">{p.label}</div>
                                        <div className="flex-1 bg-gray-800 rounded-full h-3">
                                            <div className="h-3 rounded-full" style={{width: tasks.length ? `${(p.count / tasks.length) * 100}%` : '0%', backgroundColor: p.color}}></div>
                                        </div>
                                        <div className="w-8 text-sm font-bold text-right">{p.count}</div>
                                    </div>
                                ))}
                                {tasks.length === 0 && <div className="text-gray-400 text-sm">No tasks yet</div>}
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold mb-6">Summary</h2>
                            <div className="space-y-4">
                                {[
                                    { label: 'Total Customers', value: customers.length },
                                    { label: 'Total Jobs', value: jobs.length },
                                    { label: 'Completed Jobs', value: completedJobs.length },
                                    { label: 'Total Tasks', value: tasks.length },
                                    { label: 'Completed Tasks', value: tasks.filter(t => t.status === 'completed').length },
                                    { label: 'Pending Tasks', value: tasks.filter(t => t.status !== 'completed').length },
                                ].map((item, i) => (
                                    <div key={i} className="flex justify-between items-center border-b border-gray-800 pb-3">
                                        <span className="text-gray-400">{item.label}</span>
                                        <span className="font-bold text-xl">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // ============================================
        // CALENDAR VIEW
        // ============================================
        const CalendarView = ({ tasks, jobs, onUpdate }) => {
            const [currentDate, setCurrentDate] = useState(new Date());
            const [selectedDay, setSelectedDay] = useState(null);

            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const monthName = currentDate.toLocaleString('default', { month: 'long' });

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
            const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

            const getItemsForDay = (day) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayTasks = tasks.filter(t => t.due_date && t.due_date.startsWith(dateStr));
                const dayJobs = jobs.filter(j => j.scheduled_date && j.scheduled_date.startsWith(dateStr));
                return { tasks: dayTasks, jobs: dayJobs };
            };

            const today = new Date();
            const isToday = (day) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

            const selectedItems = selectedDay ? getItemsForDay(selectedDay) : null;

            return (
                <div>
                    <h1 className="heading-font text-4xl font-bold mb-8">Calendar</h1>

                    <div className="glass-card p-6 mb-6">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={prevMonth} className="btn-secondary px-4">&#8592;</button>
                            <h2 className="heading-font text-2xl font-bold">{monthName} {year}</h2>
                            <button onClick={nextMonth} className="btn-secondary px-4">&#8594;</button>
                        </div>

                        {/* Day labels */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                                <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {/* Empty cells before first day */}
                            {Array.from({length: firstDay}).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}

                            {/* Day cells */}
                            {Array.from({length: daysInMonth}).map((_, i) => {
                                const day = i + 1;
                                const items = getItemsForDay(day);
                                const hasItems = items.tasks.length > 0 || items.jobs.length > 0;
                                const selected = selectedDay === day;

                                return (
                                    <div
                                        key={day}
                                        onClick={() => setSelectedDay(selected ? null : day)}
                                        className={`aspect-square rounded-lg p-1 cursor-pointer flex flex-col items-center transition-all ${
                                            selected ? 'bg-[#FFD93D]' :
                                            isToday(day) ? 'bg-[#FFD93D]/30 border border-[#FFD93D]' :
                                            hasItems ? 'bg-gray-800 hover:bg-gray-700' :
                                            'hover:bg-gray-800'
                                        }`}
                                    >
                                        <div className={`text-sm font-medium ${isToday(day) ? 'text-white' : 'text-gray-300'}`}>{day}</div>
                                        {items.tasks.length > 0 && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-0.5"></div>
                                        )}
                                        {items.jobs.length > 0 && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-0.5"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex gap-4 mt-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> Tasks</div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400"></div> Jobs</div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FFD93D]"></div> Today</div>
                        </div>
                    </div>

                    {/* Selected day detail */}
                    {selectedDay && selectedItems && (
                        <div className="glass-card p-6">
                            <h3 className="heading-font text-xl font-bold mb-4">
                                {monthName} {selectedDay}, {year}
                            </h3>
                            {selectedItems.tasks.length === 0 && selectedItems.jobs.length === 0 && (
                                <div className="text-gray-400">Nothing scheduled for this day</div>
                            )}
                            {selectedItems.tasks.length > 0 && (
                                <div className="mb-4">
                                    <div className="text-sm font-medium text-yellow-400 mb-2">📋 Tasks</div>
                                    <div className="space-y-2">
                                        {selectedItems.tasks.map(task => (
                                            <div key={task.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                                                <div className={`badge badge-${task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'info'}`}>{task.priority}</div>
                                                <div className="flex-1">{task.title}</div>
                                                <div className={`badge badge-${task.status === 'completed' ? 'success' : 'warning'}`}>{task.status}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedItems.jobs.length > 0 && (
                                <div>
                                    <div className="text-sm font-medium text-green-400 mb-2">🔧 Jobs</div>
                                    <div className="space-y-2">
                                        {selectedItems.jobs.map(job => (
                                            <div key={job.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                                                <div className="flex-1">{job.title}</div>
                                                <div className="badge badge-info">{job.status}</div>
                                                {job.value && <div className="text-green-400 font-medium">${job.value}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        };


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
                    <div className="min-h-screen bg-[#0D0E2E] flex items-center justify-center">
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
