"""
Direct Preference Optimization (DPO) Training Script for Kana Arima
Designed to run on Google Colab (Free T4/L4 GPU) or any CUDA-enabled environment using Unsloth.
"""

import os
import json
import torch
from datasets import Dataset
from unsloth import FastLanguageModel, PatchDPOTrainer
from trl import DPOTrainer
from transformers import TrainingArguments

# 1. Hyperparameters & Configuration
# Both unsloth/gemma-2-2b-it-bnb-4bit and unsloth/Llama-3.2-3B-Instruct load without token
DEFAULT_MODEL = "unsloth/gemma-2-2b-it-bnb-4bit"
BASE_MODEL = os.environ.get("BASE_MODEL", DEFAULT_MODEL)
MAX_SEQ_LENGTH = 2048
LORA_RANK = 16
OUTPUT_DIR = "kana_dpo_model_output"
TRAIN_DATA_PATH = "kana_dpo_train.jsonl"
EVAL_DATA_PATH = "kana_dpo_eval.jsonl"
HF_TOKEN = os.environ.get("HF_TOKEN", None)
HF_REPO_NAME = os.environ.get("HF_REPO_NAME", None)

def load_jsonl_dataset(path):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return Dataset.from_list(rows)

def main():
    print("=" * 60)
    print("Starting Kana Arima DPO Fine-Tuning Pipeline (Unsloth + TRL)")
    print(f"Base Model: {BASE_MODEL}")
    print("=" * 60)

    # 2. Load Datasets
    if not os.path.exists(TRAIN_DATA_PATH):
        raise FileNotFoundError(f"Missing {TRAIN_DATA_PATH}. Please upload the dataset.")
    
    train_dataset = load_jsonl_dataset(TRAIN_DATA_PATH)
    eval_dataset = load_jsonl_dataset(EVAL_DATA_PATH) if os.path.exists(EVAL_DATA_PATH) else None
    print(f"Loaded {len(train_dataset)} training pairs, {len(eval_dataset) if eval_dataset else 0} eval pairs.")

    # 3. Load Model with 4-bit Quantization (fits comfortably in 6GB-15GB VRAM)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,
        load_in_4bit=True,
    )

    # 4. Attach LoRA Adapters
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_RANK,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=LORA_RANK,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
    )

    # 5. Patch DPO Trainer for Memory & Speed Optimization
    PatchDPOTrainer()
    tokenizer.pad_token = tokenizer.eos_token

    # 6. Training Arguments
    training_args = TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_ratio=0.1,
        num_train_epochs=3,
        learning_rate=5e-6,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=5,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        output_dir=OUTPUT_DIR,
        save_strategy="epoch",
        evaluation_strategy="epoch" if eval_dataset else "no",
        report_to="none"
    )

    # 7. Execute DPO Training
    dpo_trainer = DPOTrainer(
        model=model,
        ref_model=None,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        max_length=MAX_SEQ_LENGTH,
        max_prompt_length=MAX_SEQ_LENGTH // 2,
        args=training_args,
    )

    print("\nTraining starts now...")
    trainer_stats = dpo_trainer.train()
    print("Training Complete!")
    print(trainer_stats)

    # 8. Save Lightweight LoRA Adapter (~40MB)
    adapter_path = os.path.join(OUTPUT_DIR, "lora_adapter")
    print(f"\nSaving lightweight LoRA adapter to {adapter_path}...")
    model.save_pretrained(adapter_path)
    tokenizer.save_pretrained(adapter_path)
    print("LoRA adapter saved successfully.")

    # 9. Push to Hugging Face Hub if configured
    if HF_TOKEN and HF_REPO_NAME:
        print(f"\nPushing LoRA adapter to Hugging Face: {HF_REPO_NAME}...")
        try:
            model.push_to_hub(HF_REPO_NAME, token=HF_TOKEN)
            tokenizer.push_to_hub(HF_REPO_NAME, token=HF_TOKEN)
            print("Successfully pushed to Hugging Face Hub!")
        except Exception as e:
            print(f"Failed to push to Hugging Face: {e}")

    # 10. Save Merged 16-bit Model
    print(f"\nSaving merged model to {OUTPUT_DIR}/merged_16bit...")
    try:
        model.save_pretrained_merged(f"{OUTPUT_DIR}/merged_16bit", tokenizer, save_method="merged_16bit")
    except Exception as e:
        print(f"Merged model save skipped: {e}")
    
    # 11. Optionally export GGUF Q4_K_M
    print("\nOptionally exporting GGUF Q4_K_M...")
    try:
        model.save_pretrained_gguf(f"{OUTPUT_DIR}/gguf", tokenizer, quantization_method="q4_k_m")
        print(f"GGUF exported successfully to {OUTPUT_DIR}/gguf!")
    except Exception as e:
        print(f"GGUF export skipped or requires llama.cpp: {e}")

if __name__ == "__main__":
    main()
