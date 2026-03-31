"""
Query commercial and open-source LLMs with Hannikainen et al. (2022) stimuli.

Usage:
    python query.py --condition-set baseline
    python query.py --condition-set purpose-fewshot --providers huggingface
    python query.py --condition-set textualist-fewshot --providers openai anthropic
    python query.py --providers huggingface --hf-models meta-llama/Llama-3.2-1B-Instruct
"""

import argparse
import csv
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

RESULTS_BASE = Path("results")
STIMS_PATH = Path("stims.json")

CONDITION_SETS = ["baseline", "purpose-fewshot", "textualist-fewshot"]

SYSTEM_INSTRUCTION = (
    "Answer the following question with only YES or NO. "
    "Do not provide any explanation or additional text — just YES or NO."
)

DECISION_TEMPLATE = "Make a decision: did {name} violate the rule (YES) or not (NO)?"


def build_prompt(stimulus: dict) -> str:
    """Build the user-facing prompt for a single stimulus."""
    decision = DECISION_TEMPLATE.format(name=stimulus["name"])
    return f"{stimulus['header']}\n\n{stimulus['continuation']}\n\n{decision}"


def parse_yes_no(text: str) -> tuple[str, bool]:
    """Extract YES or NO from model output.

    Returns (response, malformed) where malformed is True if neither YES nor NO
    was found and the raw text is returned as-is.
    """
    text = text.strip()
    match = re.search(r"\b(YES|NO)\b", text, re.IGNORECASE)
    if match:
        return match.group(1).upper(), False
    return text, True


def results_dir(condition_set: str) -> Path:
    d = RESULTS_BASE / condition_set
    d.mkdir(parents=True, exist_ok=True)
    return d


def results_exist(system_name: str, condition_set: str) -> bool:
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", system_name)
    return (results_dir(condition_set) / f"{safe_name}.csv").exists()


def save_results(system_name: str, rows: list[dict], condition_set: str) -> None:
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", system_name)
    path = results_dir(condition_set) / f"{safe_name}.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["system_name", "scenario", "condition", "response", "malformed"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows -> {path}")


def load_stims() -> list[dict]:
    with open(STIMS_PATH, encoding="utf-8") as f:
        stims = json.load(f)
    seen = set()
    unique = []
    for s in stims:
        key = (s["scenario"], s["condition"])
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique


def build_fewshot_messages(stims: list[dict], condition_set: str) -> list[dict]:
    """Build few-shot example messages for purpose-fewshot or textualist-fewshot.

    Uses the vehicles overinclusion and underinclusion examples.
    purpose-fewshot:   overinclusion=NO,  underinclusion=YES  (purposivist)
    textualist-fewshot: overinclusion=YES, underinclusion=NO  (textualist)
    """
    over = next(s for s in stims if s["scenario"] == "vehicles" and s["condition"] == "overinclusion")
    under = next(s for s in stims if s["scenario"] == "vehicles" and s["condition"] == "underinclusion")

    if condition_set == "purpose-fewshot":
        examples = [(over, "NO"), (under, "YES")]
    else:  # textualist-fewshot
        examples = [(over, "YES"), (under, "NO")]

    messages = []
    for stim, answer in examples:
        messages.append({"role": "user", "content": build_prompt(stim)})
        messages.append({"role": "assistant", "content": answer})
    return messages


def filter_stims(stims: list[dict], condition_set: str) -> list[dict]:
    """For fewshot conditions, exclude vehicles items (used as examples)."""
    if condition_set == "baseline":
        return stims
    return [s for s in stims if s["scenario"] != "vehicles"]


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

