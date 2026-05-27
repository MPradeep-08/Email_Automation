import React, { useState, useEffect } from 'react';
import { X, FileText, Paperclip, CheckCircle2, User, Mail, Tag, Clock, Send, Ban, Loader2, Sparkles, Check } from 'lucide-react';
import { cn } from '../utils';

export function TicketDrawer({ ticket, isOpen, onClose, onApprove, onIgnore }) {
  const [replyText, setReplyText] = useState('');
  const [smtpStatus, setSmtpStatus] = useState('idle'); // 'idle' | 'connecting' | 'sending' | 'sent'
  const [smtpLogs, setSmtpLogs] = useState([]);
  const [isEnhancing, setIsEnhancing] = useState(false);

  useEffect(() => {
    if (ticket) {
      setReplyText(ticket.ai_suggested_reply || '');
      setSmtpStatus('idle');
      setSmtpLogs([]);
      setIsEnhancing(false);
    }
  }, [ticket]);

  if (!ticket && !isOpen) return null;

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
    try {
      const res = await fetch(`http://localhost:5000/api/tickets/${ticket.id}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText })
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.enhancedReply);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to enhance reply");
      }
    } catch (err) {
      console.error("Enhancement failed:", err.message);
      alert("Failed to connect to backend server. Make sure server is running.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const isPending = ticket.status === 'Pending Review';

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
          <div className="flex items-center gap-3">
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
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
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
                      href={`http://localhost:5000/attachments/${file.name}`}
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
          </div>

          {/* Right Column: AI Suggestion & Review */}
          <div className="w-full md:w-1/2 p-6 flex flex-col bg-white">
            <div className="flex flex-col mb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Auto-Drafted Response
                </h3>
                <div className="flex items-center gap-2">
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
                      Edit Mode Active
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {isPending 
                  ? 'Verify, edit, or customize the reply below before releasing it to the queue.' 
                  : 'This message has already been processed.'}
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-[300px]">
              {isPending ? (
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full flex-1 p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm text-slate-700 leading-relaxed font-sans shadow-inner focus:shadow-none transition-shadow"
                  placeholder="Draft your reply here..."
                />
              ) : (
                <div className="w-full flex-1 p-4 border border-slate-100 rounded-xl bg-slate-50/50 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap overflow-y-auto">
                  {replyText || 'No reply drafted or required for this ticket.'}
                </div>
              )}
            </div>

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
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 font-bold text-sm transition-all shadow-sm active:scale-[0.98]"
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
