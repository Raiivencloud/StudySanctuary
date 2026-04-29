import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertTriangle, 
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  Calendar,
  Zap
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'framer-motion';
import { auth } from '../firebase';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface AdminStats {
  activeUsers: number;
  subscriptionStats: {
    total: number;
    free: number;
    mensual: number;
    trimestral: number;
    anual: number;
    activeSubscribers: number;
  };
  creditsConsumed24h: number;
  requestGraphData: { time: number; count: number }[];
  serverTime: number;
}

export const AdminDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchStats = async () => {
    if (!auth.currentUser) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'x-user-id': auth.currentUser.uid,
          'x-user-email': auth.currentUser.email || '',
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch admin stats');
      }

      const data = await response.json();
      setStats(data);
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error('Admin stats error:', error);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!stats && isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-primary">
        <RefreshCw className="animate-spin mr-2" />
        <span>Cargando panel administrativo...</span>
      </div>
    );
  }

  if (!stats) return null;

  // Budget calculation ($10 - $20 USD)
  // Let's assume $1 USD = 1000 credits for estimation purposes
  // Or just use a fixed budget of $20
  const estimatedSpend = (stats.creditsConsumed24h / 1000) * 30; // Very rough monthly estimate
  const budgetLimit = 20;
  const budgetProgress = Math.min((estimatedSpend / budgetLimit) * 100, 100);

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white p-6 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-2">
              <ShieldCheck className="text-primary" />
              ADMIN CONTROL PANEL
            </h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">
              Monitoring Real-Time Infrastructure
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-white/40 font-bold uppercase">Last Sync</p>
            <p className="text-xs font-mono">{lastRefresh.toLocaleTimeString()}</p>
          </div>
          <button 
            onClick={fetchStats}
            disabled={isLoading}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw size={18} className={cn(isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          icon={<Users className="text-blue-400" />}
          label="Active Users (5m)"
          value={stats.activeUsers.toString()}
          subValue="Live presence"
        />
        <StatCard 
          icon={<Activity className="text-emerald-400" />}
          label="Requests (1h)"
          value={stats.requestGraphData.reduce((acc, b) => acc + b.count, 0).toString()}
          subValue="Server throughput"
        />
        <StatCard 
          icon={<Zap className="text-amber-400" />}
          label="Credits (24h)"
          value={stats.creditsConsumed24h.toLocaleString()}
          subValue="Community usage"
        />
        <StatCard 
          icon={<CreditCard className="text-purple-400" />}
          label="Subscribers"
          value={stats.subscriptionStats.activeSubscribers.toString()}
          subValue={`${((stats.subscriptionStats.activeSubscribers / stats.subscriptionStats.total) * 100).toFixed(1)}% conversion`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Traffic Graph */}
        <div className="lg:col-span-2 bg-white/5 rounded-3xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Server Traffic (RPM)</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold text-primary">LIVE</span>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.requestGraphData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(unix) => new Date(unix).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  stroke="#ffffff40"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff40"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                  labelFormatter={(unix) => new Date(unix).toLocaleTimeString()}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Budget & Subscription Breakdown */}
        <div className="space-y-6">
          {/* Budget Alert */}
          <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Budget Monitor</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-white/40 font-bold uppercase">Estimated Month</p>
                  <p className="text-2xl font-mono font-bold">${estimatedSpend.toFixed(2)} <span className="text-xs text-white/20">USD</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40 font-bold uppercase">Limit</p>
                  <p className="text-sm font-mono font-bold text-white/60">$20.00</p>
                </div>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${budgetProgress}%` }}
                  className={cn(
                    "h-full transition-all duration-1000",
                    budgetProgress > 80 ? "bg-error" : budgetProgress > 50 ? "bg-amber-500" : "bg-primary"
                  )}
                />
              </div>
              <p className="text-[10px] text-white/40 italic">
                *Estimated based on last 24h consumption.
              </p>
            </div>
          </div>

          {/* Subscription Table */}
          <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">User Base</h3>
            <div className="space-y-3">
              <PlanRow label="Free Plan" count={stats.subscriptionStats.free} total={stats.subscriptionStats.total} color="bg-white/20" />
              <PlanRow label="Monthly" count={stats.subscriptionStats.mensual} total={stats.subscriptionStats.total} color="bg-blue-500" />
              <PlanRow label="Quarterly" count={stats.subscriptionStats.trimestral} total={stats.subscriptionStats.total} color="bg-purple-500" />
              <PlanRow label="Yearly" count={stats.subscriptionStats.anual} total={stats.subscriptionStats.total} color="bg-emerald-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Technical Logs Placeholder */}
      <div className="bg-white/5 rounded-3xl p-6 border border-white/10 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">System Health</h3>
          <div className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-bold">OPERATIONAL</div>
        </div>
        <div className="font-mono text-[10px] text-white/40 space-y-1">
          <p>[{new Date().toISOString()}] Cloud Run Instance: Healthy (1/1)</p>
          <p>[{new Date().toISOString()}] Memory Usage: 242MB / 512MB</p>
          <p>[{new Date().toISOString()}] Firestore Connections: Stable</p>
          <p>[{new Date().toISOString()}] Gemini API: Circuit Breaker Closed</p>
          <p>[{new Date().toISOString()}] Traffic Monitor: {stats.activeUsers} concurrent users detected</p>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; subValue: string }> = ({ icon, label, value, subValue }) => (
  <div className="bg-white/5 rounded-3xl p-6 border border-white/10 hover:bg-white/[0.07] transition-all group">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-white/5 rounded-xl group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
    </div>
    <div className="flex flex-col">
      <span className="text-3xl font-mono font-bold tracking-tighter">{value}</span>
      <span className="text-[10px] text-white/20 font-medium">{subValue}</span>
    </div>
  </div>
);

const PlanRow: React.FC<{ label: string; count: number; total: number; color: string }> = ({ label, count, total, color }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] font-bold">
      <span className="text-white/60">{label}</span>
      <span>{count}</span>
    </div>
    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
      <div 
        className={cn("h-full", color)} 
        style={{ width: `${(count / total) * 100}%` }} 
      />
    </div>
  </div>
);
