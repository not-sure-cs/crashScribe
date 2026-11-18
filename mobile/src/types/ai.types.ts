export type SupportedLanguage = 'as' | 'bn' | 'brx' | 'en';

export type TranslationLanguage = 'asm_Beng' | 'ben_Beng' | 'brx_Deva';

export interface LanguageProfile {
  id: SupportedLanguage;
  label: string;
  asrModel: 'indicconformer' | 'whisper-tiny-en';
  asrCode?: string;
  translationCode?: TranslationLanguage;
}

export const LANGUAGE_PROFILES: Record<SupportedLanguage, LanguageProfile> = {
  as: {
    id: 'as',
    label: 'Assamese',
    asrModel: 'indicconformer',
    asrCode: 'as',
    translationCode: 'asm_Beng',
  },
  bn: {
    id: 'bn',
    label: 'Bengali',
    asrModel: 'indicconformer',
    asrCode: 'bn',
    translationCode: 'ben_Beng',
  },
  brx: {
    id: 'brx',
    label: 'Bodo',
    asrModel: 'indicconformer',
    asrCode: 'brx',
    translationCode: 'brx_Deva',
  },
  en: {
    id: 'en',
    label: 'English',
    asrModel: 'whisper-tiny-en',
  },
};

export type AIModelStatus = 'UNAVAILABLE' | 'AVAILABLE_VIA_API' | 'DOWNLOADING' | 'VERIFYING' | 'LOADING' | 'READY' | 'FAILED';

export interface AIModelInfo {
  id: string;
  name: string;
  purpose: string;
  languages: SupportedLanguage[];
  artifactSource?: string;
  sha256?: string;
  status: AIModelStatus;
  progress?: number;
  failureReason?: string;
}

export interface AITranscriptDraft {
  originalText: string;
  originalLanguage: SupportedLanguage;
  englishTranslation?: string;
  source: 'native-offline' | 'local-api' | 'hosted-api' | 'manual';
  officerApproved: boolean;
  createdAt: string;
}
