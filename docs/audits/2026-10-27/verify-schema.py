"""Read-only probes using the real schema in SQLite :memory:, never the app DB."""
import json
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[3]
schema = (root / 'backend/db/schema.sql').read_text(encoding='utf-8')

def base():
    db = sqlite3.connect(':memory:')
    db.executescript(schema)
    db.execute("INSERT INTO users(id,username,password_hash,display_name,created_at,updated_at) VALUES('u','fixture','fake','Fixture','now','now')")
    db.execute("INSERT INTO characters(id,name,system_prompt,created_at,updated_at) VALUES('c','Fixture','test','now','now')")
    return db

results = []
for parent in ('chat_sessions', 'users'):
    db = base()
    db.execute("INSERT INTO chat_sessions(id,user_id,character_id,title,created_at,updated_at) VALUES('s','u','c','Private','now','now')")
    db.execute("INSERT INTO character_memories(id,character_id,session_id,content,created_at) VALUES('m','c','s','private fixture','now')")
    query = "SELECT content FROM character_memories WHERE character_id='c' AND session_id IS NULL AND source != 'story_summary'"
    before = db.execute(query).fetchall()
    db.execute('DELETE FROM ' + parent)
    after = db.execute(query).fetchall()
    assert before == [] and after == [('private fixture',)]
    results.append({'id': 'A01', 'deleted_parent': parent, 'public_before': before, 'public_after': after})
    db.close()

# Script imports character_memories before chat_sessions: seeded parent absent.
db = base()
try:
    db.execute("INSERT INTO character_memories(id,character_id,session_id,content,created_at) VALUES('m','c','s','fixture','now')")
except sqlite3.IntegrityError as error:
    results.append({'id': 'A08', 'migration_order_failure': str(error)})
else:
    raise AssertionError('Expected FK enforcement')
db.close()
print(json.dumps({'mode': 'real schema, in-memory database', 'results': results}, indent=2))
