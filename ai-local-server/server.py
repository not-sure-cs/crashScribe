"""Local CrashScribe model adapter.

This server performs real inference only. It never returns placeholder text.
Install the model artifacts into MODEL_DIRS before starting it.
"""

import logging
import os
import shutil
import subprocess
import tempfile
import traceback
from pathlib import Path
from typing import Optional

import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import (
    AutoModel,
    AutoModelForSeq2SeqLM,
    AutoProcessor,
    AutoTokenizer,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

logger = logging.getLogger("crashscribe.ai")
logging.basicConfig(level=logging.INFO)


def resolve_model_root() -> Path:
    env_dir = os.getenv("CRASHSCRIBE_MODEL_DIR")
    if env_dir:
        return Path(env_dir).resolve()
    # Check relative ./models
    local_rel = Path("./models")
    if local_rel.exists() and local_rel.is_dir():
        return local_rel.resolve()
    # Check directory alongside server.py
    server_dir_models = Path(__file__).resolve().parent / "models"
    if server_dir_models.exists() and server_dir_models.is_dir():
        return server_dir_models.resolve()
    return local_rel.resolve()


MODEL_ROOT = resolve_model_root()
INDIC_CONFORMER = os.getenv("INDIC_CONFORMER_MODEL", "ai4bharat/indic-conformer-600m-multilingual")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "openai/whisper-tiny.en")
INDICTRANS_MODEL = os.getenv("INDICTRANS_MODEL", "ai4bharat/indictrans2-indic-en-dist-200M")
DEVICE = os.getenv("CRASHSCRIBE_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")

app = FastAPI(title="CrashScribe Local AI Adapter")

# CORS configuration supporting localhost:3000, 127.0.0.1:3000, and configurable origins
allowed_origins_env = os.getenv(
    "CRASHSCRIBE_ALLOWED_ORIGIN",
    "http://localhost:3000,http://127.0.0.1:3000",
)
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
if "http://localhost:3000" not in allowed_origins:
    allowed_origins.append("http://localhost:3000")
