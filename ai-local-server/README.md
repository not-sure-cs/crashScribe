# CrashScribe Local AI Inference Server

A dedicated FastAPI server providing local inference for police narration and translation. All audio remains on the local device for confidentiality.

## Models Supported

- **OpenAI Whisper Tiny.en**: English Automatic Speech Recognition (ASR).
- **AI4Bharat IndicConformer Multilingual (600M)**: Assamese (`as`), Bengali (`bn`), and Bodo (`brx`) ASR.
- **AI4Bharat IndicTrans2 Indic→English Distilled (200M)**: Regional to English translation (`asm_Beng`, `ben_Beng`, `brx_Deva` → `eng_Latn`).

---

## Setup Instructions

### 1. Virtual Environment & Dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -U huggingface_hub
```

### 2. Download Model Weights

```bash
mkdir -p models

# Whisper Tiny.en (~150 MB)
hf download openai/whisper-tiny.en \
  --local-dir models/openai--whisper-tiny.en

# IndicConformer 600M (~2.4 GB)
hf download ai4bharat/indic-conformer-600m-multilingual \
  --local-dir models/ai4bharat--indic-conformer-600m-multilingual

# IndicTrans2 200M (~1 GB)
hf download ai4bharat/indictrans2-indic-en-dist-200M \
  --local-dir models/ai4bharat--indictrans2-indic-en-dist-200M
```

*Note: IndicConformer local code is automatically repaired on first load by `prepare_indicconformer_local_code()`. No manual modifications to `model_onnx.py` are needed.*

### 3. Run the Server

```bash
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8000
```

---

## API Endpoints

- `GET /health` — Server health status and model presence indicators.
- `POST /transcribe` — Multipart form upload with `audio` (WebM/WAV), `language` (`en`, `as`, `bn`, `brx`), and optional `model`.
- `POST /translate` — JSON payload:
  ```json
  {
    "text": "দুর্ঘটনা সংঘটিত হৈছে",
    "sourceLanguage": "asm_Beng",
    "targetLanguage": "eng_Latn"
  }
  ```
