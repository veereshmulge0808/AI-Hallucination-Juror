import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { ShieldCheck, Server, Search, CheckCircle2, AlertTriangle, Shield, Scale, Send, Check, Menu, Plus, Edit2, Folder } from 'lucide-react';
import { generateDraft, factCheckDraft, logicCheckDraft, safetyCheckDraft, finalJudge, FinalJudgment, boundaryGuardCheck, contextCheckDraft, MemoryEntry } from './services/ai';
import ParticleBackground from './components/ParticleBackground';
import { ReliabilityGauge } from './components/ReliabilityGauge';

type AgentStatus = 'idle' | 'running' | 'done' | 'error';

interface Interaction {
  id: string;
  query: string;
  statuses: Record<string, AgentStatus>;
  result: FinalJudgment | null;
  error: string | null;
  rejected: { reason: string } | null;
}

interface Session {
  id: string;
  name: string;
  interactions: Interaction[];
  memory: MemoryEntry[];
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const statusComponents = [
  { key: 'guard', label: 'Boundary Guard', icon: <Shield className="w-4 h-4" /> },
  { key: 'generator', label: 'Generator', icon: <Server className="w-4 h-4" /> },
  { key: 'fact', label: 'Fact Checker', icon: <Search className="w-4 h-4" /> },
  { key: 'logic', label: 'Logic Checker', icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: 'safety', label: 'Safety Checker', icon: <Shield className="w-4 h-4" /> },
  { key: 'judge', label: 'Final Judge', icon: <Scale className="w-4 h-4" /> },
];

export default function App() {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem('truenode_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [{ id: generateId(), name: 'New Project', interactions: [], memory: [] }];
  });
  
  const [activeSessionId, setActiveSessionId] = useState<string>(sessions[0]?.id || generateId());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const interactions = activeSession?.interactions || [];
  const memory = activeSession?.memory || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

