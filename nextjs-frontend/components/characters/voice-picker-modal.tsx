'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Volume2,
  Square,
  Play,
  Check,
  X,
  Upload,
  Sparkles,
  AlertCircle,
  Loader2,
  Mic,
  Tag
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface VoiceItem {
  id: string;
  title: string;
  description: string;
  author: string;
  coverImage: string | null;
  tags: string[];
  sampleAudio: string | null;
}

interface VoicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoiceId?: string;
  selectedVoiceName?: string;
  onSelectVoice: (voiceId: string, voiceName: string) => void;
  title?: string;
  subtitle?: string;
  authorDefaultVoiceId?: string;
  authorDefaultVoiceName?: string;
  characterName?: string;
}

const POPULAR_SEARCHES = ['Kana Arima', 'Furina', 'Megumin', 'Ai Hoshino', 'Takahashi Rie', 'Han Megumi'];

export function VoicePickerModal({
  isOpen,
  onClose,
  selectedVoiceId = '',
  selectedVoiceName = '',
  onSelectVoice,
  title = 'Choose Character Voice',
  subtitle,
  authorDefaultVoiceId = '',
  authorDefaultVoiceName = '',
  characterName = '',
}: VoicePickerModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');
  const [searchQuery, setSearchQuery] = useState(characterName || authorDefaultVoiceName || 'Kana Arima');
  const [language, setLanguage] = useState<string>('ja');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnconfigured, setIsUnconfigured] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Upload Custom Voice form states
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch voice models
  const fetchVoices = useCallback(async (query: string, lang: string) => {
    setIsLoading(true);
    try {
      const res = await api.searchVoiceModels({
        search: query || characterName || 'Kana Arima',
        language: lang,
        pageSize: 18,
      });
      if (res.unconfigured) {
        setIsUnconfigured(true);
      } else {
        setIsUnconfigured(false);
      }
      setVoices(res.items || []);
    } catch {
      setVoices([]);
    } finally {
      setIsLoading(false);
    }
  }, [characterName]);

  // Initial load and debounced search
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchVoices(searchQuery, language);
    }, searchQuery ? 300 : 0);

    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, language, fetchVoices]);

  // Audio preview playback
  const togglePlayPreview = (voice: VoiceItem) => {
    if (!voice.sampleAudio) return;

    if (playingAudioId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(voice.sampleAudio);
    audioRef.current = audio;
    setPlayingAudioId(voice.id);

    audio.onended = () => {
      setPlayingAudioId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingAudioId(null);
      audioRef.current = null;
    };

    audio.play().catch(() => {
      setPlayingAudioId(null);
      audioRef.current = null;
    });
  };

  // Handle custom audio file drop/selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setUploadError('Audio sample must be under 4MB');
      return;
    }

    setUploadError(null);
    setCustomAudioFile(file);
    if (!customTitle) {
      setCustomTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  // Submit custom voice upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAudioFile || !customTitle.trim()) {
      setUploadError('Please provide a title and audio file');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read audio file'));
        reader.readAsDataURL(customAudioFile);
      });

      const res = await api.createCustomVoice({
        title: customTitle.trim(),
        description: customDesc.trim(),
        audioDataUrl: dataUrl
      });

      onSelectVoice(res.voice.id, res.voice.title);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || 'Custom voice upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden double-bezel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
              <p className="text-xs text-white/50">
                {subtitle ||
                  (authorDefaultVoiceName
                    ? `Author Default: ${authorDefaultVoiceName} · Custom voice for ${characterName || 'this character'}`
                    : 'Fish Audio Seiyuu & Character Voice Engine')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-white/10 px-6 bg-white/[0.01]">
          <button
            onClick={() => setActiveTab('search')}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'search'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            )}
          >
            <Search className="w-4 h-4" />
            Search Community Voices
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'upload'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            )}
          >
            <Upload className="w-4 h-4" />
            Upload Custom Sample
          </button>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4 overflow-hidden">
            {/* Search Input, Language Filter & Clear to Default */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search by character or seiyuu (e.g. Kana Arima, Furina, Megumin)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Filter voices by language"
                title="Filter voices by language"
                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500/50 cursor-pointer"
              >
                <option value="ja" className="bg-[#0f1117]">🇯🇵 Japanese</option>
                <option value="all" className="bg-[#0f1117]">🌐 All Languages</option>
                <option value="en" className="bg-[#0f1117]">🇺🇸 English</option>
                <option value="zh" className="bg-[#0f1117]">🇨🇳 Chinese</option>
                <option value="ko" className="bg-[#0f1117]">🇰🇷 Korean</option>
              </select>

              {selectedVoiceId && (
                <button
                  onClick={() => {
                    onSelectVoice('', '');
                    onClose();
                  }}
                  className="px-3.5 py-2.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl transition-colors whitespace-nowrap"
                  title={authorDefaultVoiceName ? `Revert to author default voice (${authorDefaultVoiceName})` : 'Reset to Browser TTS'}
                >
                  {authorDefaultVoiceName ? `Reset to Author Default (${authorDefaultVoiceName})` : 'Reset to Browser TTS'}
                </button>
              )}
            </div>

            {/* Author Default Informational Pill */}
            {authorDefaultVoiceName && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                <span className="font-semibold text-purple-200">Author&apos;s Default Voice:</span>
                <span>{authorDefaultVoiceName}</span>
                <span className="text-purple-400/60 ml-auto text-[10px]">Active unless customized for this chat</span>
              </div>
            )}

            {/* Quick search chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-white/40 mr-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> Popular:
              </span>
              {POPULAR_SEARCHES.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Unconfigured Alert */}
            {isUnconfigured && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="font-semibold">FISH_AUDIO_API_KEY Not Configured</p>
                  <p className="text-amber-200/70 mt-0.5">
                    Add your Fish Audio API key to <code className="bg-black/30 px-1 py-0.5 rounded">.env</code> to enable live community voice search and emotion TTS.
                  </p>
                </div>
              </div>
            )}

            {/* Voice Cards Grid */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/40 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <p className="text-xs">Searching Fish Audio voice library...</p>
                </div>
              ) : voices.length === 0 ? (
                <div className="text-center py-16 text-white/40 space-y-2">
                  <Mic className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-sm">No voices found matching &quot;{searchQuery}&quot;</p>
                  <p className="text-xs text-white/30">Try searching for the Japanese Seiyuu or switch to the Upload tab.</p>
                </div>
              ) : (
                voices.map((voice) => {
                  const isSelected = selectedVoiceId === voice.id;
                  const isPlaying = playingAudioId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-xl border transition-all',
                        isSelected
                          ? 'bg-purple-500/10 border-purple-500/40 shadow-sm shadow-purple-500/5'
                          : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 pr-4">
                        {/* Play preview button */}
                        {voice.sampleAudio ? (
                          <button
                            onClick={() => togglePlayPreview(voice)}
                            className={cn(
                              'w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0',
                              isPlaying
                                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25 animate-pulse'
                                : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white'
                            )}
                            title={isPlaying ? 'Stop Preview' : 'Play Preview'}
                          >
                            {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                          </button>
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/20 shrink-0">
                            <Volume2 className="w-4 h-4" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-white truncate">{voice.title}</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 shrink-0">
                              @{voice.author}
                            </span>
                          </div>
                          {voice.description && (
                            <p className="text-xs text-white/50 truncate mt-0.5">{voice.description}</p>
                          )}
                          {voice.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 overflow-hidden">
                              {voice.tags.slice(0, 3).map((tag, idx) => (
                                <span key={idx} className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Select Voice Action */}
                      <button
                        onClick={() => {
                          onSelectVoice(voice.id, voice.title);
                          onClose();
                        }}
                        className={cn(
                          'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 flex items-center gap-1.5',
                          isSelected
                            ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/20'
                            : 'bg-white/10 hover:bg-white/20 text-white/90 hover:text-white'
                        )}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Selected
                          </>
                        ) : (
                          'Use Voice'
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Upload Custom Voice Tab */}
        {activeTab === 'upload' && (
          <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto">
            {uploadError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {uploadError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Voice / Character Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Kana Arima (Han Megumi)"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Short Description</label>
              <input
                type="text"
                placeholder="e.g. Tsundere anime seiyuu voice sample (10s clean)"
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Reference Audio Sample * (WAV / MP3, 10–30s clean speech, &le; 4MB)
              </label>
              <div className="border-2 border-dashed border-white/10 hover:border-purple-500/40 rounded-xl p-6 text-center transition-colors cursor-pointer bg-white/[0.01]">
                <input
                  type="file"
                  accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg,audio/webm"
                  onChange={handleFileChange}
                  className="hidden"
                  id="voice-file-upload"
                />
                <label htmlFor="voice-file-upload" className="cursor-pointer block space-y-2">
                  <Upload className="w-8 h-8 mx-auto text-purple-400 opacity-80" />
                  {customAudioFile ? (
                    <div>
                      <p className="text-sm font-medium text-white">{customAudioFile.name}</p>
                      <p className="text-xs text-white/40 mt-0.5">{(customAudioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-white/80">Click to select audio sample</p>
                      <p className="text-xs text-white/40 mt-1">Clean dialogue with no background music produces the best result</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className="px-4 py-2.5 text-xs text-white/70 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading || !customAudioFile || !customTitle.trim()}
                className="px-5 py-2.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registering Model...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save & Use Voice
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
