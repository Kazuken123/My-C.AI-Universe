import { spawn } from 'child_process';
import path from 'path';
import { config, PROJECT_ROOT } from '../../config/index.js';

const ALLOWED_MEMORY_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

class MemoryClient {
  constructor() {
    this.pythonProcess = null;
    const configuredUrl = config.MEMORY_SERVICE_URL || 'http://localhost:5001';
    this.serviceUrl = this.isAllowedServiceUrl(configuredUrl) ? configuredUrl.replace(/\/+$/, '') : 'http://localhost:5001';
    this.isRunning = false;
    this.lastHealthCheckFailedAt = 0;
    this.healthCheckCooldownMs = 30000;
    this.requestTimeoutMs = 3000;
  }

  /**
   * Verify that the memory microservice URL points strictly to a trusted loopback interface (SSRF Defense)
   */
  isAllowedServiceUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      return ALLOWED_MEMORY_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  async #fetchWithTimeout(endpoint, options = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.isAllowedServiceUrl(this.serviceUrl)) {
      throw new Error('Blocked untrusted memory service URL');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.serviceUrl}${endpoint}`, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check whether the Python memory microservice is reachable (with cooldown backoff)
   */
  async checkHealth(force = false) {
    if (!force && !this.isRunning && Date.now() - this.lastHealthCheckFailedAt < this.healthCheckCooldownMs) {
      return false;
    }

    try {
      const response = await this.#fetchWithTimeout('/health', {}, 1200);
      this.isRunning = response.ok;
      if (this.isRunning) {
        this.lastHealthCheckFailedAt = 0;
      } else {
        this.lastHealthCheckFailedAt = Date.now();
      }
      return this.isRunning;
    } catch {
      this.isRunning = false;
      this.lastHealthCheckFailedAt = Date.now();
      return false;
    }
  }

  async #hasPythonRuntime(pythonPath) {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      execFile(pythonPath, ['--version'], { timeout: 2500 }, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Start the Python memory service without blocking the Node.js Event Loop
   */
  async startService() {
    if (await this.checkHealth(true)) {
      console.log('[MEMORY] Python memory service already running');
      return;
    }

    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    if (!(await this.#hasPythonRuntime(pythonPath))) {
      console.log('[MEMORY] Python not found, using built-in Node.js semantic memory engine');
      return;
    }

    const serviceDir = path.join(PROJECT_ROOT, 'memory-service');
    const servicePath = path.join(serviceDir, 'memory_service.py');

    return new Promise((resolve) => {
      this.pythonProcess = spawn(pythonPath, [servicePath], {
        cwd: serviceDir,
        stdio: ['ignore', 'pipe', 'pipe']
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

      this.waitForService(12, 350).then(() => {
        this.isRunning = true;
        this.lastHealthCheckFailedAt = 0;
        console.log('[MEMORY] Python embedding service started');
        resolve();
      }).catch(() => {
        console.log('[MEMORY] Using built-in Node.js semantic memory engine');
        resolve();
      });
    });
  }

  async waitForService(maxAttempts = 12, intervalMs = 350) {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkHealth(true)) return;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
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

  #normalizeMetadata(metadata = {}) {
    const safeMeta = metadata && typeof metadata === 'object' ? metadata : {};
    const sessionId = safeMeta.sessionId || safeMeta.session_id || null;
    const source = safeMeta.source || 'conversation';
    return {
      id: safeMeta.id || null,
      sessionId,
      source,
      raw: { ...safeMeta, sessionId, session_id: sessionId, source }
    };
  }

  async addMemory(content, characterId, metadata = {}) {
    const normalized = this.#normalizeMetadata(metadata);
    const trimmed = String(content || '').trim();
    if (!trimmed || !characterId || String(normalized.source).toLowerCase() === 'story_summary') return null;
    if (!this.isRunning && !(await this.checkHealth())) return null;

    try {
      const response = await this.#fetchWithTimeout('/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: normalized.id,
          content: trimmed.slice(0, 2000),
          character_id: characterId,
          session_id: normalized.sessionId,
          source: normalized.source,
          metadata: normalized.raw
        })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.memory_id;
    } catch {
      this.isRunning = false;
      this.lastHealthCheckFailedAt = Date.now();
      return null;
    }
  }

  async retrieveMemories(query, characterId, topK = 3, threshold = 0.25, sessionId = null) {
    if (!query || !characterId) return null;
    if (!this.isRunning && !(await this.checkHealth())) return null;
    try {
      const safeTopK = Math.max(1, Math.min(20, Number(topK) || 3));
      const safeThreshold = Math.max(0, Math.min(1, Number(threshold) || 0.25));
      const response = await this.#fetchWithTimeout('/memories/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: String(query).trim().slice(0, 1000),
          character_id: characterId,
          session_id: sessionId || null,
          top_k: safeTopK,
          threshold: safeThreshold
        })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.memories || null;
    } catch {
      this.isRunning = false;
      this.lastHealthCheckFailedAt = Date.now();
      return null;
    }
  }

  async deleteMemory(memoryId) {
    if (!memoryId || typeof memoryId !== 'string') return false;
    if (!this.isRunning && !(await this.checkHealth())) return false;
    try {
      const response = await this.#fetchWithTimeout(`/memories/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch {
      this.isRunning = false;
      this.lastHealthCheckFailedAt = Date.now();
      return false;
    }
  }
}

export const memoryClient = new MemoryClient();