  useEffect(() => {
    localStorage.setItem('truenode_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const handleNewChat = () => {
    const newSession = { id: generateId(), name: 'New Project', interactions: [], memory: [] };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    if (!isSidebarOpen) setIsSidebarOpen(true);
  };

  const handleVerify = async () => {
    if (!query.trim()) return;
    const userQuery = query.trim();
    const newId = Date.now().toString();

    const newInteraction: Interaction = {
      id: newId,
      query: userQuery,
      statuses: {
        guard: 'idle',
        generator: 'idle',
        fact: 'idle',
        logic: 'idle',
        safety: 'idle',
        judge: 'idle',
      },
      result: null,
      error: null,
      rejected: null
    };

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const newName = s.name === 'New Project' ? userQuery.slice(0, 30) + (userQuery.length > 30 ? '...' : '') : s.name;
        return { ...s, name: newName, interactions: [...s.interactions, newInteraction] };
      }
      return s;
    }));
    setQuery('');
    setIsProcessing(true);

    const updateInteraction = (updateFn: (i: Interaction) => Interaction) => {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, interactions: s.interactions.map(i => i.id === newId ? updateFn(i) : i) };
        }
        return s;
      }));
    };

    const updateMemory = (newMemory: MemoryEntry[]) => {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, memory: newMemory };
        }
        return s;
      }));
    };

    try {
      /* 
       * ==========================================
       * [WEBHOOK/API INTEGRATION PLACEHOLDER]
       * Replace the internal service calls below with your API fetch logic:
       * 
       * const response = await fetch('YOUR_WEBHOOK_URL', {
       *   method: 'POST',
       *   headers: { 'Content-Type': 'application/json' },
       *   body: JSON.stringify({ query: userQuery, history: memory, sessionId: activeSessionId })
       * });
       * const judgment = await response.json();
       * ==========================================
       */

      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, guard: 'running' } }));
      
      const guardResult = await boundaryGuardCheck(userQuery);
      if (!guardResult.passed) {
        updateInteraction(i => ({ ...i, statuses: { ...i.statuses, guard: 'error' }, rejected: { reason: guardResult.reason } }));
        setIsProcessing(false);
        return;
      }

      if (guardResult.type === 'CASUAL') {
        updateInteraction(i => ({ 
          ...i, 
          statuses: { guard: 'done', generator: 'done', fact: 'done', logic: 'done', safety: 'done', judge: 'done' },
          result: {
            factCheck: 'N/A - Casual Conversation',
            logicMathCheck: 'N/A - Casual Conversation',
            memoryCheck: 'Persona Active',
            correctionsMade: 'None needed',
            reliabilityScore: 100,
            verifiedOutput: guardResult.casualResponse || "Protocol check complete. I am TrueNode, optimized for technical verification. How can I assist with your infrastructure today?"
          }
        }));
        setIsProcessing(false);
        return;
      }

      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, guard: 'done' } }));

      const contextResult = await contextCheckDraft(userQuery, memory);
      const newMemory = contextResult.isMatch ? memory : [];
      if (!contextResult.isMatch && memory.length > 0) {
        updateMemory([]);
      }
      
      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, generator: 'running' } }));
      const memoryText = newMemory.map(m => `Old Prompt: ${m.query}\nOutput: ${m.verifiedOutput}`).join('\n\n');

      const draft = await generateDraft(userQuery, memoryText);
      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, generator: 'done', fact: 'running', logic: 'running', safety: 'running' } }));
      
      const [factReport, logicReport, safetyReport] = await Promise.all([
        factCheckDraft(userQuery, draft, memoryText).then(r => {
          updateInteraction(i => ({ ...i, statuses: { ...i.statuses, fact: 'done' } }));
          return r;
        }),
        logicCheckDraft(userQuery, draft, memoryText).then(r => {
          updateInteraction(i => ({ ...i, statuses: { ...i.statuses, logic: 'done' } }));
          return r;
        }),
        safetyCheckDraft(userQuery, draft, memoryText).then(r => {
          updateInteraction(i => ({ ...i, statuses: { ...i.statuses, safety: 'done' } }));
          return r;
        })
      ]);

      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, judge: 'running' } }));
      const judgment = await finalJudge(userQuery, draft, factReport!, logicReport!, safetyReport!, contextResult.note);
      updateInteraction(i => ({ ...i, statuses: { ...i.statuses, judge: 'done' }, result: judgment }));
      
      updateMemory([...(contextResult.isMatch ? memory : []), { query: userQuery, verifiedOutput: judgment.verifiedOutput }]);
    } catch (err: any) {
      updateInteraction(i => ({
        ...i,
        error: err.message || 'An error occurred during verification.',
        statuses: { guard: 'error', generator: 'error', fact: 'error', logic: 'error', safety: 'error', judge: 'error' }
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVerify();
    }
  };

  return (
    <div className="flex flex-row h-screen text-neutral-50 font-sans selection:bg-blue-500/30 overflow-hidden bg-[#050a14]">
      <ParticleBackground />
      
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full shrink-0 flex flex-col z-20 border-r border-blue-500/10 glass-panel border-y-0 border-l-0 rounded-none bg-black/40"
          >
            <div className="p-4 border-b border-white/5">
               <button
                 onClick={handleNewChat}
                 className="w-full flex items-center justify-center gap-2 bg-blue-600/90 hover:bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] text-white px-4 py-3 rounded-xl transition-all font-semibold tracking-wide"
               >
                 <Plus className="w-5 h-5" /> New Project
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 overflow-x-hidden">
               <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 mb-2 pl-2">History</div>
               {sessions.map(s => (
                 <div
                   key={s.id}
                   onClick={() => {
                     setEditingSessionId(null);
                     setActiveSessionId(s.id);
                   }}
                   className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                     activeSessionId === s.id
                       ? 'bg-blue-500/20 border-blue-500/30 shadow-[inset_0_0_15px_rgba(59,130,246,0.1)] text-blue-100'
                       : 'bg-transparent border-transparent hover:bg-white/5 text-neutral-400 hover:text-neutral-200'
                   }`}
                 >
                   <Folder className={`w-4 h-4 shrink-0 ${activeSessionId === s.id ? 'text-blue-400' : 'text-neutral-500'}`} />
                   
                   {editingSessionId === s.id ? (
                     <input
                       autoFocus
                       value={editingName}
                       onChange={(e) => setEditingName(e.target.value)}
                       onBlur={() => {
                         setEditingSessionId(null);
                         if (editingName.trim()) {
                           setSessions(prev => prev.map(session => session.id === s.id ? { ...session, name: editingName.trim() } : session));
                         }
                       }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') e.currentTarget.blur();
                       }}
                       className="flex-1 bg-black/50 border border-blue-500/50 rounded px-2 py-0.5 text-sm outline-none text-white w-full"
                       onClick={e => e.stopPropagation()}
                     />
                   ) : (
                     <span className="flex-1 text-sm truncate font-medium">
                       {s.name}
                     </span>
                   )}
                   
                   {activeSessionId === s.id && editingSessionId !== s.id && (
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         setEditingName(s.name);
                         setEditingSessionId(s.id);
                       }}
                       className="p-1 hover:bg-blue-500/30 rounded text-blue-300 transition-colors opacity-0 group-hover:opacity-100"
                     >
                       <Edit2 className="w-3.5 h-3.5" />
                     </button>
                   )}
                 </div>
               ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header */}
        <header className="glass-panel border-x-0 border-t-0 rounded-none z-10 p-4 px-6 flex items-center justify-between shrink-0 shadow-lg relative">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg text-neutral-300 transition-colors shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="truncate">
              <h1 className="text-xl font-bold tracking-tight text-white glow-text-blue truncate">TrueNode</h1>
              <p className="text-neutral-400 text-xs font-mono tracking-widest uppercase truncate">The Verdict Engine</p>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8 scroll-smooth">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-8">
          
          {interactions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center opacity-60">
              <ShieldCheck className="w-16 h-16 text-blue-500 mb-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
              <h2 className="text-2xl font-bold">System Ready</h2>
              <p className="text-neutral-400 max-w-md mt-2">Enter code, logs, or technical concepts to initiate the multi-agent verification protocol.</p>
            </div>
          )}

          {interactions.map(interaction => {
            const isFinished = interaction.result || interaction.error || interaction.rejected;
            
            return (
              <div key={interaction.id} className="flex flex-col gap-6">
                
                {/* User Message */}
                <div className="self-end max-w-[85%] sm:max-w-[75%]">
                  <div className="msg-user p-4 shadow-lg text-sm sm:text-base text-neutral-100 whitespace-pre-wrap">
                    {interaction.query}
                  </div>
                </div>

                {/* AI Response Container */}
                <div className="self-start max-w-[95%] sm:max-w-[85%] w-full">
                  <div className="msg-ai p-1 shadow-2xl relative overflow-hidden">
                    <div className="p-4 sm:p-6 flex flex-col gap-6">
                      
                      {/* Active Statuses UI - Redesigned */}
                      {(!isFinished || Object.values(interaction.statuses).some(s => s === 'error')) && (
                        <div className="flex flex-col gap-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 p-5 shadow-inner">
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,1)]"></div>
                               <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Multi-Agent Verification Pipeline</span>
                             </div>
                             <span className="text-[10px] font-mono text-neutral-500">Status: {isProcessing ? 'Active Processing' : 'Halted'}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {statusComponents.map((step) => {
                              const status = interaction.statuses[step.key];
                              return (
                                <div 
                                  key={step.key}
                                  className={`relative group flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                                    status === 'running' 
                                      ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)] scale-[1.02]' 
                                      : status === 'done'
                                        ? 'border-emerald-500/20 bg-emerald-500/5 opacity-80'
                                        : status === 'error'
                                          ? 'border-red-500/50 bg-red-500/10'
                                          : 'border-white/5 bg-black/20 opacity-30'
                                  }`}
                                >
                                  {status === 'running' && (
                                    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                                      <div className="absolute top-0 left-0 w-full h-[1px] bg-blue-400/50 animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                  )}
                                  <div className={`shrink-0 p-2 rounded-lg transition-colors ${
                                    status === 'running' ? 'text-blue-400 bg-blue-500/20 glow-text-blue' : 
                                    status === 'done' ? 'text-emerald-400 bg-emerald-500/20' : 
                                    status === 'error' ? 'text-red-400 bg-red-500/20' : 
                                    'text-neutral-600 bg-black/40'
                                  }`}>
                                    {status === 'done' ? <Check className="w-4 h-4" /> : step.icon}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 truncate">
                                      {step.label}
                                    </span>
                                    {status === 'running' && (
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] text-blue-400/80 font-medium">Verifying</span>
                                        <div className="flex gap-0.5">
                                          <div className="w-0.5 h-0.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]"></div>
                                          <div className="w-0.5 h-0.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]"></div>
                                          <div className="w-0.5 h-0.5 rounded-full bg-blue-400 animate-bounce"></div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Error Display */}
                      {interaction.error && (
                        <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex gap-3 text-red-400">
                          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                          <p className="text-sm">{interaction.error}</p>
                        </div>
                      )}

                      {/* Rejected Display */}
                      {interaction.rejected && (
                        <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex flex-col gap-3">
                          <div className="flex items-center gap-2 border-b border-red-500/20 pb-3">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <h2 className="font-bold text-red-400 glow-text-red">🚨 SYSTEM FAILURE: REJECTED PROMPT</h2>
                          </div>
                          <div className="space-y-2 text-sm text-red-200 font-mono">
                            <div><span className="font-bold text-red-400">Status:</span> FAILED - ILLOGICAL OR OUT OF SCOPE</div>
                            <div><span className="font-bold text-red-400">Reason:</span> {interaction.rejected.reason}</div>
                            <div><span className="font-bold text-red-400">Reliability Score:</span> 0%</div>
                          </div>
                        </div>
                      )}

                      {/* Result Display */}
                      {interaction.result && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-6"
                        >
                          <div className="flex flex-col md:flex-row gap-6 items-start">
                            <div className="shrink-0 flex justify-center w-full md:w-auto mt-4 md:mt-0">
                               <ReliabilityGauge score={interaction.result.reliabilityScore} />
                            </div>
                            <div className="flex-1 grid gap-4 sm:grid-cols-2 text-sm">
                              <div className="sm:col-span-2">
                                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <Search className="w-3.5 h-3.5" /> Context Memory
                                </h3>
                                <p className="text-neutral-300 bg-black/30 rounded p-2.5 border border-white/5 font-mono text-xs">
                                  {interaction.result.memoryCheck || "Fresh Start"}
                                </p>
                              </div>
                              <div>
                                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <Search className="w-3.5 h-3.5" /> Fact Check
                                </h3>
                                <p className="text-neutral-300 bg-black/30 rounded p-2.5 border border-white/5 h-full">
                                  {interaction.result.factCheck}
                                </p>
                              </div>
                              <div>
                                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Logic/Math
                                </h3>
                                <p className="text-neutral-300 bg-black/30 rounded p-2.5 border border-white/5 h-full">
                                  {interaction.result.logicMathCheck}
                                </p>
                              </div>
                              <div className="sm:col-span-2">
                                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Corrections Made
                                </h3>
                                <p className="text-amber-400/90 bg-amber-500/10 rounded p-2.5 border border-amber-500/20">
                                  {interaction.result.correctionsMade}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-white/10 pt-4 mt-2">
                            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4" /> Verified Technical Output
                            </h3>
                            <div className="prose prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-blue text-sm">
                              <ReactMarkdown>{interaction.result.verifiedOutput}</ReactMarkdown>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          <div ref={bottomRef} className="h-4" />
        </div>
      </main>

        {/* Input Area */}
        <footer className="glass-panel border-x-0 border-b-0 rounded-none z-10 shrink-0 p-4">
          <div className="max-w-4xl mx-auto flex items-end gap-3 bg-black/40 border border-blue-500/20 rounded-2xl p-2 shadow-inner focus-within:border-blue-500/50 transition-colors">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt here... (Shift+Enter for new line)"
              className="flex-1 bg-transparent border-0 resize-none max-h-48 min-h-[44px] p-2 px-3 text-neutral-100 placeholder-neutral-500 focus:ring-0 text-sm md:text-base outline-none"
              rows={query.split('\n').length > 1 ? query.split('\n').length : 1}
            />
            <button
              onClick={handleVerify}
              disabled={isProcessing || !query.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mx-1 mb-1"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="max-w-4xl mx-auto flex justify-between items-center mt-2 px-2">
              <div className="text-[10px] text-neutral-500 font-mono flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                 API CONNECTED // Webhook Logic Ready
              </div>
              <p className="text-[10px] text-neutral-500 font-mono tracking-wider">Powered by Gemini 3.1 Flash Lite</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
