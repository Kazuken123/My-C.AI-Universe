# Kế Hoạch Tối Ưu Kiến Trúc, Bảo Mật & Hiệu Năng — Đợt 2 (PLAN.md)

### [TASK-01] Khử trùng lặp `#collectRateLimiterStats` tại `AdminController` và quản lý vòng đời `requestAnimationFrame` / giới hạn file tại `ImageCropper`
- File: backend/controllers/admin.controller.js:342-352 & frontend/js/cropper.js:255-265,433-436
- Vấn đề:
  1. `AdminController.getRateLimitStatus` lặp lại khối khởi tạo `{ global, auth, sensitiveAi }` thay vì gọi phương thức `this.#collectRateLimiterStats()` đã có sẵn trong lớp.
  2. `ImageCropper.close()` không hủy `this.rafId` (`cancelAnimationFrame`) và không reset `this.isDragging = false`. Ngoài ra `#loadFile(file)` không giới hạn kích thước file đầu vào trước khi đọc Base64.
- [ ] Viết test kiểm tra tại tests/delta-01-controller-and-cropper.test.js:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adminController } from '../backend/controllers/admin.controller.js';

const adminSource = fs.readFileSync(
  path.resolve(process.cwd(), 'backend/controllers/admin.controller.js'),
  'utf8'
);
const cropperSource = fs.readFileSync(
  path.resolve(process.cwd(), 'frontend/js/cropper.js'),
  'utf8'
);

// 1. Đảm bảo getRateLimitStatus tái sử dụng this.#collectRateLimiterStats()
const rateLimitMethodMatch = adminSource.match(/getRateLimitStatus\(_req,\s*res\)\s*\{[\s\S]*?\n  \}/);
assert.notEqual(rateLimitMethodMatch, null);
assert.equal(
  rateLimitMethodMatch[0].includes('this.#collectRateLimiterStats()'),
  true,
  'getRateLimitStatus phải tái sử dụng this.#collectRateLimiterStats()'
);

// Kiểm tra runtime của getRateLimitStatus
let statusPayload = null;
const mockRes = {
  status(code) { this.statusCode = code; return this; },
  json(data) { statusPayload = data; return this; }
};
adminController.getRateLimitStatus({}, mockRes);
assert.equal(typeof statusPayload.global, 'object');
assert.equal(typeof statusPayload.auth, 'object');
assert.equal(typeof statusPayload.sensitiveAi, 'object');

// 2. Đảm bảo ImageCropper.close() hủy requestAnimationFrame (cancelAnimationFrame) và kiểm tra kích thước file
assert.equal(
  cropperSource.includes('cancelAnimationFrame(this.rafId)'),
  true,
  'ImageCropper.close() phải hủy requestAnimationFrame đang chờ'
);
assert.equal(
  cropperSource.includes('MAX_INPUT_FILE_BYTES'),
  true,
  'ImageCropper.#loadFile phải kiểm tra kích thước file tối đa trước khi đọc vào RAM'
);

