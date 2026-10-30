import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceService, ALLOWED_EMOTION_TAGS } from '../backend/services/voice.service.js';
import { Character, SAFE_VOICE_ID_REGEX, ALLOWED_VOICE_PROVIDERS } from '../backend/models/Character.js';
import { CharacterController } from '../backend/controllers/character.controller.js';
import { ChatSession, ChatMessage } from '../backend/models/ChatSession.js';
import { ValidationError, NotFoundError } from '../backend/ai/errors.js';

test('VoiceService: extractSpokenDialogue isolates spoken words and strips actions/directives', () => {
  const input1 = '*crosses her arms and pouts* Of course I did! Who do you think I am? [REL_STATE:Affinity+2]';
  const result1 = VoiceService.extractSpokenDialogue(input1);
  assert.equal(result1, 'Of course I did! Who do you think I am?');

  const input2 = 'Kana Arima: "You really are an idiot, aren\'t you?" *giggles softly* [Scene Continuation Directive]';
  const result2 = VoiceService.extractSpokenDialogue(input2);
  assert.equal(result2, "You really are an idiot, aren't you?");

  const input3 = '*blushes furiously* "What are you **doing** here?! I __never__ asked for your help!" [[REL_STATE: {"affinity": 12, "mood": "Flustered"}]]';
  const result3 = VoiceService.extractSpokenDialogue(input3);
  assert.equal(result3, 'What are you doing here?! I never asked for your help!');

  // Actions only must throw ValidationError
  assert.throws(() => {
    VoiceService.extractSpokenDialogue('*sighs silently and walks away*');
  }, ValidationError);
});

test('VoiceService: detectAudioMagicBytes identifies valid audio binaries and rejects polyglots', () => {
  // Mock WAV header (RIFF....WAVE)
  const wavBuf = Buffer.alloc(44);
  wavBuf.write('RIFF', 0);
  wavBuf.write('WAVE', 8);
  assert.deepEqual(VoiceService.detectAudioMagicBytes(wavBuf), { ext: 'wav', mimeType: 'audio/wav' });

  // Mock MP3 header (ID3)
  const mp3Buf = Buffer.alloc(32);
  mp3Buf.write('ID3', 0);
  assert.deepEqual(VoiceService.detectAudioMagicBytes(mp3Buf), { ext: 'mp3', mimeType: 'audio/mpeg' });

  // Mock OGG header (OggS)
  const oggBuf = Buffer.alloc(32);
  oggBuf.write('OggS', 0);
  assert.deepEqual(VoiceService.detectAudioMagicBytes(oggBuf), { ext: 'ogg', mimeType: 'audio/ogg' });

  // HTML / Script polyglot must return null
  const htmlBuf = Buffer.from('<script>alert("xss")</script>');
  assert.equal(VoiceService.detectAudioMagicBytes(htmlBuf), null);
});

test('VoiceService: filterEmotionTags preserves allowlisted tags and removes foreign brackets', () => {
  const taggedText = '[pout] もう…！なんで私の言うこと聞いてくれないの？ [ATTACK_TAG] バカ！ [chuckle]';
  const clean = VoiceService.filterEmotionTags(taggedText);
  assert.equal(clean, '[pout] もう…！なんで私の言うこと聞いてくれないの？ バカ！ [chuckle]');
  assert.ok(ALLOWED_EMOTION_TAGS.has('pout'));
  assert.ok(ALLOWED_EMOTION_TAGS.has('chuckle'));
});

