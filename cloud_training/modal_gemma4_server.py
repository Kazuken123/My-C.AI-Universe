"""
Modal Serverless Deployment for Fine-Tuned Gemma 4 Thinking (Kana Arima)
Deploys an OpenAI-compatible /v1/chat/completions endpoint on Modal.

Features:
- Single-container architecture: FastAPI runs directly inside the GPU container via @modal.asgi_app()
- Scale-to-zero billing: scaledown_window = 300s (5 mins idle -> 0 cost)
- GPU: A10G (24GB VRAM for 4-bit 31B/12B Gemma 4)
- Persistent HuggingFace cache volume: skips redownloading weights on container reuse
- OpenAI-compatible /v1/chat/completions and /health endpoints
- Bearer token authentication (MODAL_API_KEY)
- Streaming and non-streaming responses
"""

import os
import time
from typing import List, Optional, Dict, Any
import modal

# ---------------------------------------------------------------------------
# 1. Modal App, Image & Volumes
# ---------------------------------------------------------------------------
app = modal.App("cai-gemma4-serverless")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "torch>=2.4.0,<2.15.0",
        "torchvision>=0.19.0",
        "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git",
        "fastapi>=0.110.0",
        "pydantic>=2.0.0",
        "huggingface_hub>=0.23.0",
        "peft>=0.12.0",
        "bitsandbytes>=0.43.0",
        "accelerate>=0.33.0",
        "transformers>=4.44.0"
    )
)

hf_cache_volume = modal.Volume.from_name("hf-cache-vol", create_if_missing=True)

# SamplingParams configuration for engine inference
class SamplingParams:
    """Configures generation and sampling parameters."""
    def __init__(self, temperature: float = 1.0, top_p: float = 0.95, top_k: int = 64, max_tokens: int = 1024):
        self.temperature = temperature
        self.top_p = top_p
        self.top_k = top_k
        self.max_tokens = max_tokens

BASE_MODEL = os.getenv("BASE_MODEL", "unsloth/gemma-4-31B-it-unsloth-bnb-4bit")
MODEL_ID = os.getenv("HF_MODEL_ID", "Kazuken123/kana-arima-gemma4-thinking")
API_KEY_SECRET = modal.Secret.from_name("gemma4-api-secret") if "gemma4-api-secret" in os.environ else modal.Secret.from_dict({"MODAL_API_KEY": os.getenv("MODAL_API_KEY", "universe-secret-key-2026")})

