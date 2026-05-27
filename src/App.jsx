import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DataGrid } from './components/DataGrid';
import { TicketDrawer } from './components/TicketDrawer';
import { WebhookSimulator } from './components/WebhookSimulator';
import { TerminalLog } from './components/TerminalLog';
import { ContactsCRM } from './components/ContactsCRM';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { Sparkles, ArrowRight, CheckCircle, RefreshCw, Terminal, AlertCircle, X, Activity, Users } from 'lucide-react';
import { cn } from './utils';

const BACKEND_URL = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'http://localhost:5000';

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [pendingTickets, setPendingTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({
    total: 0,
    pending: 0,
    sent: 0
  });
  
  // Pagination & Sandbox States
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalCount: 0, totalPages: 1 });
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [toasts, setToasts] = useState([]);
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'history' | 'crm' | 'analytics'

  // Helper to show non-blocking modern toasts
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Helper to fetch a ticket by ID and open in review drawer (e.g. from CRM timeline)
  const fetchTicketByIdAndOpen = async (ticketId) => {
    const found = tickets.find(t => t.id === ticketId) || pendingTickets.find(t => t.id === ticketId);
    if (found) {
      setSelectedTicket(found);
      return;
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets`);
      if (res.ok) {
        const data = await res.json();
        const allList = [...(data.tickets || []), ...(data.pendingTickets || [])];
        const match = allList.find(t => t.id === ticketId);
        if (match) {
          setSelectedTicket(match);
        } else {
          showToast(`Could not find ticket #${ticketId}.`, 'error');
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Error locating ticket details.", "error");
    }
  };

  // Fetch tickets function
  const fetchTickets = async (targetPage = page, showLoader = false) => {
    if (showLoader) setIsRefreshing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets?page=${targetPage}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setPendingTickets(data.pendingTickets || []);
        setPagination(data.pagination || { page: 1, limit: 10, totalCount: 0, totalPages: 1 });
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (err) {
      console.error("Failed to fetch tickets from server: ", err.message);
      showToast("Could not fetch tickets from backend.", "error");
    } finally {
      if (showLoader) setIsRefreshing(false);
    }
  };

  // Poll server for mail fetch
  const triggerServerPoll = async () => {
    setIsRefreshing(true);
    showToast("Inbox sync requested. Contacting Gmail server...", "info");
    try {
      const res = await fetch(`${BACKEND_URL}/api/poll`, { method: 'POST' });
      if (res.status === 409) {
        showToast("Inbox polling is already in progress.", "info");
      } else if (res.ok) {
        showToast("Mail synchronization initiated successfully!", "success");
        await fetchTickets(page, false);
      } else {
        showToast("Sync request failed. Check server logs.", "error");
      }
    } catch (err) {
      console.error("Failed manual sync trigger: ", err.message);
      showToast("Could not contact backend for email sync: " + err.message, "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load and refresh tickets
  useEffect(() => {
    fetchTickets(page, false);
    const timer = setInterval(() => {
      fetchTickets(page, false);
    }, 5000);
    return () => clearInterval(timer);
  }, [page]);

  // Maintain active selection updates if ticket details change
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id) || pendingTickets.find(t => t.id === selectedTicket.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTicket)) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets, pendingTickets, selectedTicket]);

  const handleApproveReply = async (ticketId, updatedReply) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets/${ticketId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: updatedReply })
      });
      if (res.ok) {
        showToast(`Ticket ${ticketId} approved & reply sent via SMTP!`, 'success');
        fetchTickets(page, false);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to send SMTP reply.", "error");
      }
    } catch (err) {
      console.error("Approval request failed: ", err.message);
      showToast("Network error during approval: " + err.message, "error");
    }
  };

  const handleIgnoreReply = async (ticketId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets/${ticketId}/ignore`, {
        method: 'POST'
      });
      if (res.ok) {
        showToast(`Ticket ${ticketId} ignored and archived.`, 'info');
        fetchTickets(page, false);
      } else {
        showToast("Failed to archive ticket.", "error");
      }
    } catch (err) {
      console.error("Ignore request failed: ", err.message);
      showToast("Network error during ignore: " + err.message, "error");
    }
  };

  // Ingestion Simulator logic
  const handleSimulate = async (payload) => {
    setIsSimulating(true);
    setLogs([]);
    
    const addLog = (step, description) => {
      setLogs(prev => [
        ...prev, 
        {
          id: Date.now() + Math.random(),
          executed_at: new Date().toISOString(),
          step_name: step,
          description: description
        }
      ]);
    };

    try {
      setCurrentStage('SCAN');
      addLog('SCAN', 'Webhook listener caught simulation payload injection.');
      await new Promise(resolve => setTimeout(resolve, 800));

      setCurrentStage('READ');
      const attachmentNames = payload.attachments?.map(a => a.name) || [];
      addLog('READ', `Parsed payload metadata. Extracted ${attachmentNames.length} simulated attachment(s): ${attachmentNames.join(', ') || 'none'}.`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      setCurrentStage('PROCESS');
      addLog('PROCESS', 'Analyzing subject and email body via Groq Llama-3.3 LLM for routing rules and requirements...');
      await new Promise(resolve => setTimeout(resolve, 1200));

      setCurrentStage('STORE');
      const res = await fetch(`${BACKEND_URL}/api/tickets/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Server database insert failed.');
      }

      const responseData = await res.json();
      const ticketId = responseData.ticketId || 'TKT-2026-UNKNOWN';

      addLog('STORE', `Persisted mock ticket ${ticketId} to SQLite. Category auto-draft initialized.`);
      await new Promise(resolve => setTimeout(resolve, 600));

      showToast(`Mock Ticket ${ticketId} Ingested!`, 'success');
      fetchTickets(page, false);
    } catch (err) {
      addLog('STORE', `❌ Ingestion error: ${err.message}`);
      showToast(`Ingestion failed: ${err.message}`, 'error');
    } finally {
      setIsSimulating(false);
      setCurrentStage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 animate-fade-in">
      <Header metrics={metrics} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b border-slate-200 bg-white rounded-xl p-1.5 shadow-sm shrink-0 gap-1.5 border">
          <button
            onClick={() => setActiveTab('queue')}
            className={cn(
              "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95",
              activeTab === 'queue'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Inbox Queue ({pendingTickets.length})
          </button>
          
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95",
              activeTab === 'history'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Historical Archive
          </button>

          <button
            onClick={() => setActiveTab('crm')}
            className={cn(
              "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95",
              activeTab === 'crm'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Contact Memory Directory
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={cn(
              "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95",
              activeTab === 'analytics'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            SaaS Analytics
          </button>
        </div>

        {/* Tab Content Panes */}
        {activeTab === 'queue' && (
          <div className="space-y-6 animate-fade-in flex flex-col shrink-0">
            {/* Toggleable Developer Sandbox */}
            {isSandboxOpen && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-100 p-5 rounded-2xl border border-slate-200 shadow-sm animate-slide-down">
                <div className="min-h-[380px]">
                  <WebhookSimulator 
                    onSimulate={handleSimulate} 
                    isSimulating={isSimulating} 
                    currentStage={currentStage} 
                  />
                </div>
                <div className="min-h-[380px]">
                  <TerminalLog logs={logs} />
                </div>
              </div>
            )}

            {/* Awaiting Approval Queue Section (Full Width) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 flex flex-col shrink-0">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                    Awaiting Approval Queue ({pendingTickets.length})
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">Verify, edit, and approve auto-generated draft replies before they are released.</p>
                </div>
                
                {/* Action Bar */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSandboxOpen(!isSandboxOpen)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold shadow-sm active:scale-95 transition-all",
                      isSandboxOpen 
                        ? "bg-slate-800 text-white border-slate-800 hover:bg-slate-700" 
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {isSandboxOpen ? 'Close Developer Sandbox' : 'Open Developer Sandbox'}
                  </button>

                  <button
                    onClick={triggerServerPoll}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-colors shrink-0 shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-indigo-500")} />
                    {isRefreshing ? 'Syncing...' : 'Fetch New Mail'}
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {pendingTickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700">All Drafts Processed</p>
                    <p className="text-xs">No pending messages in the queue.</p>
                  </div>
                ) : (
                  pendingTickets.map((t) => (
                    <div 
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-indigo-50/30 hover:border-indigo-200 transition-all cursor-pointer group shadow-sm animate-fade-in"
                    >
                      <div className="flex items-center gap-3 overflow-hidden mr-4">
                        <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {t.sender_email.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold">#{t.id}</span>
                            <span className="text-xs font-bold text-slate-700 truncate">{t.extracted_name}</span>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold border border-slate-300/40">
                              {t.assigned_department}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-800 truncate mt-1">{t.email_subject}</p>
                        </div>
                      </div>
                      <button className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-white border border-slate-200 hover:border-indigo-300 px-3.5 py-2 rounded-lg shadow-sm transition-all group-hover:bg-indigo-600 group-hover:text-white shrink-0">
                        Review Draft
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 min-h-[400px] animate-fade-in">
            <DataGrid 
              tickets={tickets} 
              pagination={pagination}
              onPageChange={setPage}
              onRowClick={setSelectedTicket}
            />
          </div>
        )}

        {activeTab === 'crm' && (
          <div className="animate-fade-in">
            <ContactsCRM onSelectTicket={fetchTicketByIdAndOpen} />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="animate-fade-in">
            <AnalyticsDashboard />
          </div>
        )}

      </main>

      <TicketDrawer 
        ticket={selectedTicket} 
        isOpen={!!selectedTicket} 
        onClose={() => setSelectedTicket(null)} 
        onApprove={handleApproveReply}
        onIgnore={handleIgnoreReply}
      />

      {/* Modern Toast System Overlay Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border transition-all duration-300 transform translate-y-0 opacity-100 animate-slide-in",
              toast.type === 'success' && "bg-emerald-50 border-emerald-200 text-emerald-800",
              toast.type === 'error' && "bg-rose-50 border-rose-200 text-rose-800",
              toast.type === 'info' && "bg-indigo-50 border-indigo-200 text-indigo-800"
            )}
          >
            {toast.type === 'success' && (
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            {toast.type === 'info' && (
              <RefreshCw className="w-5 h-5 text-indigo-500 shrink-0 animate-spin" />
            )}
            <div className="flex-1 text-xs font-semibold leading-normal">
              {toast.message}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
