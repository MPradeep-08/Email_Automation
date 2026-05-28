import { useState, useEffect } from 'react';
import { Search, User, Mail, Calendar, Clock, ChevronRight, MessageSquare } from 'lucide-react';
import { cn } from '../utils';

const BACKEND_URL = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'http://localhost:5000';

export function ContactsCRM({ onSelectTicket }) {
  const [senders, setSenders] = useState([]);
  const [selectedSender, setSelectedSender] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Autopilot configuration local states
  const [mode, setMode] = useState('DEFAULT');
  const [expiryType, setExpiryType] = useState('preset'); // 'preset' | 'custom'
  const [duration, setDuration] = useState(null);
  const [customUntil, setCustomUntil] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('00:00');
  const [scheduleEnd, setScheduleEnd] = useState('23:59');
  const [scheduleDays, setScheduleDays] = useState(['1', '2', '3', '4', '5', '6', '0']);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'success' | 'error'

  const DAYS_OF_WEEK = [
    { label: 'Su', value: '0' },
    { label: 'M', value: '1' },
    { label: 'T', value: '2' },
    { label: 'W', value: '3' },
    { label: 'Th', value: '4' },
    { label: 'F', value: '5' },
    { label: 'Sa', value: '6' }
  ];

  const fetchSenders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/senders`);
      if (res.ok) {
        const data = await res.json();
        setSenders(data.senders || []);
        if (data.senders && data.senders.length > 0) {
          // Keep current selection if valid, otherwise select first
          setSelectedSender(prev => {
            const stillExists = data.senders.find(s => s.sender_email === prev?.sender_email);
            return stillExists || data.senders[0];
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch sender profiles:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSenders();
  }, []);

  useEffect(() => {
    if (selectedSender) {
      setMode(selectedSender.autopilot_mode || 'DEFAULT');
      setScheduleEnabled(selectedSender.autopilot_schedule_enabled === 1);
      setScheduleStart(selectedSender.autopilot_schedule_start || '00:00');
      setScheduleEnd(selectedSender.autopilot_schedule_end || '23:59');
      
      const days = selectedSender.autopilot_schedule_days 
        ? selectedSender.autopilot_schedule_days.split(',').map(d => d.trim())
        : ['1', '2', '3', '4', '5', '6', '0'];
      setScheduleDays(days);

      if (selectedSender.autopilot_until) {
        try {
          const d = new Date(selectedSender.autopilot_until);
          if (!isNaN(d.getTime())) {
            // Convert UTC to local ISO representation for datetime-local
            const offset = d.getTimezoneOffset();
            const localDate = new Date(d.getTime() - (offset * 60 * 1000));
            setCustomUntil(localDate.toISOString().substring(0, 16));
            setExpiryType('custom');
          } else {
            setCustomUntil('');
            setExpiryType('preset');
          }
        } catch {
          setCustomUntil('');
          setExpiryType('preset');
        }
      } else {
        setCustomUntil('');
        setExpiryType('preset');
      }
      setDuration(null);
    }
  }, [selectedSender]);

  const handleSaveAutopilot = async () => {
    if (!selectedSender) return;
    setSaveStatus('saving');
    
    let finalUntil = null;
    let finalDurationHours = null;
    
    if (mode === 'ALWAYS') {
      if (expiryType === 'preset') {
        finalDurationHours = duration;
      } else {
        if (!customUntil) {
          setSaveStatus('error');
          setTimeout(() => setSaveStatus(null), 3000);
          alert("Please select a custom expiration date and time.");
          return;
        }
        finalUntil = new Date(customUntil).toISOString();
      }
    }
    
    const payload = {
      mode,
      durationHours: finalDurationHours,
      customUntil: finalUntil,
      scheduleEnabled,
      scheduleStart,
      scheduleEnd,
      scheduleDays: scheduleDays.join(',')
    };
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/senders/${selectedSender.sender_email}/autopilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        setSenders(prev => prev.map(s => 
          s.sender_email === selectedSender.sender_email 
            ? { 
                ...s, 
                autopilot_mode: result.autopilot_mode, 
                autopilot_until: result.autopilot_until,
                autopilot_schedule_enabled: result.autopilot_schedule_enabled,
                autopilot_schedule_start: result.autopilot_schedule_start,
                autopilot_schedule_end: result.autopilot_schedule_end,
                autopilot_schedule_days: result.autopilot_schedule_days
              }
            : s
        ));
        
        setSelectedSender(prev => ({
          ...prev,
          autopilot_mode: result.autopilot_mode,
          autopilot_until: result.autopilot_until,
          autopilot_schedule_enabled: result.autopilot_schedule_enabled,
          autopilot_schedule_start: result.autopilot_schedule_start,
          autopilot_schedule_end: result.autopilot_schedule_end,
          autopilot_schedule_days: result.autopilot_schedule_days
        }));
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(null), 3000);
        alert("Failed to save autopilot configuration rule.");
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
      alert("Network error saving autopilot config.");
    }
  };

  const toggleDay = (dayVal) => {
    setScheduleDays(prev => 
      prev.includes(dayVal)
        ? prev.filter(d => d !== dayVal)
        : [...prev, dayVal]
    );
  };

  const getRuleSummary = () => {
    if (mode === 'NEVER') {
      return "🚫 Autopilot is blocked. All emails from this contact will require human review.";
    }
    
    let parts = [];
    if (mode === 'DEFAULT') {
      parts.push("ℹ Follows default system logic (confidence > 90%, non-billing).");
    } else {
      parts.push("✔ Force Autopilot is active.");
      
      // Handle expiry description
      if (expiryType === 'preset') {
        if (duration) {
          parts.push(`Expires in ${duration} hours.`);
        } else {
          parts.push("No expiration timer (permanent).");
        }
      } else if (customUntil) {
        parts.push(`Expires on ${new Date(customUntil).toLocaleString()}.`);
      } else {
        parts.push("No expiration timer (permanent).");
      }
    }
    
    // Handle scheduling description
    if (scheduleEnabled) {
      const activeLabels = DAYS_OF_WEEK
        .filter(d => scheduleDays.includes(d.value))
        .map(d => d.label);
      
      let dayDesc;
      if (activeLabels.length === 7) {
        dayDesc = "Every day";
      } else if (activeLabels.length === 5 && !scheduleDays.includes('0') && !scheduleDays.includes('6')) {
        dayDesc = "Weekdays";
      } else if (activeLabels.length === 2 && scheduleDays.includes('0') && scheduleDays.includes('6')) {
        dayDesc = "Weekends";
      } else {
        dayDesc = activeLabels.join(', ') || 'No days';
      }
      
      parts.push(`Restricted to ${dayDesc} between ${scheduleStart} and ${scheduleEnd}.`);
    } else {
      parts.push("Active 24/7 (no schedule limits).");
    }
    
    return parts.join(' • ');
  };

  const hasChanges = () => {
    if (!selectedSender) return false;
    
    if (mode !== (selectedSender.autopilot_mode || 'DEFAULT')) return true;
    
    const dbSchedEnabled = selectedSender.autopilot_schedule_enabled === 1;
    if (scheduleEnabled !== dbSchedEnabled) return true;
    
    if (scheduleEnabled) {
      if (scheduleStart !== (selectedSender.autopilot_schedule_start || '00:00')) return true;
      if (scheduleEnd !== (selectedSender.autopilot_schedule_end || '23:59')) return true;
      
      const dbDays = (selectedSender.autopilot_schedule_days || '1,2,3,4,5,6,0')
        .split(',')
        .map(d => d.trim())
        .sort()
        .join(',');
      const currentDaysStr = [...scheduleDays].sort().join(',');
      if (currentDaysStr !== dbDays) return true;
    }
    
    if (mode === 'ALWAYS') {
      const dbUntil = selectedSender.autopilot_until || null;
      if (expiryType === 'preset') {
        if (duration !== null) return true;
      } else {
        let currentCustomUntilIso = null;
        if (customUntil) {
          try {
            currentCustomUntilIso = new Date(customUntil).toISOString();
          } catch {
            // Invalid date, ignore
          }
        }
        if (currentCustomUntilIso !== dbUntil) return true;
      }
    }
    
    return false;
  };

  const filteredSenders = senders.filter(s => 
    s.extracted_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.sender_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col md:flex-row h-[600px] animate-fade-in">
      {/* Left Column: Senders List */}
      <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-500" />
            Contact Memory Directory ({senders.length})
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold">
              Loading profiles...
            </div>
          ) : filteredSenders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs italic font-medium">
              No contacts found matching search criteria.
            </div>
          ) : (
            filteredSenders.map((s) => (
              <div
                key={s.sender_email}
                onClick={() => {
                  setSelectedSender(s);
                  setDuration(null);
                }}
                className={cn(
                  "p-4 cursor-pointer transition-all flex items-center justify-between group",
                  selectedSender?.sender_email === s.sender_email 
                    ? "bg-indigo-50/40 border-l-4 border-indigo-600" 
                    : "hover:bg-slate-50/50 border-l-4 border-transparent"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden mr-2">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold uppercase text-xs shrink-0 shadow-sm">
                    {s.sender_email.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-800 truncate">{s.extracted_name}</p>
                    <p className="text-[10px] text-slate-400 truncate font-semibold mt-0.5">{s.sender_email}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {s.ticket_count} {s.ticket_count === 1 ? 'email' : 'emails'}
                  </span>
                  <span className="text-[8px] font-extrabold uppercase bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded">
                    {s.preferred_department}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Detail View */}
      <div className="flex-1 flex flex-col h-full bg-white">
        {selectedSender ? (
          <div className="flex-1 overflow-y-auto">
            {/* Profile Header */}
            <div className="p-6 border-b border-slate-100 shrink-0 bg-slate-50/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-600 border border-indigo-700 text-white flex items-center justify-center font-extrabold uppercase text-lg shadow-md shrink-0">
                    {selectedSender.sender_email.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{selectedSender.extracted_name}</h3>
                    <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" /> {selectedSender.sender_email}
                    </p>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl border border-slate-200/60 p-3 shadow-sm flex gap-6 shrink-0 justify-around sm:justify-start">
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Tickets</p>
                    <p className="text-base font-extrabold text-slate-800 mt-0.5">{selectedSender.ticket_count}</p>
                  </div>
                  <div className="border-l border-slate-100" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Preferred Category</p>
                    <p className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mt-0.5 inline-block">
                      {selectedSender.preferred_department}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ingestion dates */}
              <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-slate-600">First Contact:</span> 
                  {new Date(selectedSender.first_seen).toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-slate-600">Last Contact:</span> 
                  {new Date(selectedSender.last_seen).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Autopilot Automation settings */}
            <div className="mx-6 my-4 p-5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm shrink-0 transition-all duration-300">
              <div className="flex items-center justify-between mb-4 border-b border-slate-200/60 pb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  🤖 Autopilot Automation Rules
                </h4>
                {selectedSender && (
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm transition-all duration-300",
                    selectedSender.autopilot_mode === 'NEVER' && "bg-rose-50 text-rose-700 border-rose-200",
                    selectedSender.autopilot_mode === 'ALWAYS' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                    (selectedSender.autopilot_mode === 'DEFAULT' || !selectedSender.autopilot_mode) && "bg-indigo-50 text-indigo-700 border-indigo-200"
                  )}>
                    Currently Active: {selectedSender.autopilot_mode === 'ALWAYS' ? 'Force Autopilot' : selectedSender.autopilot_mode === 'NEVER' ? 'Always Hold' : 'System Default'}
                  </span>
                )}
              </div>

              {/* Mode Buttons */}
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Rule Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('DEFAULT')}
                      className={cn(
                        "px-3 py-2 rounded-lg text-[10px] font-bold border transition-all active:scale-95 shadow-sm text-center",
                        mode === 'DEFAULT'
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                      )}
                    >
                      System Default (Confidence)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('ALWAYS')}
                      className={cn(
                        "px-3 py-2 rounded-lg text-[10px] font-bold border transition-all active:scale-95 shadow-sm text-center",
                        mode === 'ALWAYS'
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                      )}
                    >
                      Force Autopilot (Auto-Send)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('NEVER')}
                      className={cn(
                        "px-3 py-2 rounded-lg text-[10px] font-bold border transition-all active:scale-95 shadow-sm text-center",
                        mode === 'NEVER'
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                      )}
                    >
                      Always Hold (Manual)
                    </button>
                  </div>
                </div>

                {/* Expiration Settings (Only for Force Autopilot) */}
                {mode === 'ALWAYS' && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200/60 shadow-sm space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expiration Limit</span>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setExpiryType('preset')}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold transition-all",
                            expiryType === 'preset' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          Presets
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpiryType('custom')}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold transition-all",
                            expiryType === 'custom' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          Specific End Date
                        </button>
                      </div>
                    </div>

                    {expiryType === 'preset' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-semibold shrink-0">Duration:</span>
                        <select
                          value={duration || ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            setDuration(val);
                          }}
                          className="border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                        >
                          <option value="">Permanent (No Expiry)</option>
                          <option value="1">1 Hour</option>
                          <option value="24">24 Hours</option>
                          <option value="168">7 Days</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">Expires At:</span>
                          <input
                            type="datetime-local"
                            value={customUntil}
                            onChange={(e) => setCustomUntil(e.target.value)}
                            className="border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                          />
                        </div>
                        <div className="flex gap-2 pl-14">
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setHours(d.getHours() + 1);
                              const offset = d.getTimezoneOffset();
                              const local = new Date(d.getTime() - (offset * 60 * 1000));
                              setCustomUntil(local.toISOString().substring(0, 16));
                            }}
                            className="text-[8px] font-extrabold text-indigo-600 hover:text-indigo-800"
                          >
                            +1 Hour
                          </button>
                          <span className="text-[8px] text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setHours(17, 0, 0, 0);
                              const offset = d.getTimezoneOffset();
                              const local = new Date(d.getTime() - (offset * 60 * 1000));
                              setCustomUntil(local.toISOString().substring(0, 16));
                            }}
                            className="text-[8px] font-extrabold text-indigo-600 hover:text-indigo-800"
                          >
                            End of Today (5 PM)
                          </button>
                          <span className="text-[8px] text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const day = d.getDay();
                              const diff = (day <= 5 ? 5 - day : 12 - day);
                              d.setDate(d.getDate() + diff);
                              d.setHours(17, 0, 0, 0);
                              const offset = d.getTimezoneOffset();
                              const local = new Date(d.getTime() - (offset * 60 * 1000));
                              setCustomUntil(local.toISOString().substring(0, 16));
                            }}
                            className="text-[8px] font-extrabold text-indigo-600 hover:text-indigo-800"
                          >
                            End of Week
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recurring Schedule Settings (Visible when mode is not NEVER) */}
                {mode !== 'NEVER' && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200/60 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="enable-schedule"
                          checked={scheduleEnabled}
                          onChange={(e) => setScheduleEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <label htmlFor="enable-schedule" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer">
                          Restrict Automation Schedule
                        </label>
                      </div>
                    </div>

                    {scheduleEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-100 animate-fade-in">
                        {/* Time pickers */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Start Time</label>
                              <input
                                type="time"
                                value={scheduleStart}
                                onChange={(e) => setScheduleStart(e.target.value)}
                                className="border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">End Time</label>
                              <input
                                type="time"
                                value={scheduleEnd}
                                onChange={(e) => setScheduleEnd(e.target.value)}
                                className="border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setScheduleStart('09:00');
                                setScheduleEnd('17:00');
                              }}
                              className="px-2 py-0.5 rounded text-[8px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors"
                            >
                              Business Hours (9 AM - 5 PM)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setScheduleStart('17:00');
                                setScheduleEnd('09:00');
                              }}
                              className="px-2 py-0.5 rounded text-[8px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors"
                            >
                              Off-Hours / Overnight (5 PM - 9 AM)
                            </button>
                          </div>
                        </div>

                        {/* Day Selector */}
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">Active Days</label>
                          <div className="flex gap-1.5 justify-between">
                            {DAYS_OF_WEEK.map((d) => {
                              const isActive = scheduleDays.includes(d.value);
                              return (
                                <button
                                  type="button"
                                  key={d.value}
                                  onClick={() => toggleDay(d.value)}
                                  className={cn(
                                    "w-7 h-7 rounded-full text-[9px] font-extrabold flex items-center justify-center border transition-all active:scale-95 shrink-0",
                                    isActive 
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                                      : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600"
                                  )}
                                >
                                  {d.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setScheduleDays(['1', '2', '3', '4', '5'])}
                              className="px-2 py-0.5 rounded text-[8px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors"
                            >
                              Weekdays (M-F)
                            </button>
                            <button
                              type="button"
                              onClick={() => setScheduleDays(['0', '6'])}
                              className="px-2 py-0.5 rounded text-[8px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors"
                            >
                              Weekends (Sa-Su)
                            </button>
                            <button
                              type="button"
                              onClick={() => setScheduleDays(['1', '2', '3', '4', '5', '6', '0'])}
                              className="px-2 py-0.5 rounded text-[8px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors"
                            >
                              All Days
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Summary status and Save Action Row */}
                <div className="border-t border-slate-200/60 pt-4 space-y-3">
                  <div className={cn(
                    "p-3 rounded-lg border text-[10px] font-bold leading-relaxed flex items-start gap-2 shadow-sm transition-all duration-300",
                    mode === 'NEVER' && "bg-rose-50/50 border-rose-100 text-rose-800",
                    mode === 'ALWAYS' && "bg-emerald-50/50 border-emerald-100 text-emerald-800",
                    mode === 'DEFAULT' && "bg-slate-50 border-slate-200/60 text-slate-700"
                  )}>
                    <span className="text-base leading-none">
                      {mode === 'ALWAYS' ? '🤖' : mode === 'NEVER' ? '🚫' : 'ℹ'}
                    </span>
                    <div className="flex-1">
                      <p className="font-extrabold uppercase text-[8px] tracking-wider text-slate-400 mb-0.5">Rule Configuration Preview</p>
                      <p className="font-semibold leading-normal">{getRuleSummary()}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {hasChanges() && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                          ● Unsaved changes
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {saveStatus === 'success' && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md animate-fade-in flex items-center gap-1">
                          ✔ Saved Successfully
                        </span>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md animate-fade-in">
                          ❌ Failed to Save
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveAutopilot}
                        disabled={saveStatus === 'saving'}
                        className={cn(
                          "px-5 py-2.5 rounded-lg text-[10px] font-bold text-white transition-all shadow-sm active:scale-95 disabled:opacity-50 shrink-0",
                          hasChanges()
                            ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200/50 ring-2 ring-indigo-500 ring-offset-1"
                            : "bg-slate-400 hover:bg-slate-500 cursor-not-allowed"
                        )}
                      >
                        {saveStatus === 'saving' ? 'Saving...' : '💾 Save Rule Configuration'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Senders Email Inquiries Timeline */}
            <div className="p-6 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                Historical Inquiries Timeline ({selectedSender.tickets?.length || 0})
              </h4>
              
              <div className="space-y-4">
                {selectedSender.tickets && selectedSender.tickets.length > 0 ? (
                  selectedSender.tickets.map((t) => (
                    <div 
                      key={t.id}
                      className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all bg-slate-50/20"
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-extrabold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                            #{t.id}
                          </span>
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                            {t.assigned_department}
                          </span>
                          <span className={cn(
                            "text-[10px] border px-2 py-0.5 rounded-full font-bold",
                            t.status === 'Pending Review' && "bg-amber-50 text-amber-700 border-amber-200",
                            t.status === 'Sent' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                            t.status === 'Ignored' && "bg-slate-100 text-slate-600 border-slate-200"
                          )}>
                            {t.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {new Date(t.timestamp).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-4 mt-2">
                        <p className="text-xs font-bold text-slate-800 truncate flex-1">{t.email_subject}</p>
                        <button
                          onClick={() => onSelectTicket(t.id)}
                          className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-white hover:bg-indigo-600 hover:text-white border border-slate-200 hover:border-indigo-300 px-2.5 py-1.5 rounded shadow-sm transition-all shrink-0 active:scale-95"
                        >
                          Review Suggested Draft
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">No tickets found for this sender.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <User className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-xs font-semibold">Select a contact to view their detail card.</p>
          </div>
        )}
      </div>
    </div>
  );
}
