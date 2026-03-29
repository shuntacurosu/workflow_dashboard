import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Play, Terminal as TerminalIcon, Folder, CheckCircle2 } from 'lucide-react';

const socket = io();

// Helper to colorize log levels for xterm.js
const colorizeLog = (text) => {
  if (!text) return text;
  // Split while preserving newlines
  const lines = text.split(/(\r\n|\n)/);
  return lines.map(line => {
    if (line === '\n' || line === '\r\n') return line;
    
    // Check for level tags and colorize accordingly
    if (line.includes('| SUCCESS  |')) {
      return `\x1b[32m${line}\x1b[0m`; // Entire line Green
    } else if (line.includes('| CRITICAL |')) {
      return `\x1b[37m\x1b[41m${line}\x1b[0m`; // White text on Red background
    } else if (line.includes('| ERROR    |')) {
      return `\x1b[31m${line}\x1b[0m`; // Entire line Red
    } else if (line.includes('| WARNING  |')) {
      return `\x1b[33m${line}\x1b[0m`; // Entire line Yellow
    } else if (line.includes('| INFO     |')) {
      // Only the tag Cyan
      return line.replace(/(\| INFO\s+\|)/g, '\x1b[36m$1\x1b[0m');
    } else if (line.includes('| DEBUG    |')) {
      return `\x1b[90m${line}\x1b[0m`; // Entire line Gray
    }
    return line;
  }).join('');
};

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
        xtermRef.current.write(colorizeLog(data));
      }
    };

    const handleLog = ({ taskName: tn, data }) => {
      if (tn !== selectedTask || !xtermRef.current) return;
      xtermRef.current.write(colorizeLog(data));
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

function App() {
  const [workflow, setWorkflow] = useState({ title: 'Workflow Dashboard', tasks: [] });
  const [selectedTask, setSelectedTask] = useState(null);
  const [runningTasks, setRunningTasks] = useState(new Set());

  useEffect(() => {
    fetch('/api/workflow')
      .then(res => res.json())
      .then(data => {
        setWorkflow(data);
        if (data.tasks.length > 0) setSelectedTask(data.tasks[0].name);
      });

    socket.on('session-started', ({ taskName }) => {
      setRunningTasks(prev => new Set(prev).add(taskName));
      // In this version, we don't automatically clear running state since tasks run externally.
      // We could add a timeout to clear it or just let the user run it again.
      // For simplicity, we'll clear the running state after 2 seconds to allow re-running.
      setTimeout(() => {
        setRunningTasks(prev => {
          const next = new Set(prev);
          next.delete(taskName);
          return next;
        });
      }, 2000);
    });

    return () => {
      socket.off('session-started');
    };
  }, []);

  const currentTask = workflow.tasks.find(t => t.name === selectedTask);

  const runTask = () => {
    if (!selectedTask || runningTasks.has(selectedTask)) return;
    setRunningTasks(prev => new Set(prev).add(selectedTask));
    socket.emit('run-task', { taskName: selectedTask });
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
      </header>

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
                    <div className={`w-2 h-2 rounded-full shrink-0 ${runningTasks.has(task.name) ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`} />
                    <span className="font-medium truncate">{task.label || task.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-5 text-[9px] uppercase tracking-wider font-bold">
                    <span className={`flex items-center gap-1 ${task.cwdExists ? 'text-green-500/80' : 'text-red-500/80'}`}>
                      <Folder size={10} /> CWD
                    </span>
                    <span className={`flex items-center gap-1 ${task.logExists ? 'text-blue-400/80' : 'text-slate-600'}`}>
                      <TerminalIcon size={10} /> LOG
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-[10px] text-slate-600 mt-1 ml-5 truncate">{task.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Content View */}
        <section className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden bg-slate-950">
          {currentTask ? (
            <>
              {/* Task Header */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-0.5">{currentTask.label || currentTask.name}</h2>
                    <p className="text-slate-400 text-sm">{currentTask.description}</p>
                    <p className="text-slate-600 text-xs mt-1 font-mono">{currentTask.command} • {currentTask.cwd}</p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={runTask}
                      disabled={runningTasks.has(selectedTask)}
                      className={`flex items-center gap-2 px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-blue-900/20 shrink-0 ${runningTasks.has(selectedTask)
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
                        }`}
                    >
                      <Play size={18} fill={runningTasks.has(selectedTask) ? 'none' : 'currentColor'} />
                      {runningTasks.has(selectedTask) ? 'Running...' : 'Run Task'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Area */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <TerminalIcon size={14} /> Execution Logs
                  </h3>
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
      </footer>
    </div>
  );
}

export default App;
