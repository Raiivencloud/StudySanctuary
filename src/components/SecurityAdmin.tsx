import React, { useState, useEffect } from 'react';
import { ShieldAlert, Terminal, Activity, DollarSign, Power, Lock, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  totalRequestsToday: number;
  estimatedCost: number;
  isAiSuspendedForFree: boolean;
  serverTime: number;
}

interface SecurityAdminProps {
  isAuthenticated: boolean;
  onAuthenticated: () => void;
  onExit: () => void;
}

const SecurityAdmin: React.FC<SecurityAdminProps> = ({ isAuthenticated, onAuthenticated, onExit }) => {
  const [adminKey, setAdminKey] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey })
      });
      if (res.ok) {
        onAuthenticated();
        fetchStats();
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid Admin Key');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: {
          'x-user-email': 'Agusgestro17@gmail.com' // Still needed for backend check
        }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };

  const toggleAi = async () => {
    if (!stats) return;
    setToggling(true);
    try {
      const res = await fetch('/api/admin/toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey, suspend: !stats.isAiSuspendedForFree })
      });
      if (res.ok) {
        fetchStats();
      }
    } catch (err) {
      console.error("Failed to toggle AI", err);
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl backdrop-blur-xl"
        >
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
              <Lock className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2 font-mono uppercase tracking-widest">
            Astra Core Admin
          </h1>
          <p className="text-zinc-500 text-center mb-8 text-sm">
            Restricted access. Enter security key to continue.
          </p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="ADMIN_SECRET_KEY"
                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors font-mono"
                required
              />
            </div>
            {error && (
              <p className="text-red-500 text-xs text-center font-mono">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'VERIFYING...' : 'ACCESS CORE'}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="w-full bg-transparent hover:bg-zinc-800 text-zinc-500 font-bold py-2 rounded-xl transition-all text-xs uppercase tracking-widest"
            >
              EXIT
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white p-6 font-mono overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-8 h-8 text-red-500" />
              <h1 className="text-3xl font-bold tracking-tighter uppercase">Astra Security Console</h1>
            </div>
            <p className="text-zinc-500">System Health & Emergency Controls</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onExit}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs uppercase tracking-widest transition-colors"
            >
              EXIT CONSOLE
            </button>
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs uppercase">Cloud Run: Active</span>
            </div>
          </div>
        </div>

        {/* Financial Health Monitor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
            <div className="flex items-center gap-3 mb-4 text-zinc-500">
              <Activity className="w-5 h-5" />
              <span className="text-xs uppercase font-bold">Total Requests Today</span>
            </div>
            <div className="text-6xl font-bold tracking-tighter text-white">
              {stats?.totalRequestsToday || 0}
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
            <div className="flex items-center gap-3 mb-4 text-zinc-500">
              <DollarSign className="w-5 h-5" />
              <span className="text-xs uppercase font-bold">Estimated Cost</span>
            </div>
            <div className="text-6xl font-bold tracking-tighter text-green-500">
              ${stats?.estimatedCost.toFixed(4) || '0.0000'}
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
            <div className="flex items-center gap-3 mb-4 text-zinc-500">
              <Terminal className="w-5 h-5" />
              <span className="text-xs uppercase font-bold">Active Users</span>
            </div>
            <div className="text-6xl font-bold tracking-tighter text-blue-500">
              {stats?.activeUsers || 0}
            </div>
          </div>
        </div>

        {/* Emergency Kill-Switch */}
        <div className="bg-red-950/20 border border-red-900/50 p-8 rounded-2xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-6 h-6" />
                <h2 className="text-xl font-bold uppercase">Emergency Kill-Switch</h2>
              </div>
              <p className="text-zinc-400 max-w-xl">
                Suspend all AI queries for free users immediately. Premium users will not be affected. 
                Use this in case of unexpected cost spikes or rate limit loops.
              </p>
            </div>
            <button
              onClick={toggleAi}
              disabled={toggling}
              className={`px-8 py-6 rounded-2xl font-black text-xl uppercase transition-all flex items-center gap-3 ${
                stats?.isAiSuspendedForFree 
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20' 
                : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20'
              }`}
            >
              <Power className="w-8 h-8" />
              {toggling ? 'PROCESSING...' : stats?.isAiSuspendedForFree ? 'RESUME AI (FREE)' : 'SUSPEND AI (FREE)'}
            </button>
          </div>
          
          {stats?.isAiSuspendedForFree && (
            <div className="mt-6 p-4 bg-red-900/20 border border-red-900/30 rounded-xl text-red-400 text-sm flex items-center gap-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              SYSTEM ALERT: AI ENGINE IS CURRENTLY SUSPENDED FOR FREE USERS.
            </div>
          )}
        </div>

        {/* Traffic Graph */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
          <h3 className="text-lg font-bold uppercase mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-zinc-500" />
            Traffic History (Last Hour)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.requestGraphData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#525252" 
                  fontSize={10}
                  tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis stroke="#525252" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #27272a', borderRadius: '8px' }}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  dot={false}
                  animationDuration={1000}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityAdmin;
