import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const WORKFLOW_FILE = path.join(__dirname, 'workflow.yaml');

// Load workflow config
function loadWorkflow() {
  if (!fs.existsSync(WORKFLOW_FILE)) {
    return { title: 'Workflow Dashboard', tasks: [] };
  }
  return yaml.load(fs.readFileSync(WORKFLOW_FILE, 'utf8'));
}

// Find a task in the workflow config
function findTask(taskName) {
  const workflow = loadWorkflow();
  return workflow.tasks.find(t => t.name === taskName);
}

// Helper: tmux session name for a task
function sessionName(taskName) {
  return `wf-${taskName}`;
}

// Helper: check if tmux session exists
function hasSession(name) {
  try {
    execSync(`tmux has-session -t ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper: kill tmux session - force kill with retries
async function killSessionAsync(name) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!hasSession(name)) return true;
    try {
      execSync(`tmux kill-session -t ${name}`, { stdio: 'ignore' });
    } catch { /* ignore */ }
    // Wait for psmux to clean up
    await new Promise(r => setTimeout(r, 500));
  }
  return !hasSession(name);
}

// Helper: capture tmux pane content (full scrollback)
function capturePane(name) {
  try {
    const output = execSync(`tmux capture-pane -t ${name} -p -S -`, { encoding: 'utf8' });
    return output;
  } catch {
    return '';
  }
}

// Get workflow config (title + tasks with session status)
app.get('/api/workflow', (req, res) => {
  const workflow = loadWorkflow();
  const tasksWithStatus = workflow.tasks.map(task => ({
    ...task,
    hasSession: hasSession(sessionName(task.name))
  }));
  res.json({ ...workflow, tasks: tasksWithStatus });
});

// Get current pane content for a task's tmux session
app.get('/api/tasks/:taskName/logs', (req, res) => {
  const { taskName } = req.params;
  const sName = sessionName(taskName);
  if (!hasSession(sName)) {
    return res.json({ exists: false, logs: '' });
  }
  const logs = capturePane(sName);
  res.json({ exists: true, logs });
});

// List all tmux sessions
app.get('/api/sessions', (req, res) => {
  try {
    const output = execSync('tmux ls', { encoding: 'utf8' });
    const sessions = output.trim().split('\n').filter(Boolean).map(line => {
      // Parse lines like: "wf-task_a: 1 windows (created Mon Mar 25 08:08:23 2026)"
      const match = line.match(/^([^:]+):(.*)$/);
      if (match) {
        return { name: match[1].trim(), info: match[2].trim() };
      }
      return { name: line.trim(), info: '' };
    });
    res.json(sessions);
  } catch {
    // No sessions exist
    res.json([]);
  }
});

// Kill a specific tmux session
app.delete('/api/sessions/:name', async (req, res) => {
  const { name } = req.params;
  const killed = await killSessionAsync(name);
  if (killed) {
    lastContentMap.delete(name);
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to kill session' });
  }
});

// Track polling per socket
const pollingIntervals = new Map();
// Track last known content per session (for change detection)
const lastContentMap = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('run-task', async (data) => {
    const { taskName, args } = data;
    const sName = sessionName(taskName);

    // Look up task config
    const taskConfig = findTask(taskName);
    if (!taskConfig) {
      socket.emit('log', { taskName, data: `Error: Task ${taskName} not found in workflow.json\r\n` });
      return;
    }

    const taskPath = path.resolve(__dirname, taskConfig.cwd);
    if (!fs.existsSync(taskPath)) {
      socket.emit('log', { taskName, data: `Error: Task directory ${taskPath} not found.\r\n` });
      return;
    }

    // Stop existing polling before killing session
    stopPolling(socket);

    // Tell frontend to clear terminal for fresh run
    socket.emit('clear-terminal', { taskName });

    // Kill existing session and WAIT for it to fully terminate
    const killed = await killSessionAsync(sName);
    if (!killed) {
      socket.emit('log', { taskName, data: `\x1b[31mWarning: Could not fully kill old session ${sName}\x1b[0m\r\n` });
    }

    // Reset last known content
    lastContentMap.delete(sName);

    // Build the command from config + args
    const fullCmd = `${taskConfig.command} ${args}`.trim();

    // Create a new detached tmux session running the command
    const tmuxCmd = `tmux new-session -s ${sName} -d -- cmd /K "cd /d ${taskPath} && echo. && echo ^> ${fullCmd} && echo. && ${fullCmd}"`;

    console.log(`Creating session: ${tmuxCmd}`);

    try {
      execSync(tmuxCmd, { encoding: 'utf8' });
      console.log(`Session ${sName} created successfully`);
      socket.emit('session-started', { taskName, session: sName });
    } catch (err) {
      console.error(`Failed to create session: ${err.message}`);
      socket.emit('log', { taskName, data: `\x1b[31mFailed to create tmux session: ${err.message}\x1b[0m\r\n` });
      return;
    }

    // Start polling - stream tmux pane content to client
    startPolling(socket, taskName, sName);
  });

  socket.on('switch-task', (data) => {
    const { taskName } = data;
    const sName = sessionName(taskName);

    // Stop any existing polling
    stopPolling(socket);

    if (hasSession(sName)) {
      // Reset delta tracking for this switch
      lastContentMap.delete(sName);

      // Send current full pane content once
      const logs = capturePane(sName);
      socket.emit('full-log', { taskName, data: logs.replace(/\n/g, '\r\n') });

      // Track as last known content for future deltas
      lastContentMap.set(sName, logs);

      // Start polling for live updates
      startPolling(socket, taskName, sName);
    } else {
      // No session - send empty to show initial state
      socket.emit('full-log', { taskName, data: '' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    stopPolling(socket);
    // Sessions persist - do NOT kill them
  });
});

function startPolling(socket, taskName, sName) {
  stopPolling(socket);

  let unchangedCount = 0;
  let wasRunning = true;

  const interval = setInterval(() => {
    if (!hasSession(sName)) {
      socket.emit('task-finished', { taskName });
      clearInterval(interval);
      pollingIntervals.delete(socket.id);
      return;
    }

    const content = capturePane(sName);
    const lastContent = lastContentMap.get(sName) || '';

    if (content !== lastContent) {
      unchangedCount = 0;
      socket.emit('full-log', { taskName, data: content.replace(/\n/g, '\r\n') });
      lastContentMap.set(sName, content);
    } else {
      unchangedCount++;
      // If content hasn't changed for 10 polls (5s), task likely finished
      if (wasRunning && unchangedCount >= 10) {
        wasRunning = false;
        socket.emit('task-finished', { taskName });
      }
    }
  }, 500);

  pollingIntervals.set(socket.id, interval);
}

function stopPolling(socket) {
  const interval = pollingIntervals.get(socket.id);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(socket.id);
  }
}

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
