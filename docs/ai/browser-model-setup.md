# CrashScribe website AI setup

The website now records audio in the browser, sends it to a configured inference endpoint, displays the original transcript and optional English translation separately, and inserts text only after officer approval.

The browser does **not** run the 600M/200M Python models directly. Use either the local adapter or a hosted endpoint.

## Option A: local model server

This is the recommended option for sensitive police narration because audio stays on the local machine. It requires Python, FFmpeg, enough RAM/storage for the selected models, and a machine that can run PyTorch.

From the repository root:

```bash
cd ai-local-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p models
```

Install the Hugging Face CLI if needed, then download the exact artifacts into the directory names expected by the adapter:

```bash
pip install -U huggingface_hub
hf auth login  # only if a selected model requires authentication
hf download ai4bharat/indic-conformer-600m-multilingual \
  --local-dir models/ai4bharat--indic-conformer-600m-multilingual
hf download openai/whisper-tiny.en \
  --local-dir models/openai--whisper-tiny.en
hf download ai4bharat/indictrans2-indic-en-dist-200M \
  --local-dir models/ai4bharat--indictrans2-indic-en-dist-200M
```

The model directories are optional individually. English ASR needs Whisper; Assamese, Bengali, and Bodo ASR need IndicConformer; regional-language English translation needs IndicTrans2. Do not copy partial directories and do not call a model READY until the server can load it successfully.

Start the adapter:

```bash
uvicorn server:app --host 127.0.0.1 --port 8000
```

The website must be served from an origin allowed by the adapter. For local Vite development, the default CORS origins are `http://localhost:3000` and `http://127.0.0.1:3000`. If the website is served elsewhere:

```bash
CRASHSCRIBE_ALLOWED_ORIGIN=https://your-site.example \
  uvicorn server:app --host 127.0.0.1 --port 8000
```

Copy `mobile/.env.example` to `mobile/.env.local` and use:

```dotenv
VITE_AI_PROVIDER=local
VITE_AI_BASE_URL=http://127.0.0.1:8000
VITE_AI_TRANSLATION_URL=http://127.0.0.1:8000
```

Or enter the same values in Settings → Local AI Model Status. The local adapter exposes:

- `GET /health`
- `POST /transcribe` with multipart fields `audio`, `language`, and `model`
- `POST /translate` with JSON fields `text`, `sourceLanguage`, and `targetLanguage`

## Option B: Hugging Face hosted inference

Hugging Face documents an ASR REST API that accepts audio and returns a `text` response. Create a token with the required Inference Providers permission and configure the website as follows:

```dotenv
VITE_AI_PROVIDER=huggingface
VITE_AI_BASE_URL=https://router.huggingface.co/hf-inference/models
VITE_AI_TOKEN=hf_replace_with_your_token
VITE_AI_ASR_MODEL=ai4bharat/indic-conformer-600m-multilingual
VITE_AI_TRANSLATION_URL=https://router.huggingface.co/hf-inference/models/ai4bharat/indictrans2-indic-en-dist-200M
VITE_AI_TRANSLATION_MODEL=ai4bharat/indictrans2-indic-en-dist-200M
```

You may instead use any provider-compatible ASR model that supports the target language, but update the model ID explicitly and test the returned response. The website does not invent a fallback transcript.

A browser-exposed token is visible to users and can be abused. For production, put the Hugging Face token behind your own server-side proxy and set `VITE_AI_BASE_URL` to that proxy. Hosted inference also has provider availability, rate limits, and possible charges; “free” availability is not guaranteed and should not be treated as an offline or private mode.

## Using the feature

1. Start the local adapter or configure the hosted provider.
2. Start the website with `npm run start:mobile`.
3. Open a narrative or location field and select the microphone icon.
4. Choose Assamese, Bengali, Bodo, or English.
5. Start and stop recording.
6. Review the original transcript and, for regional languages, the separate English translation.
7. Tap **Approve transcript for this field** to insert the original transcript. The translation is retained in the AI narrative metadata and is not silently substituted.

If the endpoint is unavailable, microphone permission is denied, a model cannot load, or inference fails, the field remains editable manually.

## Important limits

- Browser microphone capture requires HTTPS in deployed environments, or localhost during development.
- Audio is uploaded to the configured endpoint in hosted mode. Do not use hosted mode for sensitive audio unless the provider and deployment policy permit it.
- This integration does not claim device-only inference. Use Option A for local-network inference and the future native client for verified on-device inference.
- Actual model quality, memory use, latency, and language accuracy must be benchmarked on the target hardware before operational deployment.

## References

[1]: https://huggingface.co/docs/inference-providers/en/tasks/automatic-speech-recognition "Hugging Face automatic speech recognition API"
[2]: https://huggingface.co/docs/inference-providers/en/index "Hugging Face Inference Providers overview"
[3]: https://github.com/AI4Bharat/IndicConformerASR "AI4Bharat IndicConformerASR official repository"
[4]: https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M "AI4Bharat IndicTrans2 Indic-English distilled model card"
