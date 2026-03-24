import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Play, Terminal as TerminalIcon, Folder, CheckCircle2, Layers, X, Trash2 } from 'lucide-react';

const socket = io();

function TerminalComponent({ selectedTask }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);

  // Create terminal once
  useEffect(() => {
    if (!terminalRef.current) return;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e293b',
        foreground: '#f8fafc',
      },
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      convertEol: false,
      scrollback: 5000,
    });

    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;

    const handleResize = () => {
      if (fitAddonRef.current) fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // When selected task changes, request the session content
  useEffect(() => {
    if (!selectedTask) return;

    // Clear terminal when switching tasks
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.reset();
    }

    // Request session content for selected task
    socket.emit('switch-task', { taskName: selectedTask });
  }, [selectedTask]);

  // Listen for events
  useEffect(() => {
    const handleFullLog = ({ taskName: tn, data }) => {
      if (tn !== selectedTask || !xtermRef.current) return;
      // Full replacement: clear and write
      xtermRef.current.clear();
      xtermRef.current.reset();
      if (data) {
        xtermRef.current.write(data);
      }
    };

    const handleLog = ({ taskName: tn, data }) => {
      if (tn !== selectedTask || !xtermRef.current) return;
      xtermRef.current.write(data);
    };

    const handleClear = ({ taskName: tn }) => {
      if (tn !== selectedTask || !xtermRef.current) return;
      xtermRef.current.clear();
      xtermRef.current.reset();
    };

    socket.on('full-log', handleFullLog);
    socket.on('log', handleLog);
    socket.on('clear-terminal', handleClear);

    return () => {
      socket.off('full-log', handleFullLog);
      socket.off('log', handleLog);
      socket.off('clear-terminal', handleClear);
    };
  }, [selectedTask]);

  return (
    <div className="w-full h-full bg-[#1e293b] rounded-lg overflow-hidden border border-slate-700">
      <div ref={terminalRef} className="w-full h-full p-2" />
    </div>
  );
}

