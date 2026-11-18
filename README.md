# CrashScribe

> **Offline-First Traffic Accident Reporting & AI Narration System for Assam Police**  
> Compliant with official MoRTH Electronic Detailed Accident Report (eDAR) standards.

---

## Architecture Overview

CrashScribe comprises:
- **Mobile Web App (`mobile/`)**: Offline-first eDAR form with dynamic vehicle/casualty tracking, local SQLite/LocalStorage draft persistence, zero-auto-sync privacy protection, and voice input narration.
- **AI Inference Server (`ai-local-server/`)**: FastAPI adapter providing real local inference using OpenAI Whisper Tiny.en (English ASR), AI4Bharat IndicConformer (Assamese, Bengali, Bodo ASR), and IndicTrans2 (regional-to-English translation).
- **Go API Gateway (`backend/api-gateway/`)**: Reverse proxy with JWT authentication, role-based header injection, and rate limiting.
- **Domain Microservices (`backend/services/`)**: Independent TypeScript/Node services for Authentication (`:5001`), Report Ingestion & Sync (`:5002`), Evidence Management (`:5003`), and PostGIS Spatial Analytics (`:5004`).

---

## Prerequisites

Ensure the following tools are installed on your workstation:

- **Node.js**: v20+ & `npm`
- **Python**: 3.10 – 3.14 (Python 3.12+ recommended) with `venv`
- **FFmpeg**: Required for audio format conversion (`ffmpeg -version`)
- **PostgreSQL**: Version 14+ (`pg_isready`, `postgres`)
- **Go**: 1.22+ *(optional, required only if modifying the Go API Gateway)*

---

## Step-by-Step Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/crashScribe.git
cd crashScribe
```

---

### 2. Install Project Dependencies & Build Assets

From the repository root:

```bash
# Install Node workspace dependencies
npm install

# Build the mobile web client
npm run build:mobile
```

---

### 3. Setup the Local AI Server (`ai-local-server`)

The AI server runs locally at `http://127.0.0.1:8000` to keep police narration audio private.

```bash
cd ai-local-server

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install AI dependencies
pip install -r requirements.txt
pip install -U huggingface_hub
```

---

### 4. Download AI Model Artifacts

Download the three offline models into `ai-local-server/models/`:

```bash
# Make sure you are inside ai-local-server/ with .venv active
mkdir -p models

# 1. English ASR: Whisper Tiny.en (~150 MB)
hf download openai/whisper-tiny.en \
  --local-dir models/openai--whisper-tiny.en

# 2. Regional ASR: AI4Bharat IndicConformer Multilingual (~2.4 GB)
hf download ai4bharat/indic-conformer-600m-multilingual \
  --local-dir models/ai4bharat--indic-conformer-600m-multilingual

# 3. Translation: AI4Bharat IndicTrans2 Indic→English Distilled 200M (~1 GB)
hf download ai4bharat/indictrans2-indic-en-dist-200M \
  --local-dir models/ai4bharat--indictrans2-indic-en-dist-200M
```

> **Note on Automatic Repair:** Upstream IndicConformer code calls `snapshot_download` on local paths. The server automatically detects and patches `model_onnx.py` on startup, creates `.crashscribe-backup`, and clears stale dynamic module caches. No manual code editing is needed.

---

### 5. Launch the Platform (2 Terminals)

#### Terminal 1 — Start the Local AI Server:
```bash
cd ai-local-server
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8000
```
*Verify health check in a separate terminal: `curl http://127.0.0.1:8000/health` (should return `"status": "UP"`).*

#### Terminal 2 — Start the Full CrashScribe Stack:
```bash
cd /path/to/crashScribe
./start.sh
```
*`start.sh` automatically starts local PostgreSQL on port 5434, the 4 domain microservices (:5001, :5002, :5003, :5004), the Go API Gateway (:8080), and the mobile client (:3000).*

---

## How to Interact & Test

### 1. Open the Web Application
Open **`http://localhost:3000`** in your browser.

### 2. Verify AI Provider Settings
1. Navigate to the **Settings** tab (bottom navigation).
2. Under **9.2 Local AI Model Status**, verify the configuration:
   - **Provider:** `Local model server`
   - **Base URL:** `http://127.0.0.1:8000`
   - **API Token:** *(leave blank)*
   - **ASR Model:** `ai4bharat/indic-conformer-600m-multilingual`
   - **Translation URL:** `http://127.0.0.1:8000`
3. Tap **Save provider**. The status badges will confirm active availability.

### 3. Voice Input & Speech-to-Text
1. Navigate to the **Home** tab (Accident Form).
2. Expand **Section 6: Accident Description** (or any text/landmark field).
3. Tap the **Microphone** icon beside the field.
4. Select your spoken language:
   - **English**: Uses Whisper Tiny.en.
   - **Assamese / Bengali / Bodo**: Uses IndicConformer for speech recognition, followed by IndicTrans2 for English translation.
5. Tap **Start recording**, speak into your microphone, and tap **Stop and transcribe**.
6. Review the original transcription and English translation:
   - The original transcript and English translation remain strictly separate.
   - **Zero Unapproved AI Insertion:** Text is never inserted into the field until you explicitly tap **Approve transcript for this field**.
   - **Manual Fallback:** If inference fails or the microphone is muted, manual typing is always available.

### 4. Test Offline-First Save & Explicit Sync
1. Complete mandatory fields in the form (District, Police Station, Date, Time, 1+ Vehicle, 1+ Casualty).
2. Tap **Review Report** &rarr; **Confirm and Save on Device**.
3. Observe network activity: **zero HTTP calls are made during local save**. The record is stored securely on the device.
4. Go to **Settings** &rarr; **9.3 Report Synchronization Centre**.
5. Your report appears under **Pending Cloud Sync**.
6. When ready, tap **Sync** (or **Sync All**) to push the report to the central database.

---

## Service Port Map

| Component | Port | Description |
|---|---|---|
| **Mobile Client** | `3000` | Offline-first React + Vite Progressive Web App |
| **Local AI Server** | `8000` | FastAPI Whisper & IndicConformer/IndicTrans2 Adapter |
| **Go API Gateway** | `8080` | High-performance reverse proxy & JWT validation |
| **Auth Service** | `5001` | Officer badge authentication & RBAC |
| **Report Ingest Service** | `5002` | eDAR relational ingestion & outbox events |
| **Evidence Service** | `5003` | Media upload verification & metadata extraction |
| **Analytics Service** | `5004` | PostGIS accident clustering & blackspot queries |
| **PostgreSQL** | `5434` | Multi-database relational storage |
