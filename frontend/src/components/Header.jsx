import { Activity, Mail, Inbox, Send } from 'lucide-react';

export function Header({ metrics }) {
  return (
    <header className="bg-white border-b border-slate-200/60 sticky top-0 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              System Listening to <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-sm font-semibold">caldiminternship@gmail.com</span>
            </h1>
          </div>
          
          <div className="flex space-x-4">
            <MetricBadge 
              icon={<Mail className="w-4 h-4 text-slate-500" />}
              label="Total Ingested"
              value={metrics.total}
            />
            <MetricBadge 
              icon={<Inbox className="w-4 h-4 text-amber-500" />}
              label="Pending Review"
              value={metrics.pending}
            />
            <MetricBadge 
              icon={<Send className="w-4 h-4 text-emerald-500" />}
              label="Sent Replies"
              value={metrics.sent}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function MetricBadge({ icon, label, value }) {
  return (
    <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-1.5 shadow-sm">
      {icon}
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
