import { api } from './api.js';
import { escapeHtml, formatCount } from './characters.js';

/**
 * Format light-novel roleplay markup safely into HTML
 */
export function formatRoleplayText(rawText) {
  const safe = escapeHtml(rawText || '');
  return safe
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

export function initChatModule(appState, navigateTo, openStudioForEdit, showToast) {
  // Chat Header & Stream Elements
  const headerAvatar = document.getElementById('chat-header-avatar');
  const headerName = document.getElementById('chat-header-name');
  const headerSub = document.getElementById('chat-header-sub');
  const streamInner = document.getElementById('chat-stream-inner');
  const scrollWrap = document.getElementById('chat-messages-scroll');

  // Controls
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const continueBtn = document.getElementById('continueBtn');
  const updateCmdBtn = document.getElementById('updateCmdBtn');
  const newSessionBtn = document.getElementById('btnNewChatSession');
  const toggleDrawerBtn = document.getElementById('btnToggleDrawer');
  const ttsAutoBtn = document.getElementById('btnToggleTTS');
  const aiProviderSelect = document.getElementById('aiProvider');
  const chatPersonaSelect = document.getElementById('chatPersonaSelect');

  // Right Drawer Elements
  const rightDrawer = document.getElementById('chat-right-drawer');
  const drawerLoreContent = document.getElementById('drawer-lore-content');
  const drawerMemoriesList = document.getElementById('drawer-memories-list');
  const drawerPinsList = document.getElementById('drawer-pins-list');
  const drawerSessionsList = document.getElementById('drawer-sessions-list');
  const addMemoryForm = document.getElementById('add-memory-form');
  const newMemoryInput = document.getElementById('newMemoryInput');

  // Sidebar & Saved Chats View Elements
  const sidebarRecentList = document.getElementById('sidebar-recent-chats');
  const savedChatsGrid = document.getElementById('saved-chats-grid');
  const continueRow = document.getElementById('continue-chatting-row');
  const continueSection = document.getElementById('continue-chatting-section');

  let autoSpeakTTS = false;
  let isSending = false;

  /**
   * Speak dialogue aloud using browser Web Speech API
   */
  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    // Strip action asterisks and speaker prefix for natural speech
    const clean = (text || '')
      .replace(/\*[^*]+\*/g, '')
      .replace(/^[^:\n]{1,40}:\s*/gm, '')
      .replace(/"/g, '')
      .trim();

    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  if (ttsAutoBtn) {
    ttsAutoBtn.addEventListener('click', () => {
      autoSpeakTTS = !autoSpeakTTS;
      ttsAutoBtn.classList.toggle('btn-primary', autoSpeakTTS);
      ttsAutoBtn.textContent = autoSpeakTTS ? '🔊 Voice: ON' : '🔈 Voice';
      if (!autoSpeakTTS && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    });
  }

  if (toggleDrawerBtn && rightDrawer) {
    toggleDrawerBtn.addEventListener('click', () => {
      rightDrawer.classList.toggle('collapsed');
    });
  }

  // Drawer tab switching
  document.querySelectorAll('.drawer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.drawer-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.pane);
      if (target) target.classList.add('active');
    });
  });

  /**
   * Load all chat sessions for sidebar & Saved Chats view
   */
  async function loadAllSessions() {
    try {
      const sessions = await api.getChatSessions();
      appState.sessions = sessions;
      renderSidebarRecentChats(sessions);
      renderSavedChatsView(sessions);
      renderContinueChattingRow(sessions);
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  }

  function renderSidebarRecentChats(sessions) {
    if (!sidebarRecentList) return;
    if (!sessions || sessions.length === 0) {
      // Show top characters as quick-start items if no sessions yet
      const chars = (appState.characters || []).slice(0, 5);
      sidebarRecentList.innerHTML = chars.map(c => `
        <div class="recent-chat-item" data-quick-char="${escapeHtml(c.id)}">
          <img class="recent-chat-avatar" src="${escapeHtml(c.avatar || '')}" alt="" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
          <div class="recent-chat-meta">
            <div class="recent-chat-name">${escapeHtml(c.name)}</div>
            <div class="recent-chat-preview">${escapeHtml(c.tagline || 'Start chatting')}</div>
          </div>
        </div>
      `).join('');

      sidebarRecentList.querySelectorAll('[data-quick-char]').forEach(el => {
        el.addEventListener('click', () => openChatWithCharacter(el.dataset.quickChar));
      });
      return;
    }

    sidebarRecentList.innerHTML = sessions.slice(0, 10).map(s => `
      <div class="recent-chat-item ${appState.activeSession?.id === s.id ? 'active' : ''}" data-open-session="${escapeHtml(s.id)}" data-session-char="${escapeHtml(s.characterId)}">
        <img class="recent-chat-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
        <div class="recent-chat-meta">
          <div class="recent-chat-name">${escapeHtml(s.characterName)}</div>
          <div class="recent-chat-preview">${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 48))}</div>
        </div>
      </div>
    `).join('');

    sidebarRecentList.querySelectorAll('[data-open-session]').forEach(el => {
      el.addEventListener('click', () => {
        openChatWithCharacter(el.dataset.sessionChar, el.dataset.openSession);
      });
    });
  }

  function renderContinueChattingRow(sessions) {
    if (!continueRow || !continueSection) return;
    if (!sessions || sessions.length === 0) {
      continueSection.style.display = 'none';
      return;
    }
    continueSection.style.display = 'block';
    continueRow.innerHTML = sessions.slice(0, 3).map(s => `
      <div class="cai-card" data-cont-session="${escapeHtml(s.id)}" data-cont-char="${escapeHtml(s.characterId)}">
        <div class="cai-card-top">
          <img class="cai-avatar" style="width: 48px; height: 48px;" src="${escapeHtml(s.characterAvatar || '')}" alt="" />
          <div class="cai-card-info">
            <div class="cai-card-name">${escapeHtml(s.characterName)}</div>
            <div class="cai-card-creator">${s.messageCount} messages • ${new Date(s.updatedAt).toLocaleDateString()}</div>
            <div class="cai-card-tagline">${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 80))}</div>
          </div>
        </div>
      </div>
    `).join('');

    continueRow.querySelectorAll('[data-cont-session]').forEach(card => {
      card.addEventListener('click', () => {
        openChatWithCharacter(card.dataset.contChar, card.dataset.contSession);
      });
    });
  }

  function renderSavedChatsView(sessions) {
    if (!savedChatsGrid) return;
    if (!sessions || sessions.length === 0) {
      savedChatsGrid.innerHTML = `
        <div class="studio-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
          <h3>No active chat sessions yet</h3>
          <p class="hint" style="margin-top: 6px;">Pick any character from Discover to begin your first roleplay story!</p>
        </div>
      `;
      return;
    }

    savedChatsGrid.innerHTML = sessions.map(s => `
      <div class="cai-card" data-saved-session="${escapeHtml(s.id)}" data-saved-char="${escapeHtml(s.characterId)}">
        <div class="cai-card-top">
          <img class="cai-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="" />
          <div class="cai-card-info">
            <div class="cai-card-name">${escapeHtml(s.characterName)}</div>
            <div class="cai-card-creator">${s.messageCount} turns • Updated ${new Date(s.updatedAt).toLocaleString()}</div>
            <div class="cai-card-tagline">${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 100))}</div>
          </div>
        </div>
        <div class="cai-card-footer">
          <span>Provider: ${escapeHtml(s.provider || 'gemini')}</span>
          <div class="card-actions">
            <button class="btn btn-danger btn-sm" data-del-session="${escapeHtml(s.id)}">🗑️</button>
            <button class="btn btn-primary btn-sm" data-resume-session="${escapeHtml(s.id)}" data-resume-char="${escapeHtml(s.characterId)}">Continue Chat</button>
          </div>
        </div>
      </div>
    `).join('');

    savedChatsGrid.querySelectorAll('[data-resume-session]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatWithCharacter(btn.dataset.resumeChar, btn.dataset.resumeSession);
      });
    });

    savedChatsGrid.querySelectorAll('[data-del-session]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api.deleteChatSession(btn.dataset.delSession);
          showToast('Chat session deleted.');
          await loadAllSessions();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  /**
   * Open the Chat Room for a specific Character and optional Session ID
   */
  async function openChatWithCharacter(characterId, sessionId = null) {
    try {
      const character = await api.getCharacter(characterId);
      appState.activeCharacter = character;

      // Load sessions for this character
      const charSessions = await api.getChatSessions(characterId);
      let session;

      if (sessionId) {
        session = await api.getChatSession(sessionId);
      } else if (charSessions.length > 0) {
        session = await api.getChatSession(charSessions[0].id);
      } else {
        session = await api.createChatSession({
          characterId: character.id,
          personaId: appState.activePersona?.id || 'persona_default',
          provider: aiProviderSelect?.value || 'gemini'
        });
      }

      appState.activeSession = session;

      // Update URL cleanly without reloading
      const url = `/chat.html?id=${encodeURIComponent(character.id)}`;
      if (window.location.pathname + window.location.search !== url) {
        window.history.pushState({ view: 'chat', characterId: character.id }, '', url);
      }

      navigateTo('chat', false);
      renderChatHeader(character, session);
      renderChatStream(character, session);
      await refreshRightDrawer(character, session);
      await loadAllSessions();
    } catch (error) {
      console.error('Failed to open chat:', error);
      showToast('Could not open chat: ' + error.message);
    }
  }

  function renderChatHeader(character, session) {
    const avatarUrl = character.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(character.name)}`;
    if (headerAvatar) headerAvatar.src = avatarUrl;
    if (headerName) headerName.textContent = character.name;
    if (headerSub) {
      headerSub.textContent = `${character.tagline || 'AI Character'} • By ${character.creator || '@you'} • 💬 ${formatCount(character.interactions || 0)}`;
    }
    if (chatInput) {
      chatInput.placeholder = `Message ${character.name}... (Press Enter on empty input for AI to continue scene)`;
    }
    if (aiProviderSelect && session?.provider) {
      aiProviderSelect.value = session.provider;
    }
  }

  function renderChatStream(character, session) {
    if (!streamInner) return;
    const avatarUrl = character.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(character.name)}`;
    const userPersona = appState.personas?.find(p => p.id === session.personaId) || appState.activePersona || { name: 'You', avatar: '🌟' };

    const introHtml = `
      <div class="chat-intro-card">
        <img class="chat-intro-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(character.name)}" />
        <h3>${escapeHtml(character.name)}</h3>
        <p>${escapeHtml(character.tagline || '')}</p>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          Created by ${escapeHtml(character.creator || '@you')} • Remember: Everything Characters say is made up!
        </div>
      </div>
    `;

    const messages = session.messages || [];
    const lastModelIdx = messages.map(m => m.role).lastIndexOf('model');

    const messagesHtml = messages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      const senderName = isUser ? userPersona.name : character.name;
      const variants = Array.isArray(msg.variants) && msg.variants.length > 0
        ? msg.variants
        : [{ id: 'v1', text: msg.content }];
      const selectedIdx = Math.min(msg.selectedVariantIndex || 0, variants.length - 1);
      const displayContent = variants[selectedIdx]?.text || msg.content;
      const isLastModel = !isUser && idx === lastModelIdx;

      return `
        <div class="msg-row ${isUser ? 'user' : 'model'}" data-msg-id="${escapeHtml(msg.id)}">
          ${isUser
            ? `<div class="msg-avatar">${escapeHtml(userPersona.avatar || '🌟')}</div>`
            : `<img class="msg-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(character.name)}" />`
          }
          <div class="msg-body">
            <div class="msg-sender-line">
              <span class="msg-sender-name">${escapeHtml(senderName)}</span>
              ${!isUser ? `<span class="char-badge">c.ai</span>` : ''}
              ${msg.isPinned ? `<span class="pin-indicator">📌 Pinned</span>` : ''}
            </div>
            <div class="msg-bubble" data-bubble-id="${escapeHtml(msg.id)}">${formatRoleplayText(displayContent)}</div>
            <div class="msg-controls">
              ${!isUser ? `
                <div class="variant-swiper">
                  <button class="swipe-btn" data-swipe-dir="-1" data-msg-id="${escapeHtml(msg.id)}" ${selectedIdx <= 0 ? 'disabled' : ''} title="Previous Variant">◀</button>
                  <span>${selectedIdx + 1} / ${variants.length}</span>
                  <button class="swipe-btn" data-swipe-dir="1" data-msg-id="${escapeHtml(msg.id)}" ${selectedIdx >= variants.length - 1 ? 'disabled' : ''} title="Next Variant">▶</button>
                  ${isLastModel ? `<button class="swipe-btn" data-regen-msg="${escapeHtml(msg.id)}" title="Generate new variant">🔄</button>` : ''}
                </div>
              ` : '<div></div>'}
              <div class="msg-action-btns">
                ${!isUser ? `<button class="msg-tool-btn" data-tts-msg="${escapeHtml(msg.id)}" title="Read Aloud">🔊</button>` : ''}
                <button class="msg-tool-btn ${msg.isPinned ? 'pinned' : ''}" data-pin-msg="${escapeHtml(msg.id)}" title="Pin to Character Memory">📌</button>
                <button class="msg-tool-btn" data-edit-msg="${escapeHtml(msg.id)}" title="Edit Message">✏️</button>
                <button class="msg-tool-btn" data-rewind-msg="${escapeHtml(msg.id)}" title="Rewind chat to here">⏪</button>
                <button class="msg-tool-btn" data-copy-msg="${escapeHtml(msg.id)}" title="Copy text">📋</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    streamInner.innerHTML = introHtml + messagesHtml;
    scrollToBottom();
    bindStreamEvents(character, session);
  }

  function scrollToBottom() {
    if (scrollWrap) {
      scrollWrap.scrollTop = scrollWrap.scrollHeight;
    }
  }

  function bindStreamEvents(character, session) {
    if (!streamInner) return;

    // Swipe between variants
    streamInner.querySelectorAll('[data-swipe-dir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.msgId;
        const dir = Number(btn.dataset.swipeDir);
        const msg = session.messages.find(m => m.id === msgId);
        if (!msg || !Array.isArray(msg.variants)) return;

        const nextIdx = (msg.selectedVariantIndex || 0) + dir;
        if (nextIdx < 0 || nextIdx >= msg.variants.length) return;

        try {
          const updated = await api.updateChatMessage(session.id, msgId, {
            selectedVariantIndex: nextIdx
          });
          appState.activeSession = updated.session;
          renderChatStream(character, updated.session);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Regenerate new swipe variant
    streamInner.querySelectorAll('[data-regen-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await handleRegenerateVariant(btn);
      });
    });

    // TTS Read Aloud
    streamInner.querySelectorAll('[data-tts-msg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = session.messages.find(m => m.id === btn.dataset.ttsMsg);
        if (msg) speakText(msg.content);
      });
    });

    // Pin / Unpin message
    streamInner.querySelectorAll('[data-pin-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.pinMsg;
        const msg = session.messages.find(m => m.id === msgId);
        if (!msg) return;
        try {
          const updated = await api.updateChatMessage(session.id, msgId, {
            isPinned: !msg.isPinned
          });
          appState.activeSession = updated.session;
          renderChatStream(character, updated.session);
          await refreshRightDrawer(character, updated.session);
          showToast(msg.isPinned ? 'Unpinned message' : '📌 Pinned message to memory!');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Edit message in place
    streamInner.querySelectorAll('[data-edit-msg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.dataset.editMsg;
        const msg = session.messages.find(m => m.id === msgId);
        const bubble = streamInner.querySelector(`[data-bubble-id="${msgId}"]`);
        if (!msg || !bubble) return;

        bubble.innerHTML = `
          <textarea class="form-textarea" id="inline-edit-${msgId}" style="min-height: 90px; margin-bottom: 8px;">${escapeHtml(msg.content)}</textarea>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" id="cancel-edit-${msgId}">Cancel</button>
            <button class="btn btn-primary btn-sm" id="save-edit-${msgId}">Save</button>
          </div>
        `;

        document.getElementById(`cancel-edit-${msgId}`).onclick = () => renderChatStream(character, session);
        document.getElementById(`save-edit-${msgId}`).onclick = async () => {
          const newText = document.getElementById(`inline-edit-${msgId}`).value.trim();
          if (!newText) return;
          try {
            const updated = await api.updateChatMessage(session.id, msgId, { content: newText });
            appState.activeSession = updated.session;
            renderChatStream(character, updated.session);
            showToast('Message updated.');
          } catch (err) {
            showToast(err.message);
          }
        };
      });
    });

    // Rewind chat to message
    streamInner.querySelectorAll('[data-rewind-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.rewindMsg;
        const idx = session.messages.findIndex(m => m.id === msgId);
        if (idx === -1 || idx === session.messages.length - 1) {
          showToast('Already at the latest message.');
          return;
        }
        try {
          const updatedSession = await api.rewindChatSession(session.id, msgId);
          appState.activeSession = updatedSession;
          renderChatStream(character, updatedSession);
          showToast('⏪ Rewound conversation to selected turn.');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Copy message
    streamInner.querySelectorAll('[data-copy-msg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = session.messages.find(m => m.id === btn.dataset.copyMsg);
        if (!msg) return;
        navigator.clipboard?.writeText(msg.content);
        showToast('📋 Copied message to clipboard!');
      });
    });
  }

  /**
   * Send user message or trigger AI continuation if input is empty
   */
  async function handleSendOrContinue() {
    if (isSending || !appState.activeCharacter || !appState.activeSession) return;
    const text = (chatInput?.value || '').trim();
    if (text) {
      await sendUserMessage(text);
    } else {
      await handleContinueScene();
    }
  }

  async function sendUserMessage(text) {
    const character = appState.activeCharacter;
    const session = appState.activeSession;
    if (!character || !session) return;

    isSending = true;
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Optimistically append user message + typing indicator
    const tempIndicator = document.createElement('div');
    tempIndicator.className = 'msg-row model';
    tempIndicator.innerHTML = `
      <img class="msg-avatar" src="${escapeHtml(character.avatar || '')}" alt="" />
      <div class="msg-body">
        <div class="msg-sender-line"><span class="msg-sender-name">${escapeHtml(character.name)}</span><span class="char-badge">c.ai</span></div>
        <div class="msg-bubble"><em>*${escapeHtml(character.name)} is typing...*</em></div>
      </div>
    `;
    streamInner.appendChild(tempIndicator);
    scrollToBottom();

    try {
      const provider = aiProviderSelect?.value || 'gemini';
      const personaId = chatPersonaSelect?.value || appState.activePersona?.id;
      const historyPayload = (session.messages || []).slice(-20).map(m => ({
        role: m.role,
        content: m.content
      }));

      const result = await api.sendChatMessage({
        charId: character.id,
        sessionId: session.id,
        personaId,
        provider,
        message: text,
        memory: historyPayload
      });

      if (result.characterUpdated) {
        appState.activeCharacter = result.characterUpdated;
        renderChatHeader(result.characterUpdated, session);
        showToast(result.response);
      }

      const updatedSession = await api.getChatSession(result.sessionId || session.id);
      appState.activeSession = updatedSession;
      renderChatStream(appState.activeCharacter, updatedSession);
      await refreshRightDrawer(appState.activeCharacter, updatedSession);
      await loadAllSessions();

      if (autoSpeakTTS && result.response && !result.characterUpdated) {
        speakText(result.response);
      }
    } catch (error) {
      tempIndicator.remove();
      showToast('Chat error: ' + error.message);
    } finally {
      isSending = false;
    }
  }

  /**
   * Generate a new swipe variant for the latest AI message
   */
  async function handleRegenerateVariant(btnElement) {
    if (isSending || !appState.activeCharacter || !appState.activeSession) return;
    const character = appState.activeCharacter;
    const session = appState.activeSession;

    const messages = session.messages || [];
    const lastModelIdx = messages.map(m => m.role).lastIndexOf('model');
    if (lastModelIdx === -1) return;

    const targetModelMsg = messages[lastModelIdx];
    const precedingUserMsg = lastModelIdx > 0 && messages[lastModelIdx - 1].role === 'user'
      ? messages[lastModelIdx - 1].content
      : 'Hello';

    isSending = true;
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.textContent = '⏳';
    }

    try {
      const result = await api.sendChatMessage({
        charId: character.id,
        sessionId: session.id,
        provider: aiProviderSelect?.value || 'gemini',
        message: precedingUserMsg,
        regenerate: true,
        previousResponse: targetModelMsg.content,
        excludeVariants: (targetModelMsg.variants || []).map(v => v.text)
      });

      const updatedSession = await api.getChatSession(result.sessionId || session.id);
      appState.activeSession = updatedSession;
      renderChatStream(character, updatedSession);

      if (autoSpeakTTS && result.response) {
        speakText(result.response);
      }
    } catch (error) {
      showToast('Failed to regenerate variant: ' + error.message);
    } finally {
      isSending = false;
    }
  }

  /**
   * Continue roleplay scene from the last assistant message (Empty Enter / Continue button)
   */
  async function handleContinueScene() {
    if (isSending || !appState.activeCharacter || !appState.activeSession) return;
    const character = appState.activeCharacter;
    const session = appState.activeSession;
    const messages = session.messages || [];
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    isSending = true;

    const tempIndicator = document.createElement('div');
    tempIndicator.className = 'msg-row model';
    tempIndicator.innerHTML = `
      <img class="msg-avatar" src="${escapeHtml(character.avatar || '')}" alt="" />
      <div class="msg-body">
        <div class="msg- bubble"><em>*${escapeHtml(character.name)} continues the scene...*</em></div>
      </div>
    `;
    streamInner.appendChild(tempIndicator);
    scrollToBottom();

    try {
      const result = await api.sendChatMessage({
        charId: character.id,
        sessionId: session.id,
        provider: aiProviderSelect?.value || 'gemini',
        message: '',
        continue: true,
        continueFromAssistant: true,
        lastMessage: lastMsg.content,
        memory: messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      });

      const updatedSession = await api.getChatSession(result.sessionId || session.id);
      appState.activeSession = updatedSession;
      renderChatStream(character, updatedSession);
      await loadAllSessions();

      if (autoSpeakTTS && result.response) {
        speakText(result.response);
      }
    } catch (error) {
      tempIndicator.remove();
      showToast('Continuation error: ' + error.message);
    } finally {
      isSending = false;
    }
  }

  /**
   * Refresh the Right-Side Drawer (Lore, Memories, Pinned Messages, Session History)
   */
  async function refreshRightDrawer(character, session) {
    if (!character) return;

    // 1. Lore & Actions
    if (drawerLoreContent) {
      drawerLoreContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 16px;">
          <img src="${escapeHtml(character.avatar || '')}" alt="" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent);" />
          <h3 style="margin-top: 8px; font-size: 1.05rem;">${escapeHtml(character.name)}</h3>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(character.tagline || '')}</p>
          <div style="display: flex; gap: 6px; justify-content: center; margin-top: 10px;">
            <button class="btn btn-secondary btn-sm" id="drawer-edit-char-btn">✏️ Edit Character</button>
            <button class="btn btn-secondary btn-sm" id="drawer-export-chat-btn">📥 Export Chat</button>
          </div>
          ${character.wiki ? `<div style="margin-top: 8px;"><a href="${escapeHtml(character.wiki)}" target="_blank" style="color: var(--accent); font-size: 0.78rem;">🌐 Open Source Wiki ↗</a></div>` : ''}
        </div>
        ${character.personality ? `<div class="lore-block"><h4>Personality</h4><p>${escapeHtml(character.personality)}</p></div>` : ''}
        ${character.appearance ? `<div class="lore-block"><h4>Appearance</h4><p>${escapeHtml(character.appearance)}</p></div>` : ''}
        ${character.abilities ? `<div class="lore-block"><h4>Abilities & Skills</h4><p>${escapeHtml(character.abilities)}</p></div>` : ''}
        ${character.background ? `<div class="lore-block"><h4>Background</h4><p>${escapeHtml(character.background)}</p></div>` : ''}
        ${character.speaking_style ? `<div class="lore-block"><h4>Speaking Style</h4><p>${escapeHtml(character.speaking_style)}</p></div>` : ''}
      `;

      const editBtn = document.getElementById('drawer-edit-char-btn');
      if (editBtn) editBtn.onclick = () => openStudioForEdit(character);

      const exportBtn = document.getElementById('drawer-export-chat-btn');
      if (exportBtn) {
        exportBtn.onclick = () => {
          const blob = new Blob([JSON.stringify({ character, session }, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${character.name.replace(/\s+/g, '_')}_chat.json`;
          a.click();
        };
      }
    }

    // 2. Pinned Messages & Long-Term Memories
    if (drawerPinsList && session) {
      const pins = (session.messages || []).filter(m => m.isPinned);
      drawerPinsList.innerHTML = pins.length === 0
        ? `<p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">No pinned messages yet. Click 📌 on any message to pin it to context.</p>`
        : pins.map(p => `
            <div class="memory-item">
              <div><strong>${p.role === 'user' ? 'You' : escapeHtml(character.name)}:</strong> ${escapeHtml(p.content.slice(0, 110))}</div>
            </div>
          `).join('');
    }

    if (drawerMemoriesList) {
      try {
        const memData = await api.getMemories(character.id);
        const memories = memData.memories || [];
        drawerMemoriesList.innerHTML = memories.length === 0
          ? `<p style="font-size: 0.78rem; color: var(--text-muted);">No long-term memories stored yet.</p>`
          : memories.map(m => `
              <div class="memory-item">
                <div>
                  <div>${escapeHtml(m.content)}</div>
                  <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 3px;">Source: ${escapeHtml(m.source || 'conversation')}</div>
                </div>
                <button class="msg-tool-btn" data-del-mem="${escapeHtml(m.id)}" title="Delete memory">✕</button>
              </div>
            `).join('');

        drawerMemoriesList.querySelectorAll('[data-del-mem]').forEach(btn => {
          btn.addEventListener('click', async () => {
            await api.deleteMemory(btn.dataset.delMem);
            await refreshRightDrawer(character, session);
            showToast('Memory removed.');
          });
        });
      } catch (err) {
        console.warn('Memory load error:', err);
      }
    }

    // 3. Character Sessions History
    if (drawerSessionsList) {
      const charSessions = await api.getChatSessions(character.id);
      drawerSessionsList.innerHTML = charSessions.map(s => `
        <div class="memory-item" style="cursor: pointer; ${s.id === session?.id ? 'border-color: var(--accent);' : ''}" data-switch-session="${escapeHtml(s.id)}">
          <div>
            <div style="font-weight: 600;">${escapeHtml(s.title)} (${s.messageCount} turns)</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
              ${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 70))}
            </div>
            <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 3px;">
              ${new Date(s.updatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      `).join('');

      drawerSessionsList.querySelectorAll('[data-switch-session]').forEach(item => {
        item.addEventListener('click', () => {
          openChatWithCharacter(character.id, item.dataset.switchSession);
        });
      });
    }
  }

  // Add manual memory form
  if (addMemoryForm) {
    addMemoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = newMemoryInput?.value.trim();
      if (!text || !appState.activeCharacter) return;
      try {
        await api.addMemory(appState.activeCharacter.id, text);
        newMemoryInput.value = '';
        await refreshRightDrawer(appState.activeCharacter, appState.activeSession);
        showToast('🧠 Added to character long-term memory!');
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  // Input events
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendOrContinue();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendOrContinue);
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', handleContinueScene);
  }

  if (updateCmdBtn && chatInput) {
    updateCmdBtn.addEventListener('click', () => {
      chatInput.value = '/update personality: ';
      chatInput.focus();
    });
  }

  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', async () => {
      if (!appState.activeCharacter) return;
      try {
        const newSession = await api.createChatSession({
          characterId: appState.activeCharacter.id,
          personaId: chatPersonaSelect?.value || appState.activePersona?.id || 'persona_default',
          provider: aiProviderSelect?.value || 'gemini'
        });
        await openChatWithCharacter(appState.activeCharacter.id, newSession.id);
        showToast('✨ Started a fresh chat session!');
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  return {
    openChatWithCharacter,
    loadAllSessions
  };
}
