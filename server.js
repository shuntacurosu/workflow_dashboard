import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
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

// Get workflow config
app.get('/api/workflow', (req, res) => {
  const workflow = loadWorkflow();
  const tasksWithStatus = workflow.tasks.map(task => {
    const taskPath = path.resolve(__dirname, task.cwd);
    const logPath = path.join(taskPath, 'log', 'task.log');
    return {
      ...task,
      cwdExists: fs.existsSync(taskPath),
      logExists: fs.existsSync(logPath)
    };
  });
  res.json({ ...workflow, tasks: tasksWithStatus });
});

// Helper to get log file path for a task
function getLogFilePath(taskConfig) {
  return path.resolve(__dirname, taskConfig.cwd, 'log', 'task.log');
}

// Helper: read log content
function readLogFile(logPath) {
  try {
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8');
    }
    return '';
  } catch {
    return '';
  }
}

// Track polling per socket
const pollingIntervals = new Map();
// Track last known content per session (for change detection)
const lastContentMap = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('run-task', async (data) => {
    const { taskName } = data;
    const taskConfig = findTask(taskName);
    if (!taskConfig) {
      socket.emit('log', { taskName, data: `Error: Task ${taskName} not found in workflow.yaml\r\n` });
      return;
    }

    const taskPath = path.resolve(__dirname, taskConfig.cwd);
    if (!fs.existsSync(taskPath)) {
      socket.emit('log', { taskName, data: `Error: Task directory ${taskPath} not found.\r\n` });
      return;
    }

    // Tell frontend to clear terminal for fresh run
    socket.emit('clear-terminal', { taskName });

    const logDir = path.join(taskPath, 'log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'task.log');
    // Clear log file before running
    fs.writeFileSync(logPath, '');

    // Reset last known content
    lastContentMap.delete(taskName);

    try {
      console.log(`Starting task ${taskName} in ${taskPath} with ${taskConfig.command}`);
      // Launch batch file using start xxx.bat
      spawn('cmd.exe', ['/c', taskConfig.command], { 
        cwd: taskPath,
        detached: true,
        stdio: 'ignore'
      }).unref();
      
      socket.emit('session-started', { taskName });
    } catch (err) {
      console.error(`Failed to execute task: ${err.message}`);
      socket.emit('log', { taskName, data: `\x1b[31mFailed to start task: ${err.message}\x1b[0m\r\n` });
      return;
    }

    // Start polling the log file - stream log content to client
    startPolling(socket, taskName, logPath);
  });

  socket.on('switch-task', (data) => {
    const { taskName } = data;
    const taskConfig = findTask(taskName);
    
    // Stop any existing polling
    stopPolling(socket);

    if (taskConfig) {
      const logPath = getLogFilePath(taskConfig);
      
      // Reset delta tracking for this switch
      lastContentMap.delete(taskName);

      const logs = readLogFile(logPath);
      socket.emit('full-log', { taskName, data: logs.replace(/\n/g, '\r\n') });

      lastContentMap.set(taskName, logs);
      startPolling(socket, taskName, logPath);
    } else {
      socket.emit('full-log', { taskName, data: '' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    stopPolling(socket);
  });
});

function startPolling(socket, taskName, logPath) {
  stopPolling(socket);

  const interval = setInterval(() => {
    const content = readLogFile(logPath);
    const lastContent = lastContentMap.get(taskName) || '';

    if (content !== lastContent) {
      socket.emit('full-log', { taskName, data: content.replace(/\n/g, '\r\n') });
      lastContentMap.set(taskName, content);
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