# ---------------------------------------------------------------------------
# 2. Serverless Inference Class with Co-located FastAPI Web Server
# ---------------------------------------------------------------------------
@app.cls(
    image=image,
    gpu="A10G", # 24GB VRAM fits 4-bit 31B/12B easily
    scaledown_window=300, # 5 minutes idle shutdown for zero idle billing
    secrets=[API_KEY_SECRET],
    volumes={"/root/.cache/huggingface": hf_cache_volume}
)
class Gemma4Inference:
    @modal.enter()
    def load_model(self):
        from unsloth import FastLanguageModel
        from peft import PeftModel
        from transformers import AutoTokenizer

        print(f"[MODAL] Initializing base model {BASE_MODEL} in 4-bit...")
        self.model, self.tokenizer = FastLanguageModel.from_pretrained(
            model_name=BASE_MODEL,
            max_seq_length=2048,
            load_in_4bit=True,
        )
        self.text_tokenizer = getattr(self.tokenizer, "tokenizer", self.tokenizer)

        print(f"[MODAL] Loading Kana Arima LoRA adapter: {MODEL_ID}...")
        try:
            self.model = PeftModel.from_pretrained(self.model, MODEL_ID)
        except Exception as e:
            print(f"[MODAL WARN] PeftModel failed ({e}), trying FastLanguageModel fallback...")
            self.model, _ = FastLanguageModel.from_pretrained(
                model_name=MODEL_ID,
                max_seq_length=2048,
                load_in_4bit=True,
            )

        # Check if adapter repo has its own tokenizer or custom chat template
        try:
            adapter_tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
            if adapter_tokenizer.chat_template:
                self.tokenizer.chat_template = adapter_tokenizer.chat_template
                if hasattr(self, "text_tokenizer"):
                    self.text_tokenizer.chat_template = adapter_tokenizer.chat_template
                print("[MODAL] Applied custom chat template from adapter.")
        except Exception:
            pass

        FastLanguageModel.for_inference(self.model)
        print("[MODAL] Gemma 4 Thinking Engine online and ready.")

    def _sanitize_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Normalizes message list to satisfy Gemma 4's strict alternating roles requirement:
        1. System message at index 0 (if present).
        2. Dialogue turns strictly alternate: user -> assistant -> user -> assistant...
        3. Adjacent same-role turns are merged with double newlines.
        4. If first dialogue turn is assistant, prepends a natural user interaction starter.
        """
        system_msgs = []
        dialogue = []
        for m in messages:
            role = m.get("role", "user")
            content = (m.get("content") or "").strip()
            if not content:
                continue
            if role == "system":
                system_msgs.append(content)
            else:
                dialogue.append({"role": role, "content": content})

        merged = []
        for m in dialogue:
            if merged and merged[-1]["role"] == m["role"]:
                merged[-1]["content"] += "\n\n" + m["content"]
            else:
                merged.append({"role": m["role"], "content": m["content"]})

        if merged and merged[0]["role"] == "assistant":
            merged.insert(0, {"role": "user", "content": "*Enters scene*"})

        if not merged:
            merged.append({"role": "user", "content": "Hello"})

        final = []
        if system_msgs:
            final.append({"role": "system", "content": "\n\n".join(system_msgs)})
        final.extend(merged)
        return final

    def _generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 1.0,
        top_p: float = 0.95,
        top_k: int = 64,
        max_tokens: int = 1024,
    ) -> str:
        import torch
        torch.cuda.empty_cache()
        tok = getattr(self, "text_tokenizer", getattr(self.tokenizer, "tokenizer", self.tokenizer))
        clean_messages = self._sanitize_messages(messages)
        prompt = tok.apply_chat_template(
            clean_messages,
            tokenize=False,
            add_generation_prompt=True
        )

        inputs = tok(prompt, return_tensors="pt").to("cuda")
        do_sample = temperature > 0.0
        pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id

        gen_kwargs = {
            "max_new_tokens": max_tokens,
            "do_sample": do_sample,
            "use_cache": True,
            "pad_token_id": pad_id,
        }
        if do_sample:
            gen_kwargs["temperature"] = temperature
            gen_kwargs["top_p"] = top_p
            if top_k > 0:
                gen_kwargs["top_k"] = top_k

        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                **gen_kwargs
            )

        input_len = inputs["input_ids"].shape[1]
        generated_tokens = outputs[0][input_len:]
        result = tok.decode(generated_tokens, skip_special_tokens=True).strip()
        torch.cuda.empty_cache()
        return result

    def _generate_stream_generator(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 1.0,
        top_p: float = 0.95,
        top_k: int = 64,
        max_tokens: int = 1024,
    ):
        import torch
        from transformers import TextIteratorStreamer
        from threading import Thread

        torch.cuda.empty_cache()
        tok = getattr(self, "text_tokenizer", getattr(self.tokenizer, "tokenizer", self.tokenizer))
        clean_messages = self._sanitize_messages(messages)
        prompt = tok.apply_chat_template(
            clean_messages,
            tokenize=False,
            add_generation_prompt=True
        )

        inputs = tok(prompt, return_tensors="pt").to("cuda")
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
        do_sample = temperature > 0.0
        pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id

        gen_kwargs = {
            "streamer": streamer,
            "max_new_tokens": max_tokens,
            "do_sample": do_sample,
            "use_cache": True,
            "pad_token_id": pad_id,
        }
        if do_sample:
            gen_kwargs["temperature"] = temperature
            gen_kwargs["top_p"] = top_p
            if top_k > 0:
                gen_kwargs["top_k"] = top_k

        generation_kwargs = dict(
            **inputs,
            **gen_kwargs
        )

        def run_generation():
            with torch.inference_mode():
                self.model.generate(**generation_kwargs)
            torch.cuda.empty_cache()

        thread = Thread(target=run_generation)
        thread.start()

        for new_text in streamer:
            yield new_text
        torch.cuda.empty_cache()

    @modal.asgi_app()
    def fastapi_app(self):
        import json
        from fastapi import FastAPI, HTTPException, Header, Depends
        from fastapi.responses import StreamingResponse, JSONResponse
        from pydantic import BaseModel

        web_app = FastAPI(title="Gemma 4 Thinking OpenAI-Compatible API")

        def verify_auth(authorization: Optional[str] = Header(None)):
            expected_key = os.environ.get("MODAL_API_KEY", "universe-secret-key-2026")
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
            token = authorization.split("Bearer ")[1].strip()
            if token != expected_key:
                raise HTTPException(status_code=403, detail="Invalid API key")
            return token

        class ChatMessage(BaseModel):
            role: str
            content: str

        class ChatCompletionRequest(BaseModel):
            messages: List[ChatMessage]
            model: Optional[str] = "gemma-4-thinking"
            temperature: Optional[float] = 1.0
            top_p: Optional[float] = 0.95
            top_k: Optional[int] = 64
            max_tokens: Optional[int] = 1024
            stream: Optional[bool] = False

        @web_app.get("/health")
        def health():
            return {
                "status": "ok",
                "service": "gemma4-serverless",
                "scale_to_zero": True,
                "model": MODEL_ID,
                "base_model": BASE_MODEL
            }

        @web_app.get("/v1/models")
        def list_models(token: str = Depends(verify_auth)):
            return {
                "object": "list",
                "data": [
                    {
                        "id": "gemma-4-thinking",
                        "object": "model",
                        "created": int(time.time()),
                        "owned_by": "my-c.ai-universe"
                    }
                ]
            }

        @web_app.post("/v1/chat/completions")
        def chat_completions(req: ChatCompletionRequest, token: str = Depends(verify_auth)):
            raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]

            # Streaming response
            if req.stream:
                def stream_chunks():
                    completion_id = f"chatcmpl-modal-{int(time.time() * 1000)}"
                    for token_chunk in self._generate_stream_generator(
                        messages=raw_messages,
                        temperature=req.temperature,
                        top_p=req.top_p,
                        top_k=req.top_k,
                        max_tokens=req.max_tokens,
                    ):
                        chunk_payload = {
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": req.model,
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": token_chunk},
                                    "finish_reason": None
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_payload)}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(stream_chunks(), media_type="text/event-stream")

            # Non-streaming response
            reply_text = self._generate_text(
                messages=raw_messages,
                temperature=req.temperature,
                top_p=req.top_p,
                top_k=req.top_k,
                max_tokens=req.max_tokens,
            )

            return {
                "id": f"chatcmpl-modal-{int(time.time() * 1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": req.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": reply_text
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": len(reply_text.split()),
                    "total_tokens": len(reply_text.split())
                }
            }

        return web_app