def query_openai(models: list[str], stims: list[dict], condition_set: str) -> None:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    fewshot = build_fewshot_messages(stims, condition_set) if condition_set != "baseline" else []
    query_stims = filter_stims(stims, condition_set)

    for model in models:
        if results_exist(model, condition_set):
            print(f"  Skipping {model}: results already exist.")
            continue
        print(f"Querying OpenAI model: {model}")
        rows = []
        for stim in query_stims:
            prompt = build_prompt(stim)
            messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}] + fewshot + [{"role": "user", "content": prompt}]
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=10,
                    temperature=0,
                )
                raw = response.choices[0].message.content or ""
            except Exception as e:
                print(f"    Error on scenario={stim['scenario']}, condition={stim['condition']}: {e}")
                raw = "ERROR"
            rows.append({
                "system_name": model,
                "scenario": stim["scenario"],
                "condition": stim["condition"],
                "response": (parsed := parse_yes_no(raw))[0],
                "malformed": parsed[1],
            })
        save_results(model, rows, condition_set)


def query_anthropic(models: list[str], stims: list[dict], condition_set: str) -> None:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    fewshot = build_fewshot_messages(stims, condition_set) if condition_set != "baseline" else []
    query_stims = filter_stims(stims, condition_set)

    for model in models:
        if results_exist(model, condition_set):
            print(f"  Skipping {model}: results already exist.")
            continue
        print(f"Querying Anthropic model: {model}")
        rows = []
        for stim in query_stims:
            prompt = build_prompt(stim)
            messages = fewshot + [{"role": "user", "content": prompt}]
            try:
                message = client.messages.create(
                    model=model,
                    max_tokens=10,
                    system=SYSTEM_INSTRUCTION,
                    messages=messages,
                )
                raw = message.content[0].text if message.content else ""
            except Exception as e:
                print(f"    Error on scenario={stim['scenario']}, condition={stim['condition']}: {e}")
                raw = "ERROR"
            rows.append({
                "system_name": model,
                "scenario": stim["scenario"],
                "condition": stim["condition"],
                "response": (parsed := parse_yes_no(raw))[0],
                "malformed": parsed[1],
            })
        save_results(model, rows, condition_set)


def query_google(models: list[str], stims: list[dict], condition_set: str) -> None:
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    fewshot = build_fewshot_messages(stims, condition_set) if condition_set != "baseline" else []
    query_stims = filter_stims(stims, condition_set)

    # Convert fewshot to Google's history format (role: "user"/"model")
    history = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
        for m in fewshot
    ]

    for model_name in models:
        if results_exist(model_name, condition_set):
            print(f"  Skipping {model_name}: results already exist.")
            continue
        print(f"Querying Google model: {model_name}")
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=SYSTEM_INSTRUCTION,
        )
        rows = []
        for stim in query_stims:
            prompt = build_prompt(stim)
            try:
                if history:
                    chat = model.start_chat(history=history)
                    response = chat.send_message(
                        prompt,
                        generation_config={"max_output_tokens": 10, "temperature": 0},
                    )
                    raw = response.text or ""
                else:
                    response = model.generate_content(
                        prompt,
                        generation_config={"max_output_tokens": 10, "temperature": 0},
                    )
                    raw = response.text or ""
            except Exception as e:
                print(f"    Error on scenario={stim['scenario']}, condition={stim['condition']}: {e}")
                raw = "ERROR"
            rows.append({
                "system_name": model_name,
                "scenario": stim["scenario"],
                "condition": stim["condition"],
                "response": (parsed := parse_yes_no(raw))[0],
                "malformed": parsed[1],
            })
        save_results(model_name, rows, condition_set)


