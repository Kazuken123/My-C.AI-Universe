-- ============================================================================
-- My C.AI Universe — Relational SQL Schema (SQLite / PostgreSQL Compatible)
-- Implements the 6-Entity ERD:
--   1. user_personas
--   2. characters
--   3. chat_sessions
--   4. chat_messages
--   5. message_variants
--   6. character_memories
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 0. USER Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '👤',
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    auth_provider TEXT NOT NULL DEFAULT 'local',
    provider_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 0.1 PASSWORD_RESETS Table
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email_code ON password_resets(email, code);

-- 1. USER_PERSONA Table
CREATE TABLE IF NOT EXISTS user_personas (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '🌟',
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. CHARACTER Table
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    greeting TEXT NOT NULL DEFAULT '',
    personality TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    abilities TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    speaking_style TEXT NOT NULL DEFAULT '',
    example_dialogues TEXT NOT NULL DEFAULT '',
    initial_memory TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    wiki TEXT NOT NULL DEFAULT '',
    wiki_url TEXT NOT NULL DEFAULT '',
    categories_json TEXT NOT NULL DEFAULT '["Roleplay"]',
    creator TEXT NOT NULL DEFAULT '@you',
    owner_user_id TEXT,
    interactions INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    is_liked INTEGER NOT NULL DEFAULT 0,
    initial_affinity INTEGER NOT NULL DEFAULT 0,
    initial_relationship_stage TEXT NOT NULL DEFAULT 'Stranger / Neutral',
    relationship_dynamic TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. CHAT_SESSION Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    character_id TEXT NOT NULL,
    persona_id TEXT,
    title TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gemini',
    affinity INTEGER NOT NULL DEFAULT 0,
    trust INTEGER NOT NULL DEFAULT 0,
    strain INTEGER NOT NULL DEFAULT 0,
    relationship_stage TEXT NOT NULL DEFAULT 'Stranger / Neutral',
    relationship_mood TEXT NOT NULL DEFAULT 'Calm',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (persona_id) REFERENCES user_personas(id) ON DELETE SET NULL
);

-- 4. CHAT_MESSAGE Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'system')),
    content TEXT NOT NULL,
    selected_variant_index INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- 5. MESSAGE_VARIANT Table
CREATE TABLE IF NOT EXISTS message_variants (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    variant_index INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

-- 6. CHARACTER_MEMORY Table
CREATE TABLE IF NOT EXISTS character_memories (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    session_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'quarantined' CHECK (visibility IN ('global', 'session', 'quarantined')),
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'conversation',
    created_at TEXT NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
);

-- 7. MEDIA_ASSET Table (Persistent cloud storage for user uploaded images: webp, png, jpg, gif, svg)
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    mime_type TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Relational Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON user_personas(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_interactions ON characters(interactions DESC);
CREATE INDEX IF NOT EXISTS idx_characters_likes ON characters(likes DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_character ON chat_sessions(character_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_message_variants_message ON message_variants(message_id, variant_index ASC);
CREATE INDEX IF NOT EXISTS idx_character_memories_character ON character_memories(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_memories_session_source ON character_memories(session_id, source);
CREATE INDEX IF NOT EXISTS idx_media_assets_filename ON media_assets(filename);
