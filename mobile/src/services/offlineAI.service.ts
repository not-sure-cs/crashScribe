import {
  AIModelInfo,
  AITranscriptDraft,
  LANGUAGE_PROFILES,
  SupportedLanguage,
} from '../types/ai.types';

export type BrowserAIProvider = 'local' | 'huggingface';

export interface BrowserAIConfig {
  provider: BrowserAIProvider;
  baseUrl: string;
  token?: string;
  asrModel: string;
  translationUrl?: string;
  translationModel?: string;
}

export interface TranscriptionResult {
  text: string;
  language: SupportedLanguage;
  translation?: string;
}

const CONFIG_KEY = 'crashscribe_browser_ai_config';
const DEFAULT_HF_BASE_URL = 'https://router.huggingface.co/hf-inference/models';

const MODEL_CATALOG: AIModelInfo[] = [
  {
    id: 'indicconformer-as-bn-brx',
    name: 'AI4Bharat IndicConformer',
    purpose: 'Browser API ASR for Assamese, Bengali, and Bodo',
    languages: ['as', 'bn', 'brx'],
    artifactSource: 'Configure a local server or Hugging Face Inference Provider endpoint',
    status: 'UNAVAILABLE',
  },
  {
    id: 'whisper-tiny-en',
    name: 'OpenAI Whisper Tiny.en',
    purpose: 'Browser API ASR for English',
    languages: ['en'],
    artifactSource: 'Configure a local server or Hugging Face Inference Provider endpoint',
    status: 'UNAVAILABLE',
  },
  {
    id: 'indictrans2-indic-en-dist-200m',
    name: 'AI4Bharat IndicTrans2 Indic→English Distilled 200M',
    purpose: 'Browser API translation for Assamese, Bengali, and Bodo',
    languages: ['as', 'bn', 'brx'],
    artifactSource: 'Configure a local translation endpoint',
    status: 'UNAVAILABLE',
  },
];

function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.[name];
}

function defaultConfig(): BrowserAIConfig {
  return {
    provider: (readEnv('VITE_AI_PROVIDER') as BrowserAIProvider | undefined) || 'local',
    baseUrl: readEnv('VITE_AI_BASE_URL') || 'http://127.0.0.1:8000',
    token: readEnv('VITE_AI_TOKEN'),
    asrModel: readEnv('VITE_AI_ASR_MODEL') || 'ai4bharat/indic-conformer-600m-multilingual',
    translationUrl: readEnv('VITE_AI_TRANSLATION_URL') || 'http://127.0.0.1:8000',
    translationModel: readEnv('VITE_AI_TRANSLATION_MODEL') || 'ai4bharat/indictrans2-indic-en-dist-200M',
  };
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { text: raw };
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `AI request failed (${response.status})`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== 'object') throw new Error('AI provider returned an invalid response');
  return payload;
}

function responseText(payload: unknown): string {
  const item = Array.isArray(payload) ? payload[0] : payload;
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const text = record.text ?? record.transcription ?? record.transcript ?? record.translation_text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI provider returned no transcript text');
  return text.trim();
}

/** Browser integration for a local model server or a hosted Hugging Face endpoint. */
export class OfflineAIService {
  static getModels(): AIModelInfo[] {
    const config = this.getConfig();
    return MODEL_CATALOG.map((model) => ({
      ...model,
      languages: [...model.languages],
      status: config.baseUrl ? 'AVAILABLE_VIA_API' : 'UNAVAILABLE',
    }));
  }

  static getLanguageProfile(language: SupportedLanguage) {
    return LANGUAGE_PROFILES[language];
  }

  static getConfig(): BrowserAIConfig {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      return saved ? { ...defaultConfig(), ...JSON.parse(saved) } : defaultConfig();
    } catch {
      return defaultConfig();
    }
  }

  static saveConfig(config: BrowserAIConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, token: config.token || undefined }));
  }

  static canRunInCurrentClient(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!this.getConfig().baseUrl;
  }

  static async transcribe(audio: Blob, language: SupportedLanguage): Promise<TranscriptionResult> {
    const config = this.getConfig();
    if (!config.baseUrl) throw new Error('Configure an AI API endpoint first. Manual entry remains available.');
    const profile = LANGUAGE_PROFILES[language];
    const headers: Record<string, string> = {};
    if (config.token) headers.Authorization = `Bearer ${config.token}`;

    let response: Response;
    if (config.provider === 'huggingface') {
      const endpoint = joinUrl(config.baseUrl || DEFAULT_HF_BASE_URL, config.asrModel);
      response = await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': audio.type || 'audio/webm' }, body: audio });
    } else {
      const form = new FormData();
      form.append('audio', audio, 'crashscribe-recording.webm');
      form.append('language', profile.asrCode || language);
      form.append('model', config.asrModel);
      response = await fetch(joinUrl(config.baseUrl, '/transcribe'), { method: 'POST', headers, body: form });
    }

    const payload = await parseResponse(response);
    const text = responseText(payload);
    let translation: string | undefined;
    if (profile.translationCode) translation = await this.translate(text, language);
    return { text, language, translation };
  }

  static async translate(text: string, language: SupportedLanguage): Promise<string> {
    const config = this.getConfig();
    const profile = LANGUAGE_PROFILES[language];
    if (!profile.translationCode) return text;
    if (!config.translationUrl && config.provider === 'huggingface') {
      throw new Error('Configure VITE_AI_TRANSLATION_URL for regional-language translation.');
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;

    const endpoint = config.provider === 'huggingface'
      ? joinUrl(config.translationUrl || '', config.translationModel || '')
      : joinUrl(config.translationUrl || config.baseUrl, '/translate');
    const body = config.provider === 'huggingface'
      ? { inputs: text, parameters: { src_lang: profile.translationCode, tgt_lang: 'eng_Latn' } }
      : { text, sourceLanguage: profile.translationCode, targetLanguage: 'eng_Latn', model: config.translationModel };
    const payload = await parseResponse(await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }));
    return responseText(payload);
  }

  static createManualDraft(text: string, language: SupportedLanguage = 'en'): AITranscriptDraft {
    return {
      originalText: text,
      originalLanguage: language,
      source: 'manual',
      officerApproved: false,
      createdAt: new Date().toISOString(),
    };
  }

  static createApprovedDraft(result: TranscriptionResult, provider: BrowserAIProvider): AITranscriptDraft {
    return {
      originalText: result.text,
      originalLanguage: result.language,
      englishTranslation: result.translation,
      source: provider === 'local' ? 'local-api' : 'hosted-api',
      officerApproved: true,
      createdAt: new Date().toISOString(),
    };
  }
}
