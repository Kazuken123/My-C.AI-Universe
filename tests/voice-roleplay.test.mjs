import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceService, ALLOWED_EMOTION_TAGS } from '../backend/services/voice.service.js';
import { Character, SAFE_VOICE_ID_REGEX } from '../backend/models/Character.js';
import { ChatSession, ChatMessage } from '../backend/models/ChatSession.js';
import { ValidationError, NotFoundError } from '../backend/ai/errors.js';

test('VoiceService: extractSpokenDialogue isolates spoken words and strips actions/directives', () => {
  const input1 = '*crosses her arms and pouts* Of course I did! Who do you think I am? [REL_STATE:Affinity+2]';
  const result1 = VoiceService.extractSpokenDialogue(input1);
  assert.equal(result1, 'Of course I did! Who do you think I am?');

  const input2 = 'Kana Arima: "You really are an idiot, aren\'t you?" *giggles softly* [Scene Continuation Directive]';
  const result2 = VoiceService.extractSpokenDialogue(input2);
  assert.equal(result2, "You really are an idiot, aren't you?");

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
