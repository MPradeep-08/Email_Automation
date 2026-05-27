import React, { useState, useEffect } from 'react';
import { Activity, Sparkles, Cpu, Layers, HardDrive, Users, CheckSquare, Inbox, Smile, ShieldCheck, Clock } from 'lucide-react';
import { cn } from '../utils';

const BACKEND_URL = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'http://localhost:5000';

export function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/analytics`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error("Failed to fetch analytics metrics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-12 text-center text-slate-500 font-semibold text-xs animate-fade-in flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        Aggregating SaaS statistics...
      </div>
    );
  }

  // Calculate stats
  const autoSendPercent = data.totalCount > 0 ? Math.round((data.autoSentCount / data.totalCount) * 100) : 0;
  const humanApprovedCount = Math.max(0, data.sentCount - data.autoSentCount);

  // Time savings: 5 mins per auto-sent email, 2 mins per human approved (since AI drafted it first!)
  const timeSavedMinutes = (data.autoSentCount * 5) + (humanApprovedCount * 2);
  const timeSavedHours = (timeSavedMinutes / 60).toFixed(1);

  // Department ratios
  const maxDeptCount = Math.max(1, ...Object.values(data.departmentDistribution));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Ingestion */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Volume</p>
            <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{data.totalCount}</h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1">Processed email hooks</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Inbox className="w-5 h-5" />
          </div>
        </div>

        {/* Automation Rate */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Automation Rate</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{autoSendPercent}%</h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1">{data.autoSentCount} replies auto-sent</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Average AI Confidence */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Certainty</p>
            <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{Math.round(data.avgConfidence * 100)}%</h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1">Average confidence score</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Labor Savings */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Labor Time Saved</p>
            <h3 className="text-2xl font-extrabold text-violet-600 mt-1">{timeSavedHours}h</h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1 font-sans">Estimated support hours saved</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Category Distribution */}
        <div className="bg-white rounded-xl p-6 border border-slate-200/60 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            Routing Shares by Assigned Department
          </h3>
          
          <div className="space-y-5 flex-1 flex flex-col justify-center">
            {Object.entries(data.departmentDistribution).map(([dept, count]) => {
              const pct = data.totalCount > 0 ? Math.round((count / data.totalCount) * 100) : 0;
              const barWidth = Math.round((count / maxDeptCount) * 100);
              
              let barColor = "bg-slate-400";
              let badgeColor = "bg-slate-100 text-slate-700";
              if (dept === 'Billing') {
                barColor = "bg-amber-500";
                badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
              } else if (dept === 'HR/Internship') {
                barColor = "bg-indigo-500";
                badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
              } else if (dept === 'Technical') {
                barColor = "bg-emerald-500";
                badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
              }

              return (
                <div key={dept} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border uppercase", badgeColor)}>
                      {dept}
                    </span>
                    <span className="font-bold text-slate-600">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-1000", barColor)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Card: Security & Storage Health */}
        <div className="bg-white rounded-xl p-6 border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              SaaS Shield & Storage Status
            </h3>

            <div className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  Storage Directory:
                </span>
                <span className="text-slate-800 font-bold">Safe Prefixing Active</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span>Executable Filters:</span>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Whitelist Block Enabled
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span>Ingested Attachments:</span>
                <span className="text-slate-800 font-bold">{data.totalAttachmentsCount} files</span>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100/50 flex gap-3 text-emerald-900 text-[11px] leading-relaxed font-medium">
            <Smile className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-emerald-950 block">AI Operations Healthy</span>
              Your Caldim system is running on Llama-3.3-70b-versatile. Non-financial workflows are routing autopilot replies cleanly.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
