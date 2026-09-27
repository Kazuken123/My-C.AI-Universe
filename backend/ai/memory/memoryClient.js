import { spawn } from 'child_process';
import path from 'path';
import { config, PROJECT_ROOT } from '../../config/index.js';

class MemoryClient {
  constructor() {
    this.pythonProcess = null;
    this.serviceUrl = config.MEMORY_SERVICE_URL || 'http://localhost:5001';
    this.isRunning = false;
  }

  /**
   * Check whether the Python memory microservice is reachable
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      this.isRunning = response.ok;
      return this.isRunning;
    } catch {
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Start the Python memory service (optional enhancement)
   */
  async startService() {
    if (await this.checkHealth()) {
      console.log('[MEMORY] Python memory service already running');
      return;
    }

    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    try {
      const { execSync } = await import('child_process');
      execSync(`${pythonPath} --version`, { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      console.log('[MEMORY] Python not found, using built-in Node.js semantic memory engine');
      return;
    }

    const serviceDir = path.join(PROJECT_ROOT, 'memory-service');
    const servicePath = path.join(serviceDir, 'memory_service.py');

    return new Promise((resolve) => {
      this.pythonProcess = spawn(pythonPath, [servicePath], {
        cwd: serviceDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.pythonProcess.stdout.on('data', (data) => {
        console.log(`[PY-MEMORY] ${data.toString().trim()}`);
      });

      this.pythonProcess.stderr.on('data', (data) => {
        console.error(`[PY-MEMORY ERR] ${data.toString().trim()}`);
      });

      this.pythonProcess.on('close', () => {
        this.isRunning = false;
      });

      this.waitForService(10).then(() => {
        this.isRunning = true;
        console.log('[MEMORY] Python embedding service started');
        resolve();
      }).catch(() => {
        console.log('[MEMORY] Using built-in Node.js semantic memory engine');
        resolve();
      });
    });
  }

  async waitForService(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkHealth()) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Python memory service timeout');
  }

  stopService() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
      this.isRunning = false;
    }
  }

  async addMemory(content, characterId, metadata = {}) {
    if (!this.isRunning && !(await this.checkHealth())) return null;
    try {
      const response = await fetch(`${this.serviceUrl}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, character_id: characterId, metadata })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.memory_id;
    } catch {
      return null;
    }
  }

  async retrieveMemories(query, characterId, topK = 3, threshold = 0.25) {
    if (!this.isRunning && !(await this.checkHealth())) return null;
    try {
      const response = await fetch(`${this.serviceUrl}/memories/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          character_id: characterId,
          top_k: topK,
          threshold
        })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.memories || null;
    } catch {
      return null;
    }
  }
}

export const memoryClient = new MemoryClient();
