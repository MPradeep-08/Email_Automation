import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '../utils';

export function TerminalLog({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col h-[320px]">
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Pipeline Output Console</span>
      </div>
      <div className="p-4 overflow-y-auto flex-1 font-mono text-sm space-y-2">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">Waiting for incoming payload...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3">
              <span className="text-slate-500 shrink-0">
                {new Date(log.executed_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 })}
              </span>
              <span className={cn(
                "flex-1 break-words",
                log.step_name === 'SCAN' && "text-blue-300",
                log.step_name === 'READ' && "text-purple-300",
                log.step_name === 'PROCESS' && "text-amber-300",
                log.step_name === 'STORE' && "text-emerald-300"
              )}>
                {getStepIcon(log.step_name)} [{log.step_name}] {log.description}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function getStepIcon(step) {
  switch (step) {
    case 'SCAN': return '⚡';
    case 'READ': return '📖';
    case 'PROCESS': return '🧠';
    case 'STORE': return '🗄️';
    default: return '►';
  }
}
