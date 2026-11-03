"""
Modal Serverless Deployment for Fine-Tuned Gemma 4 Thinking
Deploys an OpenAI-compatible /v1/chat/completions endpoint on Modal.

Features:
- Scale-to-zero billing (scaledown_window = 300s / 5 mins idle -> 0 cost)
- GPU: modal.gpu.T4() or modal.gpu.A10G() (fits Modal free tier)
- OpenAI-compatible /v1/chat/completions and /health endpoints
- Bearer token authentication (MODAL_API_KEY secret)
- High-efficiency vLLM engine with streaming support
"""

import os
from typing import List, Optional, Dict, Any
import modal

# ---------------------------------------------------------------------------
# 1. Modal App & Container Image
# ---------------------------------------------------------------------------
app = modal.App("cai-gemma4-serverless")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.6.0",
        "fastapi>=0.110.0",
        "pydantic>=2.0.0",
        "huggingface_hub>=0.23.0"
    )
)

MODEL_ID = os.getenv("HF_MODEL_ID", "your-username/kana-arima-gemma4-thinking")
API_KEY_SECRET = modal.Secret.from_name("gemma4-api-secret") if "gemma4-api-secret" in os.environ else modal.Secret.from_dict({"MODAL_API_KEY": os.getenv("MODAL_API_KEY", "universe-secret-key-2026")})

# ---------------------------------------------------------------------------
# 2. Serverless Inference Class
# ---------------------------------------------------------------------------
@app.cls(
    image=image,
    gpu=modal.gpu.T4(), # Or modal.gpu.A10G()
    scaledown_window=300, # 5 minutes idle shutdown for zero idle billing
    secrets=[API_KEY_SECRET],
    container_idle_timeout=300,
    keep_warm=0 # Strictly scale to zero when not roleplaying
)
class Gemma4Inference:
    @modal.enter()
    def load_model(self):
        from vllm import LLM
        print(f"[MODAL] Initializing vLLM engine for model: {MODEL_ID}...")
        self.llm = LLM(
            model=MODEL_ID,
            tensor_parallel_size=1,
            max_model_len=2048,
            gpu_memory_utilization=0.90,
            trust_remote_code=True,
            dtype="half"
        )
        self.tokenizer = self.llm.get_tokenizer()
        print("[MODAL] vLLM Engine online and ready.")

    @modal.method()
    def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 1.0,
        top_p: float = 0.95,
        top_k: int = 64,
        max_tokens: int = 1024,
    ) -> str:
        from vllm import SamplingParams

        sampling_params = SamplingParams(
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

        prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        outputs = self.llm.generate([prompt], sampling_params)
        return outputs[0].outputs[0].text

# ---------------------------------------------------------------------------
# 3. FastAPI Web Endpoint (/v1/chat/completions)
# ---------------------------------------------------------------------------
@app.function(image=image, secrets=[API_KEY_SECRET])
@modal.asgi_app()
def fastapi_app():
    import time
    import json
    from fastapi import FastAPI, HTTPException, Header, Depends
    from fastapi.responses import StreamingResponse, JSONResponse
    from pydantic import BaseModel, Field

    web_app = FastAPI(title="Gemma 4 Thinking OpenAI-Compatible API")
    inference = Gemma4Inference()

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
        return {"status": "ok", "service": "gemma4-serverless", "scale_to_zero": True}

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
    async def chat_completions(req: ChatCompletionRequest, token: str = Depends(verify_auth)):
        raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]

        if req.stream:
            # Simple streaming generator emitting standard SSE OpenAI chunks
            def stream_generator():
                completion_id = f"chatcmpl-modal-{int(time.time() * 1000)}"
                full_text = inference.generate.remote(
                    messages=raw_messages,
                    temperature=req.temperature,
                    top_p=req.top_p,
                    top_k=req.top_k,
                    max_tokens=req.max_tokens,
                )

                # Emit in words/tokens
                words = full_text.split(" ")
                for i, word in enumerate(words):
                    chunk = word + (" " if i < len(words) - 1 else "")
                    payload = {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": req.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": chunk},
                                "finish_reason": None if i < len(words) - 1 else "stop"
                            }
                        ]
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(stream_generator(), media_type="text/event-stream")

        # Non-streaming response
        reply_text = inference.generate.remote(
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
