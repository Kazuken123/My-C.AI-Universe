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

    def add_memory(self, content: str, character_id: str = None, metadata: Dict = None) -> str:
        """
        Add a new memory with embedding.

        Args:
            content: The memory content text
            character_id: Optional character ID for filtering
            metadata: Optional metadata dictionary

        Returns:
            Memory ID
        """
        self._load_model()

        # Generate embedding
        embedding = self.model.encode(content).tolist()

        # Create memory object
        memory_id = str(uuid.uuid4())
        memory = {
            'id': memory_id,
            'content': content,
            'embedding': embedding,
            'character_id': character_id,
            'metadata': metadata or {},
            'created_at': str(np.datetime64('now'))
        }

        self.memories.append(memory)
        self.save_memories()

        logger.info(f"Added memory: {content[:50]}...")
        return memory_id

    def retrieve_relevant_memories(self, query: str, character_id: str = None,
                                 top_k: int = 3, threshold: float = 0.3) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories based on semantic similarity.

        Args:
            query: Query text to find relevant memories
            character_id: Optional character ID filter
            top_k: Number of top memories to return
            threshold: Minimum similarity threshold

        Returns:
            List of relevant memories with similarity scores
        """
        if not self.memories:
            return []

        self._load_model()

        # Encode query
        query_embedding = self.model.encode(query).reshape(1, -1)

        # Filter memories by character if specified
        filtered_memories = self.memories
        if character_id:
            filtered_memories = [m for m in self.memories if m.get('character_id') == character_id]

        if not filtered_memories:
            return []

        # Calculate similarities
        memory_embeddings = np.array([m['embedding'] for m in filtered_memories])
        similarities = cosine_similarity(query_embedding, memory_embeddings)[0]

        # Get top-k memories above threshold
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
        metadata = data.get('metadata', {})

        memory_id = memory_service.add_memory(content, character_id, metadata)

        return jsonify({
            'success': True,
            'memory_id': memory_id
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
        top_k = data.get('top_k', 3)
        threshold = data.get('threshold', 0.3)

        relevant_memories = memory_service.retrieve_relevant_memories(
            query, character_id, top_k, threshold
        )

        # Return only content and similarity for the chat backend
        memories_for_chat = [
            {
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
    # Run on port 5001 to avoid conflict with Node.js server
    app.run(host='localhost', port=5001, debug=True)