def query_huggingface(models: list[str], stims: list[dict], condition_set: str) -> None:
    from huggingface_hub import InferenceClient

    token = os.environ.get("HUGGINGFACE_API_KEY")
    client = InferenceClient(token=token)
    fewshot = build_fewshot_messages(stims, condition_set) if condition_set != "baseline" else []
    query_stims = filter_stims(stims, condition_set)

    for model_name in models:
        if results_exist(model_name, condition_set):
            print(f"  Skipping {model_name}: results already exist.")
            continue
        print(f"Querying HuggingFace model: {model_name}")
        rows = []
        skip = False
        for stim in query_stims:
            if skip:
                break
            prompt = build_prompt(stim)
            messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}] + fewshot + [{"role": "user", "content": prompt}]
            try:
                response = client.chat_completion(
                    model=model_name,
                    messages=messages,
                    max_tokens=10,
                    temperature=0,
                )
                raw = response.choices[0].message.content or ""
            except Exception as e:
                msg = str(e)
                if "model_not_supported" in msg or "not supported by any provider" in msg:
                    print(f"  Skipping {model_name}: not supported by any enabled provider.")
                    skip = True
                    continue
                print(f"    Error on scenario={stim['scenario']}, condition={stim['condition']}: {e}")
                raw = "ERROR"
                time.sleep(1)
            rows.append({
                "system_name": model_name,
                "scenario": stim["scenario"],
                "condition": stim["condition"],
                "response": (parsed := parse_yes_no(raw))[0],
                "malformed": parsed[1],
            })
        if rows:
            save_results(model_name, rows, condition_set)


# ---------------------------------------------------------------------------
# Default model lists (edit as needed)
# ---------------------------------------------------------------------------

DEFAULT_MODELS = {
    "openai": [
        "gpt-4.1-2025-04-14",
        "gpt-4o-2024-11-20",
        "gpt-4o-mini-2024-07-18"],
    "anthropic": ["claude-haiku-4-5-20251001",
                  "claude-sonnet-4-5-20250929"],
    "google": ["gemini-2.0-flash",
               "gemini-1.5-pro"],
    "huggingface": [
        # Llama (Meta)
        "meta-llama/Llama-3.2-1B-Instruct",
        "meta-llama/Llama-3.1-8B-Instruct",
        "meta-llama/Llama-3.1-70B-Instruct",
        # Qwen
        "Qwen/Qwen2.5-1.5B-Instruct",
        "Qwen/Qwen2.5-7B-Instruct",
        "Qwen/Qwen2.5-32B-Instruct",
        "Qwen/Qwen3-Next-80B-A3B-Instruct",
        # Gemma (Google)
        "google/gemma-2-2b-it",
        "google/gemma-2-9b-it",
        # Mistral
        "mistralai/Mistral-7B-Instruct-v0.2",
        # AllenAI
        "allenai/Olmo-3.1-32B-Instruct",
    ],
}

QUERY_FNS = {
    "openai": query_openai,
    "anthropic": query_anthropic,
    "google": query_google,
    "huggingface": query_huggingface,
}


def main():
    parser = argparse.ArgumentParser(description="Query LLMs with Hannikainen et al. stimuli.")
    parser.add_argument(
        "--condition-set",
        choices=CONDITION_SETS,
        default="baseline",
        help="Which prompting condition to run (default: baseline).",
    )
    parser.add_argument(
        "--providers",
        nargs="+",
        choices=list(DEFAULT_MODELS.keys()),
        default=list(DEFAULT_MODELS.keys()),
        help="Which providers to query (default: all).",
    )
    parser.add_argument(
        "--openai-models", nargs="+", default=None, metavar="MODEL",
        help="Override default OpenAI models.",
    )
    parser.add_argument(
        "--anthropic-models", nargs="+", default=None, metavar="MODEL",
        help="Override default Anthropic models.",
    )
    parser.add_argument(
        "--google-models", nargs="+", default=None, metavar="MODEL",
        help="Override default Google models.",
    )
    parser.add_argument(
        "--hf-models", nargs="+", default=None, metavar="MODEL",
        help="Override default HuggingFace models.",
    )
    args = parser.parse_args()

    stims = load_stims()
    print(f"Loaded {len(stims)} stimuli.")
    print(f"Condition set: {args.condition_set}\n")

    model_overrides = {
        "openai": args.openai_models,
        "anthropic": args.anthropic_models,
        "google": args.google_models,
        "huggingface": args.hf_models,
    }

    for provider in args.providers:
        models = model_overrides[provider] or DEFAULT_MODELS[provider]
        QUERY_FNS[provider](models, stims, args.condition_set)
        print()


if __name__ == "__main__":
    main()