if "http://127.0.0.1:3000" not in allowed_origins:
    allowed_origins.append("http://127.0.0.1:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

_asr_model = None
_asr_processor = None
_whisper_model = None
_whisper_processor = None
_translation_model = None
_translation_tokenizer = None
_translation_processor = None


class TranslationRequest(BaseModel):
    text: str
    sourceLanguage: str
    targetLanguage: str = "eng_Latn"


def model_path_or_id(model_id: str) -> str:
    """Use a pasted local directory when present, otherwise a Hub ID for first download."""
    p = Path(model_id)
    if p.exists() and p.is_dir():
        return str(p.resolve())
    candidate = MODEL_ROOT / model_id.replace("/", "--")
    if candidate.exists() and candidate.is_dir():
        return str(candidate.resolve())
    return model_id


def clean_dynamic_module_cache() -> None:
    """Remove stale cached Transformers dynamic modules for ai4bharat models."""
    cache_root = Path.home() / ".cache" / "huggingface" / "modules" / "transformers_modules"
    if cache_root.exists():
        for cached in cache_root.glob("ai4bharat*"):
            if cached.is_dir():
                shutil.rmtree(cached, ignore_errors=True)


def prepare_indicconformer_local_code(source: str) -> None:
    """Repair the upstream custom loader when IndicConformer was saved locally.

    Some released model_onnx.py files call snapshot_download() even when the
    argument is a local directory. That makes huggingface_hub validate the
    filesystem path as a repo ID, which fails on paths with '--' or '..'.
    This idempotent repair ensures offline local loading without asking users
    to manually edit files inside their model directory.
    """
    # 1. Do nothing when source is a remote Hugging Face model ID.
    # 2. Detect when source is an existing local directory.
    model_dir = Path(source)
    if not model_dir.is_dir():
        return

    # 3. Find <local-model-directory>/model_onnx.py
    loader = model_dir / "model_onnx.py"
    if not loader.exists():
        return

    backup = model_dir / "model_onnx.py.crashscribe-backup"

    # 4. Read the file.
    try:
        text = loader.read_text(encoding="utf-8")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to read loader at {loader}: {exc}\n"
            f"Model directory: {model_dir}"
        ) from exc

    def _is_valid_syntax(code_str: str) -> bool:
        try:
            compile(code_str, str(loader), "exec")
            return True
        except Exception:
            return False

    is_correctly_patched = (
        "if os.path.isdir(pretrained_model_name_or_path):" in text
        and "loc = pretrained_model_name_or_path" in text
        and "loc = snapshot_download(" in text
    )

    # Case 2: correctly patched file
    if is_correctly_patched and _is_valid_syntax(text):
        # Ensure stale Transformers dynamic module cache is cleared so it uses this patched file
        clean_dynamic_module_cache()
        return

    # Case 3: incorrectly patched or syntactically invalid file
    # If the file is broken, attempt to recover from backup if a valid backup exists
    if not _is_valid_syntax(text) and backup.exists():
        try:
            backup_text = backup.read_text(encoding="utf-8")
            if _is_valid_syntax(backup_text):
                text = backup_text
        except Exception:
            pass

    # 11. Create a backup before modifying the downloaded model file
    if not backup.exists():
        try:
            backup.write_text(text, encoding="utf-8")
        except Exception as exc:
            raise RuntimeError(
                f"Failed to create backup at {backup}: {exc}\n"
                f"Model directory: {model_dir}"
            ) from exc

    # 5. Detect the broken upstream code:
    #    loc = snapshot_download(repo_id=pretrained_model_name_or_path, token=token)
    lines = text.splitlines()
    target_idx = None
    for i, line in enumerate(lines):
        if "loc = snapshot_download" in line:
            target_idx = i
            break

    if target_idx is None:
        if _is_valid_syntax(text) and "os.path.isdir(pretrained_model_name_or_path)" in text:
            clean_dynamic_module_cache()
            return
        raise RuntimeError(
            f"Cannot safely repair {loader}: 'loc = snapshot_download' not found and file is invalid.\n"
            f"Please restore {loader} from upstream or re-download the model.\n"
            f"Model path: {model_dir}"
        )

    # 6. Replace it with syntactically valid Python
    target_line = lines[target_idx]
    indent = target_line[: len(target_line) - len(target_line.lstrip())]

    end_idx = target_idx
    while end_idx < len(lines) and ")" not in lines[end_idx] and "return " not in lines[end_idx]:
        end_idx += 1
    if end_idx >= len(lines) or "return " in lines[end_idx]:
        end_idx = target_idx

    replacement = [
        f"{indent}if os.path.isdir(pretrained_model_name_or_path):",
        f"{indent}    loc = pretrained_model_name_or_path",
        f"{indent}else:",
        f"{indent}    loc = snapshot_download(",
        f"{indent}        repo_id=pretrained_model_name_or_path,",
        f"{indent}        token=token,",
        f"{indent}    )",
    ]

    has_os_import = any("import os" in l for l in lines[:30])
    if not has_os_import:
        lines.insert(0, "import os")
        target_idx += 1
        end_idx += 1

    lines[target_idx : end_idx + 1] = replacement
    new_text = "\n".join(lines) + "\n"

    # 8. Validate the resulting file with compile(text, str(loader), "exec")
    try:
        compile(new_text, str(loader), "exec")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to safely repair {loader}: Syntax validation failed after applying patch.\n"
            f"Error: {exc}\n"
            f"Model path: {model_dir}"
        ) from exc

    # Write patched file
    try:
        loader.write_text(new_text, encoding="utf-8")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to write patched code to {loader}: {exc}\n"
            f"Model path: {model_dir}"
        ) from exc

    # 9. If a cached Transformers dynamic module exists for this model, remove the stale cache
    clean_dynamic_module_cache()


def convert_to_wav(audio_path: str) -> str:
    wav_path = f"{audio_path}.wav"
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        err_msg = proc.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"FFmpeg audio conversion failed: {err_msg}")
    return wav_path


def get_indic_model():
    global _asr_model, _asr_processor
    if _asr_model is None:
        source = model_path_or_id(INDIC_CONFORMER)
        prepare_indicconformer_local_code(source)
        logger.info("Loading IndicConformer model from %s on device %s...", source, DEVICE)
        _asr_model = AutoModel.from_pretrained(source, trust_remote_code=True)
        try:
            _asr_model = _asr_model.to(DEVICE)
        except Exception:
            pass
        _asr_model.eval()
        try:
            _asr_processor = AutoProcessor.from_pretrained(source, trust_remote_code=True)
        except Exception:
            _asr_processor = None
    return _asr_model, _asr_processor


def get_whisper_model():
    global _whisper_model, _whisper_processor
    if _whisper_model is None:
        source = model_path_or_id(WHISPER_MODEL)
        logger.info("Loading Whisper model from %s on device %s...", source, DEVICE)
        _whisper_processor = WhisperProcessor.from_pretrained(source)
        _whisper_model = WhisperForConditionalGeneration.from_pretrained(source).to(DEVICE).eval()
    return _whisper_model, _whisper_processor