function SessionModal({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [killing, setKilling] = useState(new Set());

  const fetchSessions = useCallback(() => {
    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => setSessions(data))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, [isOpen, fetchSessions]);

  const killSession = async (name) => {
    setKilling(prev => new Set(prev).add(name));
    try {
      await fetch(`/api/sessions/${encodeURIComponent(name)}`, { method: 'DELETE' });
      // Wait a moment then refresh
      setTimeout(fetchSessions, 500);
    } catch (err) {
      console.error('Failed to kill session:', err);
    } finally {
      setKilling(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[560px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Layers size={20} className="text-blue-400" />
            <h2 className="text-lg font-bold text-white">Active tmux Sessions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Layers size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active sessions</p>
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.name}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-mono font-bold text-sm text-white truncate">{session.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 ml-4 truncate">{session.info}</p>
                </div>
                <button
                  onClick={() => killSession(session.name)}
                  disabled={killing.has(session.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${killing.has(session.name)
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-red-900/30 text-red-400 hover:bg-red-900/60 hover:text-red-300 active:scale-95'
                    }`}
                >
                  <Trash2 size={12} />
                  {killing.has(session.name) ? 'Killing...' : 'Kill'}
                </button>
              </div>
            ))
          )}
        </div>
        {/* Footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 uppercase">
          <span>Auto-refresh: 3s</span>
          <span>{sessions.length} session(s)</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [workflow, setWorkflow] = useState({ title: 'Workflow Dashboard', tasks: [] });
  const [selectedTask, setSelectedTask] = useState(null);
  const [argValues, setArgValues] = useState({}); // { taskName: { argName: value } }
  const [runningTasks, setRunningTasks] = useState(new Set());
  const [sessionTasks, setSessionTasks] = useState(new Set());
  const [showSessionModal, setShowSessionModal] = useState(false);

  useEffect(() => {
    fetch('/api/workflow')
      .then(res => res.json())
      .then(data => {
        setWorkflow(data);
        if (data.tasks.length > 0) setSelectedTask(data.tasks[0].name);
        const existing = new Set(data.tasks.filter(t => t.hasSession).map(t => t.name));
        setSessionTasks(existing);
        // Initialize default values for all tasks
        const defaults = {};
        data.tasks.forEach(task => {
          defaults[task.name] = {};
          [...(task.args?.required || []), ...(task.args?.optional || [])].forEach(arg => {
            defaults[task.name][arg.name] = arg.default !== undefined ? String(arg.default) : '';
          });
        });
        setArgValues(defaults);
      });

    socket.on('session-started', ({ taskName }) => {
      setRunningTasks(prev => new Set(prev).add(taskName));
      setSessionTasks(prev => new Set(prev).add(taskName));
    });

    socket.on('task-finished', ({ taskName }) => {
      setRunningTasks(prev => {
        const next = new Set(prev);
        next.delete(taskName);
        return next;
      });
    });

    return () => {
      socket.off('session-started');
      socket.off('task-finished');
    };
  }, []);

  const currentTask = workflow.tasks.find(t => t.name === selectedTask);

  const setArgValue = (taskName, argName, value) => {
    setArgValues(prev => ({
      ...prev,
      [taskName]: { ...(prev[taskName] || {}), [argName]: value }
    }));
  };

  const buildArgs = () => {
    if (!currentTask) return '';
    const vals = argValues[currentTask.name] || {};
    const allArgs = [...(currentTask.args?.required || []), ...(currentTask.args?.optional || [])];
    return allArgs
      .filter(arg => vals[arg.name] !== undefined && vals[arg.name] !== '')
      .map(arg => `${arg.flag} ${vals[arg.name]}`)
      .join(' ');
  };

  const canRun = () => {
    if (!currentTask) return false;
    const vals = argValues[currentTask.name] || {};
    return (currentTask.args?.required || []).every(arg => vals[arg.name] && vals[arg.name].trim() !== '');
  };

  const runTask = () => {
    if (!selectedTask || !canRun()) return;
    setRunningTasks(prev => new Set(prev).add(selectedTask));
    const args = buildArgs();
    socket.emit('run-task', { taskName: selectedTask, args });
  };

  const renderArgField = (arg, isRequired) => {
    const value = argValues[selectedTask]?.[arg.name] || '';

    return (
      <div key={arg.name} className="flex flex-col gap-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          {arg.description || arg.name}
          {isRequired && <span className="text-red-400">*</span>}
        </label>
        {arg.type === 'select' ? (
          <select
            value={value}
            onChange={(e) => setArgValue(selectedTask, arg.name, e.target.value)}
            className="bg-slate-800 border border-slate-700 text-sm px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-200"
          >
            {(arg.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={arg.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => setArgValue(selectedTask, arg.name, e.target.value)}
            placeholder={arg.placeholder || arg.default?.toString() || ''}
            className={`bg-slate-800 border text-sm px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isRequired && !value.trim() ? 'border-red-500/50' : 'border-slate-700'
              }`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <TerminalIcon className="text-blue-400 w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            {workflow.title}
          </h1>
        </div>
        <button
          onClick={() => setShowSessionModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-sm font-medium border border-slate-700"
        >
          <Layers size={16} />
          Sessions
        </button>
      </header>

      <SessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} />

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Folder size={14} /> Tasks
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {workflow.tasks.map(task => (
              <button
                key={task.name}
                onClick={() => setSelectedTask(task.name)}
                className={`w-full text-left px-4 py-3 rounded-md transition-all flex items-center justify-between group ${selectedTask === task.name
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50'
                    : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'
                  }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${runningTasks.has(task.name)
                        ? 'bg-green-500 animate-pulse'
                        : sessionTasks.has(task.name)
                          ? 'bg-yellow-500'
                          : 'bg-slate-700'
                      }`} />
                    <span className="font-medium truncate">{task.label || task.name}</span>
                  </div>
                  {task.description && (
                    <p className="text-[10px] text-slate-600 mt-0.5 ml-5 truncate">{task.description}</p>
                  )}
                </div>
                {sessionTasks.has(task.name) && !runningTasks.has(task.name) && (
                  <span className="text-[10px] text-yellow-500 font-mono shrink-0 ml-2">tmux</span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Content View */}
        <section className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden bg-slate-950">
          {currentTask ? (
            <>
              {/* Task Header + Args */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-0.5">{currentTask.label || currentTask.name}</h2>
                    <p className="text-slate-400 text-sm">{currentTask.description}</p>
                    <p className="text-slate-600 text-xs mt-1 font-mono">{currentTask.command} • {currentTask.cwd}</p>
                  </div>
                  <button
                    onClick={runTask}
                    disabled={!canRun() || runningTasks.has(selectedTask)}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-blue-900/20 shrink-0 ${!canRun() || runningTasks.has(selectedTask)
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
                      }`}
                  >
                    <Play size={18} fill={(!canRun() || runningTasks.has(selectedTask)) ? 'none' : 'currentColor'} />
                    {runningTasks.has(selectedTask) ? 'Running...' : 'Run Task'}
                  </button>
                </div>

                {/* Argument Fields */}
                {((currentTask.args?.required?.length || 0) + (currentTask.args?.optional?.length || 0)) > 0 && (
                  <div className="border-t border-slate-800 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      {(currentTask.args?.required || []).map(arg => renderArgField(arg, true))}
                      {(currentTask.args?.optional || []).map(arg => renderArgField(arg, false))}
                    </div>
                  </div>
                )}
              </div>

              {/* Terminal Area */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <TerminalIcon size={14} /> Execution Logs
                  </h3>
                  {runningTasks.has(selectedTask) && (
                    <span className="flex items-center gap-2 text-xs text-green-400 font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      Streaming live output
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <TerminalComponent selectedTask={selectedTask} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <TerminalIcon size={48} className="mb-4 opacity-20" />
              <p className="text-lg">Select a task from the sidebar to begin</p>
            </div>
          )}
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-[10px] font-medium text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><CheckCircle2 size={10} className="text-green-500" /> System Online</span>
          <span className="border-l border-slate-800 pl-4">Backend: localhost:3001</span>
        </div>
        <div>
          {runningTasks.size > 0 ? (
            <span className="text-blue-400">{runningTasks.size} Task(s) Active</span>
          ) : (
            <span>Ready</span>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
