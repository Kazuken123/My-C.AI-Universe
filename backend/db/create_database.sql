-- ============================================================================
-- My C.AI Universe — Complete SQL Database Creation & Seed Script
-- Compatible with MySQL 8.0+ / MariaDB / SQLite
-- ============================================================================

-- Uncomment the following two lines when importing into MySQL / MariaDB:
-- CREATE DATABASE IF NOT EXISTS my_cai_universe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE my_cai_universe;

-- 1. Table: user_personas
CREATE TABLE IF NOT EXISTS user_personas (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    avatar VARCHAR(255) NOT NULL DEFAULT '🌟',
    description TEXT NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
);

-- 2. Table: characters
CREATE TABLE IF NOT EXISTS characters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tagline VARCHAR(255) NOT NULL DEFAULT '',
    avatar TEXT NOT NULL,
    greeting TEXT NOT NULL,
    personality TEXT NOT NULL,
    appearance TEXT NOT NULL,
    abilities TEXT NOT NULL,
    background TEXT NOT NULL,
    speaking_style TEXT NOT NULL,
    example_dialogues TEXT NOT NULL,
    initial_memory TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    wiki TEXT NOT NULL,
    wiki_url TEXT NOT NULL,
    categories_json TEXT NOT NULL,
    creator VARCHAR(100) NOT NULL DEFAULT '@you',
    interactions INT NOT NULL DEFAULT 0,
    likes INT NOT NULL DEFAULT 0,
    is_liked TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
);

-- 3. Table: chat_sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(64) PRIMARY KEY,
    character_id VARCHAR(64) NOT NULL,
    persona_id VARCHAR(64) NULL,
    title VARCHAR(255) NOT NULL,
    provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    CONSTRAINT fk_session_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_persona FOREIGN KEY (persona_id) REFERENCES user_personas(id) ON DELETE SET NULL
);

-- 4. Table: chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    selected_variant_index INT NOT NULL DEFAULT 0,
    is_pinned TINYINT(1) NOT NULL DEFAULT 0,
    rating INT NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    CONSTRAINT fk_message_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- 5. Table: message_variants
CREATE TABLE IF NOT EXISTS message_variants (
    id VARCHAR(64) PRIMARY KEY,
    message_id VARCHAR(64) NOT NULL,
    variant_index INT NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    CONSTRAINT fk_variant_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

-- 6. Table: character_memories
CREATE TABLE IF NOT EXISTS character_memories (
    id VARCHAR(64) PRIMARY KEY,
    character_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NULL,
    content TEXT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'conversation',
    created_at VARCHAR(40) NOT NULL,
    CONSTRAINT fk_memory_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
);
