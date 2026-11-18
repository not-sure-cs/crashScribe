import React, { useRef, useState } from 'react';
import { Check, Loader2, Mic, Square, X } from 'lucide-react';
import { OfflineAIService, TranscriptionResult } from '../services/offlineAI.service';
import { AITranscriptDraft, SupportedLanguage } from '../types/ai.types';

interface VoiceInputButtonProps {
  fieldKey: string;
  fieldLabel: string;
  language?: SupportedLanguage;
  onTranscription: (text: string) => void;
  onAIResult?: (draft: AITranscriptDraft) => void;
}

type VoiceState = 'idle' | 'recording' | 'processing' | 'review' | 'error';

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  fieldLabel,
  language: initialLanguage = 'en',
  onTranscription,
  onAIResult,
}) => {
  const [state, setState] = useState<VoiceState>('idle');
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const reset = () => {
    recorderRef.current = null;
    chunksRef.current = [];
    setResult(null);
    setError('');
    setState('idle');
  };

  const processAudio = async (audio: Blob) => {
    setState('processing');
    try {
      const transcription = await OfflineAIService.transcribe(audio, language);
      setResult(transcription);
      setState('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI processing failed. You can enter the text manually.');
      setState('error');
    }
  };

  const startRecording = async () => {
    setError('');
    if (!OfflineAIService.canRunInCurrentClient()) {
      setError('Configure a local or hosted AI API endpoint before recording. Manual entry remains available.');
      setState('error');
      return;
    }
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support microphone recording. Use manual entry or a supported browser.');
      setState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void processAudio(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setState('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone permission was not granted.');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const approve = () => {
    if (!result) return;
    onTranscription(result.text);
    onAIResult?.(OfflineAIService.createApprovedDraft(result, OfflineAIService.getConfig().provider));
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setState('review'); setResult(null); setError(''); }}
        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 rounded-md transition focus:outline-none"
        title="Record voice and transcribe with configured AI API"
        aria-label={`Voice input for ${fieldLabel}`}
      >
        <Mic className="w-4 h-4 text-amber-500/80 hover:text-amber-400" />
      </button>

      {state !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 max-w-md w-full shadow-2xl relative">
            <button type="button" onClick={reset} className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800" aria-label="Close voice input">
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-white text-base mb-1">Voice input review</h3>
            <p className="text-xs text-slate-400 mb-4">Field: <span className="text-amber-300">{fieldLabel}</span></p>

            {(state === 'review' || state === 'error') && (
              <label className="block text-xs text-slate-300 mb-3">
                Spoken language
                <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white">
                  <option value="as">Assamese</option>
                  <option value="bn">Bengali</option>
                  <option value="brx">Bodo</option>
                  <option value="en">English</option>
                </select>
              </label>
            )}

            {state === 'review' && !result && (
              <button type="button" onClick={() => void startRecording()} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                <Mic className="w-4 h-4" /> Start recording
              </button>
            )}
            {state === 'recording' && (
              <button type="button" onClick={stopRecording} className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                <Square className="w-4 h-4" /> Stop and transcribe
              </button>
            )}
            {state === 'processing' && (
              <div className="py-6 text-center text-xs text-amber-300"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Processing audio through the configured model API…</div>
            )}
            {result && (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Original transcript</div>
                  <div className="bg-slate-950 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-200 whitespace-pre-wrap">{result.text}</div>
                </div>
                {result.translation && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">English translation (separate)</div>
                    <div className="bg-slate-950 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-200 whitespace-pre-wrap">{result.translation}</div>
                  </div>
                )}
                <button type="button" onClick={approve} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> Approve transcript for this field
                </button>
                <p className="text-[10px] text-slate-500">Nothing is inserted until you approve it. Structured eDAR fields are never changed by AI.</p>
              </div>
            )}
            {state === 'error' && (
              <div className="space-y-3">
                <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-200">{error}</div>
                <button type="button" onClick={() => { setState('review'); setError(''); }} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold">Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