test('VoiceService: sanitizeHttpsUrl strictly enforces https: protocol and expands CDN prefixes', () => {
  assert.equal(VoiceService.sanitizeHttpsUrl('https://api.fish.audio/sample.mp3'), 'https://api.fish.audio/sample.mp3');
  assert.equal(VoiceService.sanitizeHttpsUrl('coverimage/f72069f55cba460082fce8c649ec2708'), 'https://public-platform.r2.fish.audio/coverimage/f72069f55cba460082fce8c649ec2708');
  assert.equal(VoiceService.sanitizeHttpsUrl('avatars/user123.jpg'), 'https://public-platform.r2.fish.audio/avatars/user123.jpg');
  assert.equal(VoiceService.sanitizeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(VoiceService.sanitizeHttpsUrl('data:text/html;base64,xxx'), null);
  assert.equal(VoiceService.sanitizeHttpsUrl('http://insecure.site/audio.mp3'), null);
});

test('Character: validates voiceId with SAFE_VOICE_ID_REGEX', () => {
  const validChar = new Character({
    name: 'Kana Arima',
    voiceId: '7b8f9e20-3b4a-4e12-89cd-0123456789ab'.replace(/-/g, '_'),
    voiceName: 'Kana Arima (Oshi no Ko)'
  });
  assert.doesNotThrow(() => validChar.validate());
  assert.equal(validChar.voiceName, 'Kana Arima (Oshi no Ko)');

  // Malicious voiceId with directory traversal or URL query
  const maliciousChar = new Character({
    name: 'Test Char',
    voiceId: '../admin/secret'
  });
  assert.throws(() => maliciousChar.validate(), ValidationError);

  // Unknown voiceProvider must be rejected by validate()
  assert.ok(ALLOWED_VOICE_PROVIDERS.has('fish_audio'));
  assert.ok(ALLOWED_VOICE_PROVIDERS.has('browser'));
  const badProviderChar = new Character({
    name: 'Test Char',
    voiceProvider: 'untrusted_tts_engine'
  });
  assert.throws(() => badProviderChar.validate(), ValidationError);
});

test('CharacterController: createCharacter and updateCharacter persist and clear voice configuration', async () => {
  const store = new Map();
  const mockRepo = {
    async save(char) {
      store.set(char.id, Character.fromDatabaseRow({
        id: char.id,
        name: char.name,
        tagline: char.tagline,
        avatar: char.avatar,
        greeting: char.greeting,
        personality: char.personality,
        appearance: char.appearance,
        abilities: char.abilities,
        background: char.background,
        speaking_style: char.speaking_style,
        example_dialogues: char.example_dialogues,
        initial_memory: char.initial_memory,
        initial_affinity: char.initialAffinity,
        initial_relationship_stage: char.initialRelationshipStage,
        relationship_dynamic: char.relationshipDynamic,
        voice_provider: char.voiceProvider,
        voice_id: char.voiceId,
        voice_name: char.voiceName,
        system_prompt: char.systemPrompt,
        wiki: char.wiki,
        wiki_url: char.wikiUrl,
        categories_json: JSON.stringify(char.categories),
        creator: char.creator,
        owner_user_id: char.ownerUserId,
        interactions: char.interactions,
        likes: char.likes,
        is_liked: char.isLiked ? 1 : 0,
        created_at: char.createdAt,
        updated_at: char.updatedAt
      }));
      return char;
    },
    async findById(id) {
      return store.get(id) || null;
    }
  };
  const mockMem = { async addMemory() {} };
  const controller = new CharacterController(mockRepo, {}, mockMem, {});

  const makeRes = () => {
    const out = { statusCode: 200, body: null };
    return {
      out,
      status(code) { out.statusCode = code; return this; },
      json(payload) { out.body = payload; return this; }
    };
  };

  // 1. Create character with Fish Audio voice fields
  const createRes = makeRes();
  await controller.createCharacter({
    user: { id: 'user_1', username: 'kazuken' },
    body: {
      name: 'Kana Arima',
      tagline: 'Genius Child Actress',
      voice_provider: 'fish_audio',
      voice_id: 'kana_seiyuu_01',
      voice_name: 'Kana Arima (Megumi Han)'
    }
  }, createRes);

  assert.equal(createRes.out.statusCode, 201);
  assert.equal(createRes.out.body.voice_provider, 'fish_audio');
  assert.equal(createRes.out.body.voice_id, 'kana_seiyuu_01');
  assert.equal(createRes.out.body.voice_name, 'Kana Arima (Megumi Han)');
  assert.equal(store.get(createRes.out.body.id).voiceId, 'kana_seiyuu_01');

  // 2. Reject invalid voice_id during createCharacter
  const invalidCreateRes = makeRes();
  await controller.createCharacter({
    user: { id: 'user_1', username: 'kazuken' },
    body: {
      name: 'Bad Voice Char',
      voice_id: '../evil/path'
    }
  }, invalidCreateRes);
  assert.equal(invalidCreateRes.out.statusCode, 400);

  // 3. Update character voice (camelCase) and then clear back to browser TTS
  const updateRes = makeRes();
  await controller.updateCharacter({
    params: { id: createRes.out.body.id },
    user: { id: 'user_1', username: 'kazuken' },
    body: {
      voiceProvider: 'fish_audio',
      voiceId: 'furina_jp_02',
      voiceName: 'Furina (Inori Minase)'
    }
  }, updateRes);
  assert.equal(updateRes.out.statusCode, 200);
  assert.equal(updateRes.out.body.voiceId, 'furina_jp_02');
  assert.equal(updateRes.out.body.voiceName, 'Furina (Inori Minase)');

  const clearRes = makeRes();
  await controller.updateCharacter({
    params: { id: createRes.out.body.id },
    user: { id: 'user_1', username: 'kazuken' },
    body: {
      voice_provider: 'browser',
      voice_id: '',
      voice_name: ''
    }
  }, clearRes);
  assert.equal(clearRes.out.statusCode, 200);
  assert.equal(clearRes.out.body.voice_provider, 'browser');
  assert.equal(clearRes.out.body.voice_id, '');
  assert.equal(clearRes.out.body.voice_name, '');
});

test('VoiceService: synthesizeMessageVoice verifies session ownership and returns cached audio', async () => {
  const mockAudioBuffer = Buffer.from('mock-mp3-audio-data');

  // In-memory mock repositories and R2 storage
  const mockSession = new ChatSession({
    id: 'session_test_1',
    userId: 'user_alice',
    characterId: 'char_kana',
    messages: [
      new ChatMessage({
        id: 'msg_model_1',
        sessionId: 'session_test_1',
        role: 'model',
        content: '*pouts* Why do you always tease me like that?'
      })
    ]
  });

  const mockCharacter = new Character({
    id: 'char_kana',
    name: 'Kana Arima',
    voiceId: 'kana_voice_model_id',
    voiceName: 'Kana Arima (Seiyuu)'
  });

  const mockR2 = {
    async getCachedVoiceAudio(sha256Hex) {
      if (sha256Hex) {
        return { buffer: mockAudioBuffer, mimeType: 'audio/mpeg' };
      }
      return null;
    },
    async putCachedVoiceAudio() {
      return true;
    }
  };

  const mockSessionRepo = {
    async findById(sessionId, userId) {
      if (sessionId === 'session_test_1' && userId === 'user_alice') {
        return mockSession;
      }
      return null;
    }
  };

  const mockCharRepo = {
    async findById(charId) {
      if (charId === 'char_kana') return mockCharacter;
      return null;
    }
  };

  process.env.FISH_AUDIO_API_KEY = "test_fish_key";
  const service = new VoiceService(mockR2, mockSessionRepo, mockCharRepo);

  // 1. Cross-user IDOR attempt (User Bob requesting User Alice's session audio)
  await assert.rejects(
    () => service.synthesizeMessageVoice({
      userId: 'user_bob',
      sessionId: 'session_test_1',
      messageId: 'msg_model_1'
    }),
    NotFoundError
  );

  // 2. Legitimate owner (User Alice) -> Hits R2 cache without calling external APIs
  // Ensure FISH_AUDIO_API_KEY is present for configuration gate
  process.env.FISH_AUDIO_API_KEY = 'test_fish_key';

  const result = await service.synthesizeMessageVoice({
    userId: 'user_alice',
    sessionId: 'session_test_1',
    messageId: 'msg_model_1'
  });

  assert.equal(result.cacheHit, true);
  assert.deepEqual(result.audioBuffer, mockAudioBuffer);
  assert.equal(result.mimeType, 'audio/mpeg');
});

test('Express Frontend: ApiClient, VoicePickerModal, Studio, and Chat wire Fish Audio voice roleplay end-to-end', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Provide minimal localStorage stub for frontend/js/api.js in Node test runner
  if (typeof globalThis.localStorage === 'undefined') {
    const map = new Map();
    globalThis.localStorage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    };
  }
  globalThis.localStorage.setItem('cai_auth_token', 'test_jwt_token');

  const { ApiClient } = await import('../frontend/js/api.js');
  const client = new ApiClient('http://localhost:3000');

  assert.equal(typeof client.searchVoiceModels, 'function');
  assert.equal(typeof client.createCustomVoice, 'function');
  assert.equal(typeof client.updateSessionVoice, 'function');
  assert.equal(typeof client.synthesizeMessageVoice, 'function');

  const originalFetch = globalThis.fetch;
  try {
    let capturedHeaders = null;
    globalThis.fetch = async (_url, opts) => {
      capturedHeaders = opts?.headers || {};
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };

    const audioBlob = await client.synthesizeMessageVoice({
      sessionId: 'sess_1',
      messageId: 'msg_1',
      variantIndex: 1
    });
    assert.equal(audioBlob.size, 4);
    assert.equal(capturedHeaders.Authorization, 'Bearer test_jwt_token');

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: 'No spoken dialogue found in message', code: 400 } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );

    await assert.rejects(
      () => client.synthesizeMessageVoice({ sessionId: 'sess_1', messageId: 'msg_1' }),
      /No spoken dialogue found in message/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const voicePickerMod = await import('../frontend/js/voice-picker.js');
  assert.equal(typeof voicePickerMod.openVoicePickerModal, 'function');
  assert.equal(typeof voicePickerMod.sanitizeVoiceSampleUrl, 'function');
  assert.equal(
    voicePickerMod.sanitizeVoiceSampleUrl('https://public-platform.r2.fish.audio/sample.mp3'),
    'https://public-platform.r2.fish.audio/sample.mp3'
  );
  assert.equal(voicePickerMod.sanitizeVoiceSampleUrl('javascript:alert(1)'), null);
  assert.equal(voicePickerMod.sanitizeVoiceSampleUrl('http://insecure.example/a.mp3'), null);

  const root = process.cwd();
  const createHtml = fs.readFileSync(path.join(root, 'frontend/create.html'), 'utf8');
  const studioJs = fs.readFileSync(path.join(root, 'frontend/js/studio-page.js'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(root, 'frontend/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(root, 'frontend/js/chat.js'), 'utf8');

  assert.match(createHtml, /voice-picker\.css/);
  assert.match(createHtml, /btnBrowseStudioVoice/);
  assert.match(studioJs, /openVoicePickerModal/);
  assert.match(studioJs, /voice_provider/);

  assert.match(chatHtml, /voice-picker\.css/);
  assert.match(chatHtml, /btnSelectVoice/);
  assert.match(chatJs, /openVoicePickerModal/);
  assert.match(chatJs, /synthesizeMessageVoice/);
  assert.match(chatJs, /updateSessionVoice/);

  const bareSpeakCalls = chatJs.match(/speakText\([^,)]+\)\s*;/g) || [];
  assert.equal(
    bareSpeakCalls.length,
    0,
    `Express chat.js must pass messageId and variantIndex to speakText, found bare calls: ${bareSpeakCalls.join(', ')}`
  );
});
