        ; return; }

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

            if (isAdminRoute && user && isSuperAdmin) {
                return <SuperAdminDashboard />;
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