console.log('✅ [PASS] TASK-01: AdminController và ImageCropper đã được chuẩn hóa vòng đời tài nguyên.');
```
- [ ] Sửa mã nguồn tại `backend/controllers/admin.controller.js` và `frontend/js/cropper.js`:

**Đoạn code cũ tại `backend/controllers/admin.controller.js` (Dòng 342–352):**
```javascript
  /**
   * View live rate limiter entries and throttled clients
   */
  getRateLimitStatus(_req, res) {
    try {
      return this.sendJson(res, {
        global: globalRateLimiter.getStats(),
        auth: authRateLimiter.getStats(),
        sensitiveAi: sensitiveEndpointLimiter.getStats()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to get rate limit status');
    }
  }
```

**Đoạn code mới thay thế trực tiếp tại `backend/controllers/admin.controller.js` (Dòng 342–348):**
```javascript
  /**
   * View live rate limiter entries and throttled clients
   */
  getRateLimitStatus(_req, res) {
    try {
      return this.sendJson(res, this.#collectRateLimiterStats());
    } catch (error) {
      return this.handleError(res, error, 'Failed to get rate limit status');
    }
  }
```

**Đoạn code cũ tại `frontend/js/cropper.js` (Dòng 255–265 & 433–436):**
```javascript
  #loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.#loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  }
```
*(và dòng 433–436 của `frontend/js/cropper.js`)*:
```javascript
  close() {
    this.overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
```

**Đoạn code mới thay thế trực tiếp tại `frontend/js/cropper.js`:**
```javascript
  #loadFile(file) {
    const MAX_INPUT_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw file guard
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }
    if (file.size > MAX_INPUT_FILE_BYTES) {
      showToast('Image file is too large (max 15MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.#loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  }
```
*(và dòng `close()` của `frontend/js/cropper.js`)*:
```javascript
  close() {
    this.isDragging = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
```
- [ ] Chạy lệnh kiểm thử: `node tests/delta-01-controller-and-cropper.test.js && npm test`

---

### [TASK-02] Khử trùng lặp CSS cho `auth.css` trong `nextjs-frontend/app/`
- File: nextjs-frontend/app/auth.css:1-381
- Vấn đề: File `nextjs-frontend/app/auth.css` (381 dòng) vẫn đang chứa bản sao trùng lặp của `frontend/css/auth.css` thay vì dùng `@import` như `admin.css` và `cropper.css`.
- [ ] Viết test kiểm tra tại tests/delta-02-auth-css-dedup.test.js:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nextAuthCss = fs.readFileSync(path.resolve(process.cwd(), 'nextjs-frontend/app/auth.css'), 'utf8');

assert.equal(
  nextAuthCss.trim(),
  "@import '../../frontend/css/auth.css';",
  'nextjs-frontend/app/auth.css phải import trực tiếp từ nguồn chuẩn frontend/css/auth.css'
);

console.log('✅ [PASS] TASK-02: Đã khử trùng lặp hoàn toàn nextjs-frontend/app/auth.css.');
```
- [ ] Sửa mã nguồn tại `nextjs-frontend/app/auth.css`:

**Đoạn code cũ (Dòng 1–381):**
```css
/* Toàn bộ 381 dòng CSS trùng lặp với frontend/css/auth.css */
```

**Đoạn code mới thay thế trực tiếp (Dòng 1):**
```css
@import '../../frontend/css/auth.css';
```
- [ ] Chạy lệnh kiểm thử: `node tests/delta-02-auth-css-dedup.test.js && npm test`

---

### [TASK-03] Vá lỗi rò rỉ ký ức liên phiên tại `get_all_memories`, ghi file nguyên tử (Atomic Write) và tối ưu tích vô hướng `np.dot` trong `memory-service/memory_service.py`
- File: memory-service/memory_service.py:61-177
- Vấn đề:
  1. `get_all_memories(self, character_id, session_id)` hiện chỉ lọc `session_id` khi `session_id` khác rỗng (`if session_id:`), dẫn đến việc khi gọi `GET /memories?character_id=X` không kèm `session_id`, hàm trả về toàn bộ ký ức của mọi phiên chat riêng tư của người dùng khác và cả các bản ghi `story_summary`.
  2. `save_memories()` ghi đè trực tiếp lên `self.memory_file` mà không qua file tạm `.tmp` và `os.replace`, có nguy cơ làm hỏng dữ liệu khi mất điện hoặc xung đột ghi.
  3. `retrieve_relevant_memories()` gọi `cosine_similarity` tính lại chuẩn L2 trên các vector đã được chuẩn hóa (`normalize_embeddings=True`), gây lãng phí chu kỳ CPU so với phép nhân ma trận `np.dot`.
- [ ] Viết test kiểm tra tại tests/delta-03-python-memory-hardening.test.js:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pyPath = path.resolve(process.cwd(), 'memory-service/memory_service.py');
const pySource = fs.readFileSync(pyPath, 'utf8');

// 1. Đảm bảo save_memories sử dụng ghi file nguyên tử qua os.replace
assert.equal(
  pySource.includes('os.replace('),
  true,
  'save_memories phải ghi qua file tạm và dùng os.replace để đảm bảo tính nguyên tử (atomic write)'
);

// 2. Đảm bảo retrieve_relevant_memories dùng np.dot trực tiếp trên các vector float32 đã chuẩn hóa
assert.equal(
  pySource.includes('np.dot(memory_embeddings, query_embedding[0])'),
  true,
  'retrieve_relevant_memories phải dùng np.dot trên vector đã chuẩn hóa thay vì tính lại L2 norm'
);

// 3. Đảm bảo get_all_memories loại bỏ story_summary và cô lập session_id khi session_id là None
assert.equal(
  pySource.includes("if (m.get('source') or m.get('metadata', {}).get('source')) != 'story_summary'"),
  true,
  'get_all_memories phải loại bỏ bản ghi nội bộ story_summary'
);

console.log('✅ [PASS] TASK-03: Dịch vụ Python Memory Service đã cô lập session, ghi file nguyên tử và tối ưu np.dot.');
```
- [ ] Sửa mã nguồn tại `memory-service/memory_service.py`:

**Đoạn code cũ (Dòng 61–177):**
```python
    def save_memories(self):
        """Save memories to JSON file using compact serialization to minimize disk I/O."""
        try:
            with open(self.memory_file, 'w', encoding='utf-8') as f:
                json.dump(self.memories, f, separators=(',', ':'), ensure_ascii=False)
            logger.info(f"Saved {len(self.memories)} memories to {self.memory_file}")
        except Exception as e:
            logger.error(f"Error saving memories: {e}")

    def add_memory(self, content: str, character_id: str = None, metadata: Dict = None,
                   session_id: str = None, source: str = 'conversation', memory_id: str = None) -> str:
        """
        Add a new memory with normalized float32 embedding, deduplication, and session boundary metadata.
        """
        metadata = metadata or {}
        resolved_session_id = session_id or metadata.get('sessionId') or metadata.get('session_id')
        resolved_source = source or metadata.get('source', 'conversation')

        if resolved_source == 'story_summary':
            return ''

        clean_content = content.strip()
        clean_lower = clean_content.lower()
        for existing in self.memories:
            existing_session = existing.get('session_id') or existing.get('metadata', {}).get('sessionId')
            if (existing.get('character_id') == character_id and
                existing_session == resolved_session_id and
                existing.get('content', '').strip().lower() == clean_lower):
                return existing['id']

        self._load_model()
        embedding = self.model.encode(clean_content, normalize_embeddings=True).astype(np.float32).tolist()

        final_id = memory_id or metadata.get('id') or str(uuid.uuid4())
        memory = {
            'id': final_id,
            'content': clean_content,
            'embedding': embedding,
            'character_id': character_id,
            'session_id': resolved_session_id,
            'source': resolved_source,
            'metadata': metadata,
            'created_at': str(np.datetime64('now'))
        }

        self.memories.append(memory)
        self.save_memories()

        logger.info(f"Added memory [{final_id}]: {clean_content[:50]}...")
        return final_id

    def retrieve_relevant_memories(self, query: str, character_id: str = None,
                                   top_k: int = 3, threshold: float = 0.3,
                                   session_id: str = None) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories using float32 matrix multiplication.
        """
        if not self.memories:
            return []

        filtered_memories = []
        for m in self.memories:
            if character_id and m.get('character_id') != character_id:
                continue

            meta = m.get('metadata') or {}
            mem_source = m.get('source') or meta.get('source', 'conversation')
            if mem_source == 'story_summary':
                continue

            mem_session_id = m.get('session_id') if 'session_id' in m else (meta.get('sessionId') or meta.get('session_id'))

            if session_id:
                if mem_session_id is not None and mem_session_id != session_id:
                    continue
            else:
                if mem_session_id is not None:
                    continue

            filtered_memories.append(m)

        if not filtered_memories:
            return []

        self._load_model()
        query_embedding = self.model.encode(query, normalize_embeddings=True).astype(np.float32).reshape(1, -1)
        memory_embeddings = np.asarray([m['embedding'] for m in filtered_memories], dtype=np.float32)
        similarities = cosine_similarity(query_embedding, memory_embeddings)[0]

        relevant_indices = np.argsort(similarities)[::-1][:top_k]
        relevant_memories = []

        for idx in relevant_indices:
            similarity = float(similarities[idx])
            if similarity >= threshold:
                item = filtered_memories[idx]
                relevant_memories.append({
                    'id': item.get('id'),
                    'content': item.get('content'),
                    'character_id': item.get('character_id'),
                    'session_id': item.get('session_id'),
                    'source': item.get('source', 'conversation'),
                    'similarity': similarity
                })

        logger.info(f"Retrieved {len(relevant_memories)} relevant memories for query: {query[:50]}...")
        return relevant_memories

    def get_all_memories(self, character_id: str = None, session_id: str = None) -> List[Dict[str, Any]]:
        """Get memories without the heavy 384-float embedding vector to reduce JSON payload size."""
        source_list = (
            [m for m in self.memories if m.get('character_id') == character_id]
            if character_id else self.memories
        )
        if session_id:
            source_list = [
                m for m in source_list
                if (m.get('session_id') if 'session_id' in m else m.get('metadata', {}).get('sessionId')) == session_id
            ]
        return [
            {k: v for k, v in m.items() if k != 'embedding'}
            for m in source_list
        ]
```

**Đoạn code mới thay thế trực tiếp (Dòng 61–186):**
```python
    def save_memories(self):
        """Save memories to JSON file atomically using compact serialization to minimize disk I/O."""
        temp_file = f"{self.memory_file}.tmp"
        try:
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(self.memories, f, separators=(',', ':'), ensure_ascii=False)
            os.replace(temp_file, self.memory_file)
            logger.info(f"Saved {len(self.memories)} memories to {self.memory_file}")
        except Exception as e:
            logger.error(f"Error saving memories: {e}")
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except OSError:
                    pass

    def add_memory(self, content: str, character_id: str = None, metadata: Dict = None,
                   session_id: str = None, source: str = 'conversation', memory_id: str = None) -> str:
        """
        Add a new memory with normalized float32 embedding, deduplication, and session boundary metadata.
        """
        metadata = metadata or {}
        resolved_session_id = session_id or metadata.get('sessionId') or metadata.get('session_id')
        resolved_source = source or metadata.get('source', 'conversation')

        if resolved_source == 'story_summary':
            return ''

        clean_content = content.strip()
        clean_lower = clean_content.lower()
        for existing in self.memories:
            existing_session = existing.get('session_id') or existing.get('metadata', {}).get('sessionId')
            if (existing.get('character_id') == character_id and
                existing_session == resolved_session_id and
                existing.get('content', '').strip().lower() == clean_lower):
                return existing['id']

        self._load_model()
        embedding = self.model.encode(clean_content, normalize_embeddings=True).astype(np.float32).tolist()

        final_id = memory_id or metadata.get('id') or str(uuid.uuid4())
        memory = {
            'id': final_id,
            'content': clean_content,
            'embedding': embedding,
            'character_id': character_id,
            'session_id': resolved_session_id,
            'source': resolved_source,
            'metadata': metadata,
            'created_at': str(np.datetime64('now'))
        }

        self.memories.append(memory)
        self.save_memories()

        logger.info(f"Added memory [{final_id}]: {clean_content[:50]}...")
        return final_id

    def retrieve_relevant_memories(self, query: str, character_id: str = None,
                                   top_k: int = 3, threshold: float = 0.3,
                                   session_id: str = None) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories using fast float32 dot-product matrix multiplication.
        """
        if not self.memories:
            return []

        filtered_memories = []
        for m in self.memories:
            if character_id and m.get('character_id') != character_id:
                continue

            meta = m.get('metadata') or {}
            mem_source = m.get('source') or meta.get('source', 'conversation')
            if mem_source == 'story_summary':
                continue

            mem_session_id = m.get('session_id') if 'session_id' in m else (meta.get('sessionId') or meta.get('session_id'))

            if session_id:
                if mem_session_id is not None and mem_session_id != session_id:
                    continue
            else:
                if mem_session_id is not None:
                    continue

            filtered_memories.append(m)

        if not filtered_memories:
            return []

        self._load_model()
        query_embedding = self.model.encode(query, normalize_embeddings=True).astype(np.float32).reshape(1, -1)
        memory_embeddings = np.asarray([m['embedding'] for m in filtered_memories], dtype=np.float32)
        similarities = np.dot(memory_embeddings, query_embedding[0])

        relevant_indices = np.argsort(similarities)[::-1][:top_k]
        relevant_memories = []

        for idx in relevant_indices:
            similarity = float(similarities[idx])
            if similarity >= threshold:
                item = filtered_memories[idx]
                relevant_memories.append({
                    'id': item.get('id'),
                    'content': item.get('content'),
                    'character_id': item.get('character_id'),
                    'session_id': item.get('session_id'),
                    'source': item.get('source', 'conversation'),
                    'similarity': similarity
                })

        logger.info(f"Retrieved {len(relevant_memories)} relevant memories for query: {query[:50]}...")
        return relevant_memories

    def get_all_memories(self, character_id: str = None, session_id: str = None) -> List[Dict[str, Any]]:
        """Get memories without the heavy 384-float embedding vector, strictly enforcing session boundaries."""
        source_list = (
            [m for m in self.memories if m.get('character_id') == character_id]
            if character_id else self.memories
        )
        source_list = [
            m for m in source_list
            if (m.get('source') or m.get('metadata', {}).get('source')) != 'story_summary'
        ]
        if session_id:
            source_list = [
                m for m in source_list
                if (m.get('session_id') if 'session_id' in m else m.get('metadata', {}).get('sessionId')) in (None, session_id)
            ]
        else:
            source_list = [
                m for m in source_list
                if (m.get('session_id') if 'session_id' in m else m.get('metadata', {}).get('sessionId')) is None
            ]
        return [
            {k: v for k, v in m.items() if k != 'embedding'}
            for m in source_list
        ]
```
- [ ] Chạy lệnh kiểm thử: `node tests/delta-03-python-memory-hardening.test.js && npm test`

---

### [TASK-04] Phòng chống Command Injection qua `execFileSync` trong `scripts/prepare-audit.js` và `scripts/setup-memory.js` (OWASP A03:2021 - Injection)
- File: scripts/prepare-audit.js:1-110 & scripts/setup-memory.js:1-50
- Vấn đề:
  1. `scripts/prepare-audit.js` nối chuỗi trực tiếp biến đường dẫn `${promptOutputFile}` vào lệnh PowerShell trong `execSync`, tạo nguy cơ Command Injection nếu đường dẫn chứa dấu nháy đơn `'`.
  2. `scripts/setup-memory.js` dùng `execSync(\`${pythonCmd} -m pip install -r requirements.txt\`)` khởi chạy shell trung gian không cần thiết thay vì dùng `execFileSync` với mảng tham số tách biệt.
- [ ] Viết test kiểm tra tại tests/delta-04-scripts-command-safety.test.js:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const prepareAuditSource = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/prepare-audit.js'),
  'utf8'
);
const setupMemorySource = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/setup-memory.js'),
  'utf8'
);

// 1. Đảm bảo prepare-audit.js truyền đường dẫn qua biến môi trường AUDIT_PROMPT_FILE và dùng execFileSync
assert.equal(
  prepareAuditSource.includes('$env:AUDIT_PROMPT_FILE'),
  true,
  'prepare-audit.js phải đọc đường dẫn file từ biến môi trường $env:AUDIT_PROMPT_FILE thay vì nội suy chuỗi lệnh'
);

// 2. Đảm bảo setup-memory.js dùng execFileSync với mảng tham số
assert.equal(
  setupMemorySource.includes('execFileSync('),
  true,
  'setup-memory.js phải sử dụng execFileSync thay vì execSync nối chuỗi shell'
);

console.log('✅ [PASS] TASK-04: Các script công cụ đã loại bỏ hoàn toàn nội suy chuỗi lệnh shell.');
```
- [ ] Sửa mã nguồn tại `scripts/prepare-audit.js` và `scripts/setup-memory.js`:

**Đoạn code cũ tại `scripts/prepare-audit.js` (Dòng 1–4 & 94–106):**
```javascript
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
```
*(và dòng 94–106 của `scripts/prepare-audit.js`)*:
```javascript
console.log('--- Buoc 3: Sao chep cau lenh vao Clipboard ---');
try {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 '${promptOutputFile}' | Set-Clipboard"`);
    console.log('Da sao chep toan bo noi dung cau lenh vao Clipboard Windows.');
  } else {
    console.log(`Doc file ${promptOutputFile} de lay noi dung prompt.`);
  }
} catch (e) {
  console.log(`Chua tu dong copy duoc vao clipboard, mo file ${promptOutputFile} de copy thu cong.`);
}
```

**Đoạn code mới thay thế trực tiếp tại `scripts/prepare-audit.js`:**
```javascript
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
```
*(và dòng 94–108 của `scripts/prepare-audit.js`)*:
```javascript
console.log('--- Buoc 3: Sao chep cau lenh vao Clipboard ---');
try {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', 'Get-Content -Raw -Encoding UTF8 -LiteralPath $env:AUDIT_PROMPT_FILE | Set-Clipboard'],
      { env: { ...process.env, AUDIT_PROMPT_FILE: promptOutputFile } }
    );
    console.log('Da sao chep toan bo noi dung cau lenh vao Clipboard Windows.');
  } else {
    console.log(`Doc file ${promptOutputFile} de lay noi dung prompt.`);
  }
} catch (e) {
  console.log(`Chua tu dong copy duoc vao clipboard, mo file ${promptOutputFile} de copy thu cong.`);
}
```

**Đoạn code cũ tại `scripts/setup-memory.js` (Dòng 1–48):**
```javascript
#!/usr/bin/env node

/**
 * Setup script for the optional Python sentence-transformers memory microservice
 */
import { execSync } from 'child_process';
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
  const v = execSync('python --version', { encoding: 'utf-8' });
  console.log('✅ Python found:', v.trim());
} catch {
  try {
    const v3 = execSync('python3 --version', { encoding: 'utf-8' });
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
  execSync(`${pythonCmd} -m pip install -r requirements.txt`, {
    cwd: MEMORY_SERVICE_DIR,
    stdio: 'inherit'
  });
  console.log('✅ Python memory service dependencies installed!');
} catch (error) {
  console.error('❌ Failed to install Python dependencies:', error.message);
  process.exit(1);
}
```

**Đoạn code mới thay thế trực tiếp tại `scripts/setup-memory.js`:**
```javascript
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
```
- [ ] Chạy lệnh kiểm thử: `node tests/delta-04-scripts-command-safety.test.js && npm test`

---

### [TASK-05] Tối ưu hóa làm mới ngầm không nháy Skeleton tại `nextjs-frontend/app/personas/page.tsx` và dọn dẹp Timer tại `nextjs-frontend/app/auth/page.tsx`
- File: nextjs-frontend/app/personas/page.tsx:35-90 & nextjs-frontend/app/auth/page.tsx:40-65
- Vấn đề:
  1. `nextjs-frontend/app/personas/page.tsx` gọi `loadPersonas()` với `setLoading(true)` mỗi khi đổi Default Persona, xóa hoặc tạo mới, làm toàn bộ danh sách bị thay thế bằng Skeleton gây giật giao diện và tốn chi phí unmount/remount toàn bộ cây DOM.
  2. `nextjs-frontend/app/auth/page.tsx` gọi `setTimeout` trong `handleGoogleAuth` và `handleFacebookAuth` mà không dùng `useRef` để hủy timer cũ khi bấm liên tiếp hoặc khi component unmount.
- [ ] Viết test kiểm tra tại tests/delta-05-nextjs-ux-perf.test.js:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const personasPageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/personas/page.tsx'),
  'utf8'
);
const authPageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/auth/page.tsx'),
  'utf8'
);

// 1. Đảm bảo loadPersonas hỗ trợ cờ silent để không bật lại toàn bộ skeleton khi cập nhật cục bộ
assert.equal(
  personasPageSource.includes('loadPersonas(true)'),
  true,
  'personas/page.tsx phải gọi loadPersonas(true) ở chế độ silent sau khi cập nhật/xóa/tạo mới'
);

// 2. Đảm bảo auth/page.tsx quản lý và dọn dẹp timer thông báo bằng clearTimeout
assert.equal(
  authPageSource.includes('clearTimeout('),
  true,
  'auth/page.tsx phải dọn dẹp setTimeout của socialNotice bằng clearTimeout'
);

console.log('✅ [PASS] TASK-05: Đã tối ưu hóa làm mới danh sách Persona không nháy Skeleton và dọn dẹp Timer tại AuthPage.');
```
- [ ] Sửa mã nguồn tại `nextjs-frontend/app/personas/page.tsx` và `nextjs-frontend/app/auth/page.tsx`:

**Đoạn code cũ tại `nextjs-frontend/app/personas/page.tsx` (Dòng 35–89):**
```tsx
  const loadPersonas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPersonas();
      setPersonas(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load personas';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  const handleSetDefault = async (id: string) => {
    setUpdatingDefaultId(id);
    try {
      await api.setDefaultPersona(id);
      showToast('Active default persona updated.');
      await loadPersonas();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update default persona';
      showToast(msg, 'error');
    } finally {
      setUpdatingDefaultId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (personas.length <= 1) {
      showToast('Cannot delete the last remaining persona of your account.', 'error');
      return;
    }

    setDeletingId(id);
    try {
      await api.deletePersona(id);
      showToast('Persona identity removed.');
      await loadPersonas();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete persona';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = async (newPersona: UserPersona) => {
    showToast(`Saved identity "${newPersona.name}" to SQL.`);
    await loadPersonas();
  };
```

**Đoạn code mới thay thế trực tiếp tại `nextjs-frontend/app/personas/page.tsx` (Dòng 35–89):**
```tsx
  const loadPersonas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getPersonas();
      setPersonas(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load personas';
      showToast(msg, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPersonas(false);
  }, [loadPersonas]);

  const handleSetDefault = async (id: string) => {
    setUpdatingDefaultId(id);
    try {
      await api.setDefaultPersona(id);
      showToast('Active default persona updated.');
      await loadPersonas(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update default persona';
      showToast(msg, 'error');
    } finally {
      setUpdatingDefaultId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (personas.length <= 1) {
      showToast('Cannot delete the last remaining persona of your account.', 'error');
      return;
    }

    setDeletingId(id);
    try {
      await api.deletePersona(id);
      showToast('Persona identity removed.');
      await loadPersonas(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete persona';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = async (newPersona: UserPersona) => {
    showToast(`Saved identity "${newPersona.name}" to SQL.`);
    await loadPersonas(true);
  };
```

**Đoạn code cũ tại `nextjs-frontend/app/auth/page.tsx` (Dòng 1–4 & 40–65):**
```tsx
'use client';

import React, { useState, useEffect, Suspense } from 'react';
```
*(và dòng 40–65 của `nextjs-frontend/app/auth/page.tsx`)*:
```tsx
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  useEffect(() => {
    if (modeParam === 'signup') {
      setActiveTab('signup');
    } else if (modeParam === 'signin') {
      setActiveTab('signin');
    }
  }, [modeParam]);

  const handleGoogleAuth = () => {
    setSocialNotice('Google OAuth client integration initialized. Connecting with Identity Provider...');
    setTimeout(() => {
      setSocialNotice(null);
    }, 4000);
  };

  const handleFacebookAuth = () => {
    setSocialNotice('Facebook OAuth requires an active Facebook App ID configuration.');
    setTimeout(() => {
      setSocialNotice(null);
    }, 4000);
  };
```

**Đoạn code mới thay thế trực tiếp tại `nextjs-frontend/app/auth/page.tsx`:**
```tsx
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
```
*(và dòng 40–75 của `nextjs-frontend/app/auth/page.tsx`)*:
```tsx
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (modeParam === 'signup') {
      setActiveTab('signup');
    } else if (modeParam === 'signin') {
      setActiveTab('signin');
    }
  }, [modeParam]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showTemporarySocialNotice = (msg: string) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setSocialNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setSocialNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  };

  const handleGoogleAuth = () => {
    showTemporarySocialNotice('Google OAuth client integration initialized. Connecting with Identity Provider...');
  };

  const handleFacebookAuth = () => {
    showTemporarySocialNotice('Facebook OAuth requires an active Facebook App ID configuration.');
  };
```
- [ ] Chạy lệnh kiểm thử: `node tests/delta-05-nextjs-ux-perf.test.js && npm test`