def get_translation_model():
    global _translation_model, _translation_tokenizer, _translation_processor
    if _translation_model is None:
        source = model_path_or_id(INDICTRANS_MODEL)
        logger.info("Loading IndicTrans2 model from %s on device %s...", source, DEVICE)
        _translation_tokenizer = AutoTokenizer.from_pretrained(source, trust_remote_code=True)
        _translation_model = AutoModelForSeq2SeqLM.from_pretrained(source, trust_remote_code=True).to(DEVICE).eval()
        from IndicTransToolkit.processor import IndicProcessor
        _translation_processor = IndicProcessor(inference=True)
    return _translation_model, _translation_tokenizer, _translation_processor


def load_audio(path: str) -> torch.Tensor:
    """Load a 16kHz mono WAV file reliably using Python's standard wave module or torchaudio."""
    try:
        import wave
        import numpy as np

        with wave.open(path, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            rate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())

        if sampwidth == 2:
            dtype = np.int16
            scale = 32768.0
        elif sampwidth == 4:
            dtype = np.int32
            scale = 2147483648.0
        else:
            raise ValueError(f"Unsupported sample width: {sampwidth}")

        audio_data = np.frombuffer(frames, dtype=dtype).astype(np.float32) / scale
        if n_channels > 1:
            audio_data = audio_data.reshape(-1, n_channels).mean(axis=1)
        waveform = torch.from_numpy(audio_data).unsqueeze(0)
        if rate != 16000:
            waveform = torchaudio.transforms.Resample(rate, 16000)(waveform)
        return waveform
    except Exception as err:
        logger.warning("Standard wave reader failed (%s), falling back to torchaudio", err)
        waveform, sample_rate = torchaudio.load(path)
        waveform = waveform.mean(dim=0, keepdim=True)
        if sample_rate != 16000:
            waveform = torchaudio.transforms.Resample(sample_rate, 16000)(waveform)
        return waveform


@app.get("/health")
def health():
    return {
        "status": "UP",
        "device": DEVICE,
        "model_dir": str(MODEL_ROOT),
        "whisper_present": Path(model_path_or_id(WHISPER_MODEL)).exists(),
        "indic_conformer_present": Path(model_path_or_id(INDIC_CONFORMER)).exists(),
        "indictrans_present": Path(model_path_or_id(INDICTRANS_MODEL)).exists(),
    }


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("en"), model: str = Form("")):
    if language not in {"as", "bn", "brx", "en"}:
        raise HTTPException(status_code=400, detail="language must be as, bn, brx, or en")
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / (audio.filename or "recording.webm")
        source.write_bytes(await audio.read())
        try:
            wav_path = convert_to_wav(str(source))
            waveform = load_audio(wav_path)
            with torch.inference_mode():
                if language == "en":
                    whisper, processor = get_whisper_model()
                    inputs = processor(waveform.squeeze(0).numpy(), sampling_rate=16000, return_tensors="pt")
                    predicted = whisper.generate(inputs.input_features.to(DEVICE))
                    text = processor.batch_decode(predicted, skip_special_tokens=True)[0].strip()
                else:
                    indic, _processor = get_indic_model()
                    text = indic(waveform, language, "ctc").strip()
        except Exception as exc:
            logger.exception("ASR inference failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"ASR inference failed: {type(exc).__name__}: {exc}",
            ) from exc
    if not text:
        raise HTTPException(status_code=422, detail="Model returned no transcript")
    return {"text": text, "language": language}


@app.post("/translate")
def translate(request: TranslationRequest):
    if request.sourceLanguage not in {"asm_Beng", "ben_Beng", "brx_Deva"} or request.targetLanguage != "eng_Latn":
        raise HTTPException(status_code=400, detail="Unsupported IndicTrans2 language mapping")
    try:
        model, tokenizer, processor = get_translation_model()
        batch = processor.preprocess_batch([request.text], src_lang=request.sourceLanguage, tgt_lang=request.targetLanguage)
        inputs = tokenizer(batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True).to(DEVICE)
        with torch.inference_mode():
            generated = model.generate(**inputs, use_cache=False, min_length=0, max_length=256, num_beams=5)
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True, clean_up_tokenization_spaces=True)
        text = processor.postprocess_batch(decoded, lang=request.targetLanguage)[0].strip()
    except Exception as exc:
        logger.exception("Translation inference failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Translation inference failed: {type(exc).__name__}: {exc}",
        ) from exc
    if not text:
        raise HTTPException(status_code=422, detail="Model returned no translation")
    return {"text": text, "sourceLanguage": request.sourceLanguage, "targetLanguage": request.targetLanguage}
