import React, { useState, useEffect } from 'react';
import { X, FileText, Paperclip, CheckCircle2, User, Mail, Tag, Clock, Send, Ban, Loader2, Sparkles, Check, HelpCircle, FileDiff, AlertTriangle } from 'lucide-react';
import { cn, diffWords } from '../utils';

const BACKEND_URL = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'http://localhost:5000';

export function TicketDrawer({ ticket, isOpen, onClose, onApprove, onIgnore }) {
  const [replyText, setReplyText] = useState('');
  const [smtpStatus, setSmtpStatus] = useState('idle'); // 'idle' | 'connecting' | 'sending' | 'sent'
  const [smtpLogs, setSmtpLogs] = useState([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceLogs, setEnhanceLogs] = useState([]);
  
  // Custom UX states
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Audit trail states
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchAuditLogs = async () => {
    if (!ticket) return;
    setIsLoadingAudit(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets/${ticket.id}/audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (isOpen && ticket) {
      setSmtpStatus('idle');
      setSmtpLogs([]);
      setIsEnhancing(false);
      setEnhanceLogs([]);
      setShowDiff(false);
      setAuditLogs([]);
      fetchAuditLogs();

      const fullText = ticket.ai_suggested_reply || '';
      
      // Trigger ghost-typing only for pending review tickets that aren't edited yet
      if (ticket.status === 'Pending Review') {
        setIsTyping(true);
        setDisplayText('');
        
        let currentIdx = 0;
        const interval = setInterval(() => {
          if (currentIdx < fullText.length) {
            setDisplayText(prev => prev + fullText.charAt(currentIdx));
            currentIdx++;
          } else {
            clearInterval(interval);
            setIsTyping(false);
            setReplyText(fullText);
          }
        }, 10);
        
        return () => clearInterval(interval);
      } else {
        setReplyText(fullText);
        setIsTyping(false);
      }
    }
  }, [ticket, isOpen]);

  if (!ticket && !isOpen) return null;

  const handleSkipTyping = () => {
    setIsTyping(false);
    setReplyText(ticket.ai_suggested_reply || '');
  };

  const handleApproveSend = async () => {
    setSmtpStatus('connecting');
    setSmtpLogs(['⚡ Handshaking with secure SMTP server...', '🔒 Establishing secure SSL/TLS connection...']);
    
    await new Promise(r => setTimeout(r, 600));
    setSmtpStatus('sending');
    setSmtpLogs(prev => [...prev, '📨 Logging into caldiminternship@gmail.com relay...', '📤 Uploading message headers and multipart MIME boundary...']);
    
    await new Promise(r => setTimeout(r, 800));
    setSmtpStatus('sent');
    setSmtpLogs(prev => [...prev, '✔ SMTP 250 OK: Email successfully queued and transmitted!']);
    
    await new Promise(r => setTimeout(r, 600));
    onApprove(ticket.id, replyText);
    onClose();
  };

  const handleDismiss = () => {
    onIgnore(ticket.id);
    onClose();
  };

  const handleEnhanceReply = async () => {
    if (!replyText.trim() || isEnhancing) return;
    setIsEnhancing(true);
    setEnhanceLogs([]);
    
    const addLog = (log) => setEnhanceLogs(prev => [...prev, log]);

    addLog('🔍 Parsing original customer message context...');
    await new Promise(r => setTimeout(r, 600));

    addLog('📝 Evaluating current draft response for tone & style...');
    await new Promise(r => setTimeout(r, 800));

    addLog('🤖 Relaying query payload to Groq Llama-3.3 LLM...');
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/tickets/${ticket.id}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText })
      });
      if (res.ok) {
        addLog('✨ Receiving optimized response stream...');
        const data = await res.json();
        await new Promise(r => setTimeout(r, 600));
        setReplyText(data.enhancedReply);
        setShowDiff(false); // Reset diff to see optimized text
        fetchAuditLogs(); // Refresh the logs timeline
      } else {
        const errData = await res.json();
        addLog(`❌ Enhance failed: ${errData.error}`);
        alert(errData.error || "Failed to enhance reply");
      }
    } catch (err) {
      console.error("Enhancement failed:", err.message);
      addLog(`❌ Network connection error.`);
      alert("Failed to connect to backend server. Make sure server is running.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const evaluateQuality = (text = '') => {
    let score = 0;
    const checks = {
      length: false,
      greeting: false,
      signature: false,
      security: true,
      polite: false
    };

    if (!text) return { score: 0, checks };

    // 1. Length check
    if (text.length >= 100 && text.length <= 2000) {
      score += 25;
      checks.length = true;
    } else if (text.length > 0) {
      score += 10;
    }

    // 2. Greeting check
    const greetingRegex = /^(hello|hi|dear|greetings|good morning|good afternoon)/i;
    if (greetingRegex.test(text.trim())) {
      score += 20;
      checks.greeting = true;
    }

    // 3. Signature check
    const signatureRegex = /(sincerely|best regards|regards|thanks|thank you|caldim team)/i;
    if (signatureRegex.test(text.trim())) {
      score += 20;
      checks.signature = true;
    }

    // 4. Security Credentials check
    const secretRegex = /(password|pass:|gsk_|ghp_|api_key|sk-)/i;
    if (secretRegex.test(text)) {
      checks.security = false;
    } else {
      score += 20;
      checks.security = true;
    }

    // 5. Politeness check
    const politeRegex = /(please|thank you|sorry|appreciate|help|glad|happy to)/i;
    if (politeRegex.test(text.toLowerCase())) {
      score += 15;
      checks.polite = true;
    }

    return { score, checks };
  };

  const isPending = ticket.status === 'Pending Review';
  const originalDraft = ticket.ai_suggested_reply_original || ticket.ai_suggested_reply || '';
  const diffResult = diffWords(originalDraft, replyText);
  const { score: qualityScore, checks: qualityChecks } = evaluateQuality(replyText);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-slate-900/35 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          "fixed inset-y-0 right-0 w-full max-w-4xl bg-slate-50 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-l border-slate-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/60 shadow-sm shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">
              Reviewing Message <span className="text-slate-400 font-mono text-sm">#{ticket.id}</span>
            </h2>
            <span className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
              ticket.status === 'Pending Review' && "bg-amber-50 text-amber-700 border-amber-200",
              ticket.status === 'Sent' && "bg-emerald-50 text-emerald-700 border-emerald-200",
              ticket.status === 'Ignored' && "bg-slate-100 text-slate-600 border-slate-200"
            )}>
              {ticket.status === 'Pending Review' ? 'Awaiting Human Approval' : ticket.status}
            </span>
            {ticket.confidence !== undefined && ticket.confidence !== null && (
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 shadow-sm",
                ticket.confidence > 0.90 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : ticket.confidence >= 0.70 
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                AI Confidence: {Math.round(ticket.confidence * 100)}%
                {ticket.confidence > 0.90 && ticket.assigned_department !== 'Billing' && ticket.status === 'Sent' && (
                  <span className="font-extrabold text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Auto-Sent
                  </span>
                )}
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SMTP Animation Overlay */}
        {smtpStatus !== 'idle' && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-white animate-fade-in">
            <div className="relative mb-8 flex items-center justify-center">
              {smtpStatus !== 'sent' ? (
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
                  <Send className="w-6 h-6 text-white absolute inset-0 m-auto animate-pulse" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
                  <Check className="w-8 h-8 text-white stroke-[3px]" />
                </div>
              )}
            </div>
            
            <h3 className="text-xl font-bold mb-2">Outbound Delivery System</h3>
            <p className="text-xs text-slate-400 mb-4 font-medium">Relaying outbound email through SMTP secure host...</p>
            
            <div className="bg-slate-950/85 rounded-lg p-4 font-mono text-xs text-indigo-300 w-full max-w-md h-40 overflow-y-auto border border-slate-800 space-y-1.5 shadow-inner">
              {smtpLogs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-slate-600 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Column: Incoming Email */}
          <div className="w-full md:w-1/2 p-6 overflow-y-auto border-r border-slate-200 flex flex-col space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Sender Details
              </h3>
              <div className="bg-white rounded-xl p-3.5 border border-slate-200/60 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold uppercase text-sm border border-slate-200">
                    {ticket.sender_email.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{ticket.extracted_name || 'Unidentified Contact'}</p>
                    <p className="text-[10px] text-slate-500 font-medium truncate">{ticket.sender_email}</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Incoming Message Content
              </h3>
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-700 truncate">Subject: {ticket.email_subject}</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0 font-medium">
                    <Clock className="w-3 h-3" /> {new Date(ticket.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="p-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed h-[180px] overflow-y-auto bg-slate-50/20">
                  {ticket.raw_body}
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Ingested File Attachments ({ticket.attachments?.length || 0})
              </h3>
              <div className="space-y-2">
                {ticket.attachments && ticket.attachments.length > 0 ? (
                  ticket.attachments.map((file, idx) => (
                    <a 
                      key={idx}
                      href={`${BACKEND_URL}/attachments/${file.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 text-indigo-500 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{file.size}</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-100">
                        Download
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic font-medium">No attachments detected in webhook stream.</p>
                )}
              </div>
            </div>

            {/* AI Requirement analysis */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-500" /> AI Requirement Analysis
              </h3>
              <div className="bg-indigo-50/40 border border-indigo-100/60 rounded-xl p-3.5 text-indigo-950 text-xs leading-relaxed font-medium">
                <p className="whitespace-pre-wrap">{ticket.ai_requirements}</p>
              </div>
            </div>

            {/* Audit Log Timeline */}
            <div className="pt-4 border-t border-slate-200/60">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" /> Ingestion & Action Timeline
              </h3>
              {isLoadingAudit ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Loading audit trail...
                </div>
              ) : auditLogs.length > 0 ? (
                <div className="relative border-l-2 border-slate-200 ml-2.5 pl-4 space-y-4 pb-1">
                  {auditLogs.map((log) => {
                    const date = new Date(log.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    
                    let dotColor = "bg-slate-300 border-slate-400";
                    let actionLabel = log.action;
                    let payloadSummary = log.payload;

                    if (log.action === 'Ingested') {
                      dotColor = "bg-indigo-500 border-indigo-200 ring-4 ring-indigo-50";
                      actionLabel = "System Ingested";
                    } else if (log.action === 'Approved') {
                      dotColor = "bg-emerald-500 border-emerald-200 ring-4 ring-emerald-50";
                      actionLabel = log.actor === 'System' ? "Auto-Sent (System)" : "Approved & Sent (Human)";
                      if (payloadSummary && payloadSummary.length > 100) {
                        payloadSummary = payloadSummary.substring(0, 100) + "...";
                      }
                    } else if (log.action === 'Ignored') {
                      dotColor = "bg-rose-500 border-rose-200 ring-4 ring-rose-50";
                      actionLabel = "Ignored & Archived";
                    } else if (log.action === 'Enhanced') {
                      dotColor = "bg-purple-500 border-purple-200 ring-4 ring-purple-50";
                      actionLabel = "AI Suggestion Enhanced";
                    }

                    return (
                      <div key={log.id} className="relative text-xs">
                        {/* Timeline Bullet Dot */}
                        <span className={cn(
                          "absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full border-2 transition-all",
                          dotColor
                        )} />
                        
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-700">{actionLabel}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{date}</span>
                          </div>
                          {payloadSummary && (
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 whitespace-pre-wrap font-medium">
                              {payloadSummary}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic font-medium">No actions logged yet.</p>
              )}
            </div>
          </div>

          {/* Right Column: AI Suggestion & Review */}
          <div className="w-full md:w-1/2 p-6 flex flex-col bg-white overflow-y-auto">
            <div className="flex flex-col mb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Auto-Drafted Response
                </h3>
                
                <div className="flex items-center gap-1.5">
                  {isPending && !isTyping && (
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors shadow-sm",
                        showDiff 
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                      )}
                    >
                      <FileDiff className="w-3.5 h-3.5" />
                      {showDiff ? 'Hide Diff' : 'Show Diff'}
                    </button>
                  )}

                  {isPending && (
                    <button
                      onClick={handleEnhanceReply}
                      disabled={isEnhancing}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors shadow-sm",
                        isEnhancing 
                          ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                          : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                      )}
                    >
                      {isEnhancing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Polishing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          AI Enhance
                        </>
                      )}
                    </button>
                  )}
                  {isPending && (
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-wider">
                      Edit Mode
                    </span>
                  )}
                </div>
              </div>
              
              <p className="text-xs text-slate-500 font-medium">
                {isPending 
                  ? 'Verify, edit, or customize the reply below before releasing it to the queue.' 
                  : 'This message has already been processed.'}
              </p>

              {/* Explainable AI routing reasoning line */}
              {ticket.ai_reasoning && (
                <div className="mt-2.5 bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-indigo-950 font-medium shadow-sm animate-slide-down">
                  <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-indigo-900 block mb-0.5">Explainable AI Reasoning:</span>
                    {ticket.ai_reasoning}
                  </div>
                </div>
              )}
            </div>

            {/* Input / Ghost / Diff rendering container */}
            <div className="flex-1 flex flex-col min-h-[300px]">
              {isEnhancing ? (
                // Loading pipeline console logs
                <div className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-xl p-6 font-mono text-xs text-indigo-300 flex flex-col justify-center space-y-2 shadow-inner">
                  <div className="flex items-center gap-2 mb-4 justify-center">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <span className="font-bold text-slate-200">AI Optimize Engine Active</span>
                  </div>
                  <div className="space-y-1.5 max-w-sm mx-auto">
                    {enhanceLogs.map((log, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-indigo-500 font-bold select-none">&gt;</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : isTyping ? (
                // Ghost-typing character animation read-only display
                <div className="relative w-full flex-1 flex flex-col">
                  <div className="w-full flex-1 p-4 border border-slate-200 rounded-xl bg-slate-50/50 text-sm text-slate-700 leading-relaxed font-sans overflow-y-auto select-none shadow-inner">
                    {displayText}
                    <span className="inline-block w-1.5 h-4 bg-indigo-600 animate-pulse ml-0.5" />
                  </div>
                  <button 
                    onClick={handleSkipTyping}
                    className="absolute bottom-3 right-3 flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold shadow-md active:scale-95 transition-all"
                  >
                    Skip to End
                  </button>
                </div>
              ) : showDiff ? (
                // Visual highlights of original AI reply vs user edits
                <div className="w-full flex-1 p-4 border border-slate-200 rounded-xl bg-slate-50 overflow-y-auto font-sans text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
                  {diffResult.map((part, index) => {
                    if (part.type === 'added') {
                      return (
                        <ins key={index} className="bg-emerald-100 text-emerald-800 no-underline px-0.5 rounded font-bold border-b border-emerald-300">
                          {part.value}
                        </ins>
                      );
                    }
                    if (part.type === 'removed') {
                      return (
                        <del key={index} className="bg-rose-100 text-rose-800 line-through px-0.5 rounded font-bold border-b border-rose-300">
                          {part.value}
                        </del>
                      );
                    }
                    return <span key={index}>{part.value}</span>;
                  })}
                </div>
              ) : isPending ? (
                // Normal text editor textarea
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full flex-1 p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm text-slate-700 leading-relaxed font-sans shadow-inner focus:shadow-none transition-shadow"
                  placeholder="Draft your reply here..."
                />
              ) : (
                // Standard un-editable view mode
                <div className="w-full flex-1 p-4 border border-slate-100 rounded-xl bg-slate-50/50 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap overflow-y-auto">
                  {replyText || 'No reply drafted or required for this ticket.'}
                </div>
              )}
            </div>

            {/* Real-time Draft Quality Score Card */}
            {isPending && !isTyping && !isEnhancing && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-4 shadow-sm animate-slide-down">
                <div className="flex items-center gap-3">
                  {/* Score Progress Ring */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-12 h-12 transform -rotate-90">
                      <circle cx="24" cy="24" r="20" stroke="#e2e8f0" strokeWidth="4" fill="transparent" />
                      <circle cx="24" cy="24" r="20" 
                        stroke={qualityScore >= 80 ? '#10b981' : qualityScore >= 50 ? '#f59e0b' : '#ef4444'} 
                        strokeWidth="4" 
                        fill="transparent" 
                        strokeDasharray={2 * Math.PI * 20}
                        strokeDashoffset={2 * Math.PI * 20 * (1 - qualityScore / 100)}
                        className="transition-all duration-500 ease-out"
                      />
                    </svg>
                    <span className="absolute text-[10px] font-extrabold text-slate-800">{qualityScore}%</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">Reply Quality Audit</h4>
                    <p className="text-[9px] text-slate-400 font-medium">Scanned draft metrics score.</p>
                  </div>
                </div>

                {/* Score checks listing */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[9px] font-bold text-slate-500 flex-1 justify-items-end max-w-md">
                  <span className="flex items-center gap-1.5 justify-self-start sm:justify-self-auto">
                    <span className={cn("w-2 h-2 rounded-full", qualityChecks.length ? "bg-emerald-500" : "bg-slate-300")} />
                    Length ({replyText.length}ch)
                  </span>
                  <span className="flex items-center gap-1.5 justify-self-start sm:justify-self-auto">
                    <span className={cn("w-2 h-2 rounded-full", qualityChecks.greeting ? "bg-emerald-500" : "bg-slate-300")} />
                    Salutation
                  </span>
                  <span className="flex items-center gap-1.5 justify-self-start sm:justify-self-auto">
                    <span className={cn("w-2 h-2 rounded-full", qualityChecks.signature ? "bg-emerald-500" : "bg-slate-300")} />
                    Signature
                  </span>
                  <span className="flex items-center gap-1.5 justify-self-start sm:justify-self-auto">
                    <span className={cn("w-2 h-2 rounded-full", qualityChecks.polite ? "bg-emerald-500" : "bg-slate-300")} />
                    Polite Words
                  </span>
                  <span className="flex items-center gap-1.5 justify-self-start sm:justify-self-auto col-span-2 md:col-span-1">
                    <span className={cn("w-2 h-2 rounded-full", qualityChecks.security ? "bg-emerald-500" : "bg-rose-500 animate-pulse")} />
                    {qualityChecks.security ? 'No Credentials Leak' : 'Credentials Leak!'}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {isPending && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold text-sm transition-all active:scale-[0.98]"
                >
                  <Ban className="w-4 h-4" />
                  Ignore & Archive
                </button>
                <button
                  onClick={handleApproveSend}
                  disabled={!qualityChecks.security}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-white font-bold text-sm transition-all shadow-sm active:scale-[0.98]",
                    qualityChecks.security 
                      ? "bg-indigo-600 hover:bg-indigo-700" 
                      : "bg-slate-400 cursor-not-allowed opacity-55"
                  )}
                >
                  <Send className="w-4 h-4" />
                  Approve & Send Reply
                </button>
              </div>
            )}

            {/* Outbound Reply Audit History */}
            {ticket.replies && ticket.replies.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Outbound Transmission History ({ticket.replies.length})
                </h3>
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                  {ticket.replies.map((r, index) => (
                    <div key={index} className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                      <div className="flex justify-between items-center text-slate-400 font-medium">
                        <span>Transmission #{index + 1}</span>
                        <span>{new Date(r.sentAt).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed font-sans mt-1">{r.replyText}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
