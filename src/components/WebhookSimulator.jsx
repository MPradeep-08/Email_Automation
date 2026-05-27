import React, { useState } from 'react';
import { Send, Loader2, Paperclip, Check } from 'lucide-react';
import { cn } from '../utils';

const MOCK_ATTACHMENTS = [
  { name: 'resume.pdf', size: '1.2 MB', type: 'application/pdf' },
  { name: 'screenshot.png', size: '850 KB', type: 'image/png' },
  { name: 'contract.docx', size: '420 KB', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
];

export function WebhookSimulator({ onSimulate, isSimulating, currentStage }) {
  const [formData, setFormData] = useState({
    senderEmail: 'jdoe.university@edu.com',
    subject: 'Inquiry regarding 2026 Caldim Internship',
    body: 'Hello,\n\nI am reaching out to ask if the Caldim Internship program for summer 2026 is still accepting applications. I have attached my resume and structurally detailed project portfolio for your review.\n\nThank you,\nJohn Doe',
  });
  
  const [selectedAttachments, setSelectedAttachments] = useState(['resume.pdf']);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleToggleAttachment = (name) => {
    if (isSimulating) return;
    setSelectedAttachments(prev => 
      prev.includes(name) 
        ? prev.filter(item => item !== name) 
        : [...prev, name]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSimulating) return;
    
    const attachmentsList = MOCK_ATTACHMENTS.filter(a => selectedAttachments.includes(a.name));
    onSimulate({
      ...formData,
      attachments: attachmentsList
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 h-full flex flex-col">
      <div className="mb-6 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-bold text-slate-800">Email Webhook Simulator</h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">Inject a mock payload to test parsing, routing, and auto-drafting.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">1. Mock Sender Address</label>
          <input 
            type="email" 
            name="senderEmail"
            required
            value={formData.senderEmail}
            onChange={handleChange}
            disabled={isSimulating}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 transition-colors"
            placeholder="e.g. sender@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">2. Subject Line</label>
          <input 
            type="text" 
            name="subject"
            required
            value={formData.subject}
            onChange={handleChange}
            disabled={isSimulating}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 transition-colors"
            placeholder="e.g. Inquiry regarding API Access"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">3. Email Body (Raw Message)</label>
          <textarea 
            name="body"
            required
            value={formData.body}
            onChange={handleChange}
            disabled={isSimulating}
            className="w-full h-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 resize-none transition-colors"
            placeholder="Type email body here..."
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
            4. Mock Attached Files ({selectedAttachments.length})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MOCK_ATTACHMENTS.map((file) => {
              const isSelected = selectedAttachments.includes(file.name);
              return (
                <button
                  type="button"
                  key={file.name}
                  disabled={isSimulating}
                  onClick={() => handleToggleAttachment(file.name)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-all",
                    isSelected 
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  <span className={cn(
                    "w-3 h-3 rounded-full flex items-center justify-center border",
                    isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                  )}>
                    {isSelected && <Check className="w-2 h-2" />}
                  </span>
                  {file.name} <span className="text-slate-400 font-normal">({file.size})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 mt-auto">
          <button
            type="submit"
            disabled={isSimulating}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-white font-bold text-sm transition-all",
              isSimulating 
                ? "bg-indigo-400 cursor-not-allowed" 
                : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:scale-[0.99]"
            )}
          >
            {isSimulating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Pipeline Active: {currentStage}...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Trigger Ingestion Pipeline
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
