#!/usr/bin/env node

/**
 * Setup script for the optional Python sentence-transformers memory microservice
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEMORY_SERVICE_DIR = path.join(PROJECT_ROOT, 'memory-service');

console.log('Setting up Python memory service...');

let pythonCmd = 'python';
try {
  const v = execFileSync('python', ['--version'], { encoding: 'utf-8' });
  console.log('✅ Python found:', v.trim());
} catch {
  try {
    const v3 = execFileSync('python3', ['--version'], { encoding: 'utf-8' });
    pythonCmd = 'python3';
    console.log('✅ Python3 found:', v3.trim());
  } catch {
    console.error('❌ Python not found. Note: Built-in Node.js semantic memory still works out-of-the-box!');
    process.exit(1);
  }
}

if (!fs.existsSync(MEMORY_SERVICE_DIR)) {
  console.error('❌ memory-service directory not found');
  process.exit(1);
}

console.log('Installing Python dependencies from memory-service/requirements.txt...');
try {
  execFileSync(pythonCmd, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
    cwd: MEMORY_SERVICE_DIR,
    stdio: 'inherit'
  });
  console.log('✅ Python memory service dependencies installed!');
} catch (error) {
  console.error('❌ Failed to install Python dependencies:', error.message);
  process.exit(1);
}
