# CrashScribe offline AI integration: technical feasibility report

**Date:** 2026-11-18  
**Repository:** `Biki-dev/crashScribe`  
**Status:** Phase 0 complete; native inference not yet implemented

## Finding

The requested offline workflow is feasible, but it cannot be implemented inside the current browser client by adding JavaScript packages. The repository’s current `mobile` application is React + Vite and runs in a browser. Native Android runtimes, microphone capture permissions, private model storage, and device-level inference must therefore live in a React Native Android app or a separate native Android client. The existing browser demo should remain a manual-entry and review demo until that migration exists.

The safest migration is a **separate native Android client sharing TypeScript domain contracts and pure business logic** with the existing web demo. This avoids forcing native ONNX/Whisper dependencies into Vite while preserving eDAR types, local report rules, sync behavior, and the current web demo.

## Repository findings

- `mobile/src/services/mockVoice.service.ts` returns hardcoded field-specific sentences. It is not speech recognition.
- `mobile/src/services/mockModel.service.ts` stores only localStorage flags and exposes no model artifact, checksum, download, or load verification.
- `VoiceInputButton.tsx` waits 1.6 seconds and inserts mock text. It must never be used as evidence of inference.
- `SettingsTabScreen.tsx` animates model progress and marks models ready without downloading or loading an artifact.
- `AccidentReportData` has only one `accident_description` string and no explicit AI provenance or separate translation field.
- Draft and manual sync behavior is localStorage-backed in the web demo. The backend remains a separate microservice mesh and should not receive recorded audio.
- `GEMINI.md` and the architecture context explicitly describe the present AI controls as placeholders and state that native inference must not be added to the browser prototype.

## Model and runtime feasibility

AI4Bharat’s official IndicConformer repository documents Assamese (`as`), Bengali (`bn`), and Bodo (`brx`) support and points to an official NeMo implementation. The current public model card identifies the multilingual checkpoint as a 600M-parameter hybrid CTC/RNNT Conformer model. This is large enough that Android memory, cold-start time, thermal behavior, and an actual conversion path must be measured on target devices; a browser-compatible or Android-compatible artifact must not be assumed.

AI4Bharat’s official IndicTrans2 Indic→English distilled checkpoint is `ai4bharat/indictrans2-indic-en-dist-200M`. The requested source codes are `asm_Beng`, `ben_Beng`, and `brx_Deva`, with target `eng_Latn`. The reference usage relies on Transformers plus `IndicTransToolkit`; the mobile project still needs a validated converted artifact, tokenizer packaging, decoder implementation, and numerical/text parity tests before it can be shipped.

The official whisper.cpp project supports Android, CPU inference, integer quantization, and a C-style API. Its documented workflow uses converted ggml model files and 16 kHz mono PCM input. That makes Whisper Tiny.en a plausible native Android path, but it still requires an Android JNI/NDK binding, audio resampling, lifecycle-safe model loading, and device benchmarks.

No model URLs, artifact sizes, quantization formats, or Android compatibility are recorded here because they must be pinned only after selecting and validating a specific release/checkpoint. The UI now treats all model artifacts as unavailable until those facts are supplied and verified.

## Proposed native architecture

1. **Shared domain package:** Keep language IDs, transcript/translation records, approval state, eDAR mapping, and sync payload rules in TypeScript modules that are usable by web and React Native.
2. **Native Android shell:** Add a separate React Native Android application. Use Android Keystore-backed private storage for artifacts and local report data. Do not import ONNX Runtime or Whisper React Native modules into the Vite app.
3. **Native inference bridge:** Expose a narrow interface such as `record()`, `transcribe()`, `translateToEnglish()`, `loadModel()`, and `releaseModel()`. The bridge reports `UNAVAILABLE`, `DOWNLOADING`, `VERIFYING`, `LOADING`, `READY`, or `FAILED`; it never reports `READY` from metadata alone.
4. **Audio path:** Capture microphone audio only on-device, convert to 16 kHz mono PCM, and keep the recording in private temporary storage. Do not upload audio to the backend.
5. **Review path:** Show the original transcript and English translation as separate values. Require explicit officer approval before copying either value into a narrative field. AI output must never update structured eDAR fields automatically.
6. **Fallback path:** If permission, model, runtime, memory, or inference fails, leave the current field unchanged and keep normal text input available.
7. **Model manager:** Download only from a pinned, reviewed source; stream to a temporary file; support pause/resume; verify SHA-256; atomically rename into private storage; load a small smoke-test input; and only then persist `READY`.

## Phased implementation plan

### Phase 1 — native Android foundation and audio capture

Create the native app shell, shared contracts, permission flow, 16 kHz mono recording, cancellation, and private temporary audio cleanup. Acceptance evidence is a physical-device recording/playback test with no network access.

### Phase 2 — Assamese IndicConformer prototype

Run the official NeMo reference implementation first. Select one pinned checkpoint and one target Android runtime. Build a native prototype and compare transcripts against the reference on a fixed Assamese test set.

### Phase 3 — conversion and runtime validation

Validate model conversion, decoder/tokenizer behavior, numerical tolerance, memory, latency, and failure behavior on actual Android devices. Do not mark a model compatible from a successful file download alone.

### Phase 4 — IndicTrans2 Assamese→English

Package the tokenizer and converted translation artifact. Preserve Assamese and English values separately and require officer review/approval.

### Phase 5 — Whisper Tiny.en

Integrate whisper.cpp or another validated native binding for English only. Verify 16 kHz preprocessing and release the model after processing.

### Phase 6 — Bengali and Bodo

Repeat ASR and translation validation for `bn`/`ben_Beng` and `brx`/`brx_Deva`. Keep per-language readiness independent.

### Phase 7 — model lifecycle

Implement verified downloads, pause/resume, deletion, updates, disk quotas, checksums, atomic installation, and load smoke tests.

### Phase 8 — eDAR integration

Add AI provenance and approval records to local drafts. Do not replace original-language text or update structured fields automatically.

### Phase 9 — device tests and benchmarks

Measure load time, first-token/total latency, peak RAM, disk footprint, battery impact, crash rate, and transcription/translation quality on the supported device matrix. Completion requires physical-device evidence; the web demo cannot satisfy this definition of done.

## Current implementation slice

The web implementation now establishes a real, configurable API path while preserving the safe boundary:

- hardcoded transcript generation is removed from the voice UI path;
- simulated model progress and false `READY`/downloaded states are removed;
- the browser demo records audio with `MediaRecorder` and calls a configured local or hosted inference endpoint;
- language mappings and separate transcript/translation/approval contracts are added;
- model metadata distinguishes `AVAILABLE_VIA_API` from a locally loaded native `READY` artifact;
- manual entry remains available whenever the endpoint, permission, or model fails.

## References

[1]: https://github.com/AI4Bharat/IndicConformerASR "AI4Bharat IndicConformerASR official repository"
[2]: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual "AI4Bharat IndicConformer model card"
[3]: https://github.com/ai4bharat/IndicTrans2 "AI4Bharat IndicTrans2 official repository"
[4]: https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M "AI4Bharat IndicTrans2 Indic-English distilled model card"
[5]: https://github.com/ggml-org/whisper.cpp "whisper.cpp official repository"
