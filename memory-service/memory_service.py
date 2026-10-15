#!/usr/bin/env python3
"""
Character.AI Memory Service
Handles long-term memory storage and retrieval using sentence embeddings.
"""

import json
import os
import uuid
from typing import List, Dict, Any
import numpy as np
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MemoryService:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2', memory_file: str = 'memories.json'):
        """
        Initialize the memory service with sentence transformer model.

        Args:
            model_name: Sentence transformer model name
            memory_file: File to store memories
        """
        self.model_name = model_name
        self.memory_file = memory_file
        self.memories: List[Dict[str, Any]] = []
        self.model = None

        # Load memories from file
        self.load_memories()

        # Initialize model (lazy loading)
        self._load_model()

    def _load_model(self):
        """Lazy load the sentence transformer model."""
        if self.model is None:
            logger.info(f"Loading sentence transformer model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            logger.info("Model loaded successfully")

    def load_memories(self):
        """Load memories from JSON file."""
        if os.path.exists(self.memory_file):
            try:
                with open(self.memory_file, 'r', encoding='utf-8') as f:
                    self.memories = json.load(f)
                logger.info(f"Loaded {len(self.memories)} memories from {self.memory_file}")
            except Exception as e:
                logger.error(f"Error loading memories: {e}")
                self.memories = []
        else:
            logger.info(f"No existing memory file found at {self.memory_file}")
            self.memories = []

    def save_memories(self):
        """Save memories to JSON file."""
        try:
            with open(self.memory_file, 'w', encoding='utf-8') as f:
                json.dump(self.memories, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved {len(self.memories)} memories to {self.memory_file}")
        except Exception as e:
            logger.error(f"Error saving memories: {e}")

    def add_memory(self, content: str, character_id: str = None, metadata: Dict = None,
                   session_id: str = None, source: str = 'conversation', memory_id: str = None) -> str:
        """
        Add a new memory with embedding, deduplication, and session boundary metadata.
        """
        metadata = metadata or {}
        resolved_session_id = session_id or metadata.get('sessionId') or metadata.get('session_id')
        resolved_source = source or metadata.get('source', 'conversation')

        # Do not index rolling story summaries in vector retrieval store
        if resolved_source == 'story_summary':
            return ''

        clean_content = content.strip()
        for existing in self.memories:
            existing_session = existing.get('session_id') or existing.get('metadata', {}).get('sessionId')
            if (existing.get('character_id') == character_id and
                existing_session == resolved_session_id and
                existing.get('content', '').strip().lower() == clean_content.lower()):
                return existing['id']

        self._load_model()
        embedding = self.model.encode(clean_content).tolist()

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
        Retrieve relevant memories scoped strictly to character lore (session_id is None)
        and the active session (session_id == target), excluding story_summary records.
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
        query_embedding = self.model.encode(query).reshape(1, -1)

        memory_embeddings = np.array([m['embedding'] for m in filtered_memories])
        similarities = cosine_similarity(query_embedding, memory_embeddings)[0]

        relevant_indices = np.argsort(similarities)[::-1][:top_k]
        relevant_memories = []

        for idx in relevant_indices:
            similarity = similarities[idx]
            if similarity >= threshold:
                memory = filtered_memories[idx].copy()
                memory['similarity'] = float(similarity)
                relevant_memories.append(memory)

        logger.info(f"Retrieved {len(relevant_memories)} relevant memories for query: {query[:50]}...")
        return relevant_memories

    def get_all_memories(self, character_id: str = None) -> List[Dict[str, Any]]:
        """Get all memories, optionally filtered by character."""
        if character_id:
            return [m for m in self.memories if m.get('character_id') == character_id]
        return self.memories

    def delete_memory(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
        initial_count = len(self.memories)
        self.memories = [m for m in self.memories if m['id'] != memory_id]

        if len(self.memories) < initial_count:
            self.save_memories()
            logger.info(f"Deleted memory: {memory_id}")
            return True
        return False

# Global memory service instance
memory_service = MemoryService()

# Flask app
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'memories_count': len(memory_service.memories)})

@app.route('/memories', methods=['POST'])
def add_memory():
    """Add a new memory."""
    try:
        data = request.get_json()

        if not data or 'content' not in data:
            return jsonify({'error': 'Content is required'}), 400

        content = data['content']
        character_id = data.get('character_id')
        session_id = data.get('session_id')
        source = data.get('source', 'conversation')
        memory_id = data.get('id')
        metadata = data.get('metadata', {})

        saved_id = memory_service.add_memory(
            content=content,
            character_id=character_id,
            metadata=metadata,
            session_id=session_id,
            source=source,
            memory_id=memory_id
        )

        return jsonify({
            'success': True,
            'memory_id': saved_id
        })

    except Exception as e:
        logger.error(f"Error adding memory: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/memories/retrieve', methods=['POST'])
def retrieve_memories():
    """Retrieve relevant memories for a query."""
    try:
        data = request.get_json()

        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400

        query = data['query']
        character_id = data.get('character_id')
        session_id = data.get('session_id')
        top_k = data.get('top_k', 3)
        threshold = data.get('threshold', 0.3)

        relevant_memories = memory_service.retrieve_relevant_memories(
            query=query,
            character_id=character_id,
            top_k=top_k,
            threshold=threshold,
            session_id=session_id
        )

        memories_for_chat = [
            {
                'id': m.get('id'),
                'content': m['content'],
                'similarity': m['similarity']
            }
            for m in relevant_memories
        ]

        return jsonify({
            'memories': memories_for_chat,
            'count': len(memories_for_chat)
        })

    except Exception as e:
        logger.error(f"Error retrieving memories: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/memories', methods=['GET'])
def get_memories():
    """Get all memories, optionally filtered by character."""
    try:
        character_id = request.args.get('character_id')
        memories = memory_service.get_all_memories(character_id)

        return jsonify({
            'memories': memories,
            'count': len(memories)
        })

    except Exception as e:
        logger.error(f"Error getting memories: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/memories/<memory_id>', methods=['DELETE'])
def delete_memory(memory_id):
    """Delete a memory by ID."""
    try:
        success = memory_service.delete_memory(memory_id)

        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Memory not found'}), 404

    except Exception as e:
        logger.error(f"Error deleting memory: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Disable debug reloader so SentenceTransformer model is only loaded once into memory
    app.run(host='localhost', port=5001, debug=False, use_reloader=False)