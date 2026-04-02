"""
Study: effect of system-prompt regime on HuggingFace LLM rule-violation judgments.

Queries HuggingFace instruction-tuned models on overinclusion and underinclusion
stimuli under two system-prompt regimes

Measurement: relative log probability of YES vs NO (log p(YES) - log p(NO))
at the first generated token, via top_logprobs. Positive values indicate the
model favors a transgression judgment; negative values favor no transgression.

Results are saved under results/system2-prompting/{standard,system2}/.

Usage:
    python query_system2.py
    python query_system2.py --hf-models meta-llama/Llama-3.2-1B-Instruct
    python query_system2.py --viz-only
    python query_system2.py --viz-only --output figures/system2.png
"""

import argparse
import csv
import json
import math
import os
import re
import time
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from dotenv import load_dotenv

load_dotenv()

RESULTS_BASE = Path("results") / "system2-prompting"
STIMS_PATH = Path("stims_unique.json")

YES_NO_INSTRUCTION = (
    "Answer the following question with only YES or NO. "
    "Do not provide any explanation or additional text — just YES or NO."
)

SYSTEM_PROMPTS = {
    "standard": (
        "You are a helpful assistant.\n\n"
        + YES_NO_INSTRUCTION
    ),
    "system2": (
        "You are a helpful assistant. \n\n"
        + YES_NO_INSTRUCTION
        + "Base your response on *only* the part of the user query that is relevant and useful."
        "Do not consider any irrelevant information in the query.\n\n"
    ),
}

DECISION_TEMPLATE = "Make a decision: did {name} violate the rule (YES) or not (NO)?"

HF_MODELS = [
    # Llama (Meta)
    "meta-llama/Llama-3.2-1B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "meta-llama/Llama-3.1-70B-Instruct"
]

TARGET_CONDITIONS = ["underinclusion", "overinclusion"]

# Number of top logprob candidates to request; must be high enough to capture
# YES/NO tokens even when they are not the argmax.
TOP_LOGPROBS = 20


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_prompt(stimulus: dict) -> str:
    decision = DECISION_TEMPLATE.format(name=stimulus["name"])
    return f"{stimulus['header']}\n\n{stimulus['continuation']}\n\n{decision}"


def _is_yes(token: str) -> bool:
    return token.strip().upper() == "YES"


def _is_no(token: str) -> bool:
    return token.strip().upper() == "NO"


def extract_yes_no_logprobs(top_logprobs: list) -> tuple[float | None, float | None]:
    """Return (logprob_yes, logprob_no) from a top_logprobs list.

    Each element is expected to have .token and .logprob attributes (OpenAI-
    compatible format). If multiple YES or NO surface forms appear (e.g. "Yes"
    and "YES"), their probabilities are summed (log-sum-exp) before returning
    the combined log probability.
    """
    yes_lps, no_lps = [], []
    for entry in top_logprobs:
        tok = entry.token
        lp = entry.logprob
        if _is_yes(tok):
            yes_lps.append(lp)
        elif _is_no(tok):
            no_lps.append(lp)

    def logsumexp(lps: list[float]) -> float:
        m = max(lps)
        return m + math.log(sum(math.exp(lp - m) for lp in lps))

    logprob_yes = logsumexp(yes_lps) if yes_lps else None
    logprob_no = logsumexp(no_lps) if no_lps else None
    return logprob_yes, logprob_no


def regime_dir(regime: str) -> Path:
    d = RESULTS_BASE / regime
    d.mkdir(parents=True, exist_ok=True)
    return d


def results_exist(model_name: str, regime: str) -> bool:
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", model_name)
    return (regime_dir(regime) / f"{safe}.csv").exists()


def save_results(model_name: str, rows: list[dict], regime: str) -> None:
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", model_name)
    path = regime_dir(regime) / f"{safe}.csv"
    fieldnames = ["system_name", "scenario", "condition",
                  "logprob_yes", "logprob_no", "logprob_diff", "missing"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows -> {path}")


def load_stims() -> list[dict]:
    with open(STIMS_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def query_huggingface(models: list[str], stims: list[dict]) -> None:
    from huggingface_hub import InferenceClient

    token = os.environ.get("HUGGINGFACE_API_KEY")
    client = InferenceClient(token=token)

    target_stims = [s for s in stims if s["condition"] in TARGET_CONDITIONS]

    for regime, system_prompt in SYSTEM_PROMPTS.items():
        print(f"\n--- Regime: {regime} ---")
        for model_name in models:
            if results_exist(model_name, regime):
                print(f"  Skipping {model_name} [{regime}]: results already exist.")
                continue
            print(f"  Querying {model_name} [{regime}]")
            rows = []
            skip = False
            for stim in target_stims:
                if skip:
                    break
                prompt = build_prompt(stim)
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ]
                logprob_yes = logprob_no = logprob_diff = None
                missing = True
                try:
                    response = client.chat_completion(
                        model=model_name,
                        messages=messages,
                        max_tokens=1,
                        temperature=0,
                        logprobs=True,
                        top_logprobs=TOP_LOGPROBS,
                    )
                    token_logprobs = (
                        response.choices[0].logprobs.content[0].top_logprobs
                        if response.choices[0].logprobs
                        and response.choices[0].logprobs.content
                        else []
                    )
                    logprob_yes, logprob_no = extract_yes_no_logprobs(token_logprobs)
                    missing = logprob_yes is None or logprob_no is None
                    if not missing:
                        logprob_diff = logprob_yes - logprob_no
                except Exception as e:
                    msg = str(e)
                    if "model_not_supported" in msg or "not supported by any provider" in msg:
                        print(f"    Skipping {model_name}: not supported by any enabled provider.")
                        skip = True
                        continue
                    print(f"    Error on scenario={stim['scenario']}, condition={stim['condition']}: {e}")
                    time.sleep(1)
                rows.append({
                    "system_name": model_name,
                    "scenario": stim["scenario"],
                    "condition": stim["condition"],
                    "logprob_yes": logprob_yes,
                    "logprob_no": logprob_no,
                    "logprob_diff": logprob_diff,
                    "missing": missing,
                })
            if rows:
                save_results(model_name, rows, regime)


# ---------------------------------------------------------------------------
# Visualize
# ---------------------------------------------------------------------------

def load_results(model: str | None = None) -> pd.DataFrame:
    dfs = []
    for regime in SYSTEM_PROMPTS:
        subdir = RESULTS_BASE / regime
        if not subdir.exists():
            continue
        for csv_path in sorted(subdir.glob("*.csv")):
            df = pd.read_csv(csv_path)
            df["regime"] = regime
            dfs.append(df)
    if not dfs:
        raise FileNotFoundError(f"No results found under {RESULTS_BASE}/")
    data = pd.concat(dfs, ignore_index=True)
    data = data[data["condition"].isin(TARGET_CONDITIONS)].copy()
    data["logprob_diff"] = pd.to_numeric(data["logprob_diff"], errors="coerce")
    if model:
        data = data[data["system_name"] == model]
        if data.empty:
            raise ValueError(f"No results found for model '{model}'.")
    return data


def visualize(output_path: str | None = None, model: str | None = None) -> None:
    data = load_results(model)
    usable = data[~data["missing"].astype(bool)]
    n_missing = len(data) - len(usable)

    print(
        f"Loaded {len(data)} rows across "
        f"{data['system_name'].nunique()} model(s), "
        f"{data['regime'].nunique()} regime(s). "
        f"Missing YES/NO in top logprobs: {n_missing}."
    )

    summary = (
        usable.groupby(["system_name", "regime", "condition"])["logprob_diff"]
        .mean()
        .reset_index()
    )

    systems = sorted(summary["system_name"].unique())
    n_systems = len(systems)
    n_cols = min(4, n_systems)
    n_rows = (n_systems + n_cols - 1) // n_cols

    regime_order = ["standard", "system2"]
    regime_labels = {"standard": "Standard", "system2": "Ignore irrelevance"}
    active_regimes = [r for r in regime_order if r in summary["regime"].unique()]
    condition_order = [c for c in TARGET_CONDITIONS if c in summary["condition"].unique()]

    palette = sns.color_palette("muted", n_colors=len(active_regimes))

    sns.set_theme(style="whitegrid", palette="muted")
    fig, axes = plt.subplots(
        n_rows, n_cols,
        figsize=(4.5 * n_cols, 4 * n_rows),
        sharey=False,
        squeeze=False,
    )

    usable_labeled = usable.copy()
    usable_labeled["regime"] = usable_labeled["regime"].map(regime_labels)

    for idx, system in enumerate(systems):
        row, col = divmod(idx, n_cols)
        ax = axes[row][col]
        subset = usable_labeled[usable_labeled["system_name"] == system]
        label_order = [regime_labels[r] for r in active_regimes]

        sns.barplot(
            data=subset,
            x="condition",
            y="logprob_diff",
            hue="regime",
            order=condition_order,
            hue_order=label_order,
            palette=palette,
            errorbar=("ci", 95),
            ax=ax,
        )
        ax.set_title(system, fontsize=8, fontweight="bold")
        ax.set_xlabel("Condition")
        ax.set_ylabel("log p(YES) − log p(NO)" if col == 0 else "")
        ax.axhline(0, color="gray", linestyle="--", linewidth=0.8)

        if idx == 0:
            ax.legend(title="System prompt", fontsize=7, title_fontsize=7)
        else:
            legend = ax.get_legend()
            if legend:
                legend.remove()

        n_miss = data[
            (data["system_name"] == system) & data["missing"].astype(bool)
        ].shape[0]
        if n_miss > 0:
            ax.annotate(
                f"missing: {n_miss}",
                xy=(0.98, 0.02), xycoords="axes fraction",
                ha="right", va="bottom", fontsize=7, color="red",
            )

    for idx in range(n_systems, n_rows * n_cols):
        row, col = divmod(idx, n_cols)
        axes[row][col].set_visible(False)

    fig.suptitle(
        "Log-Odds of Transgression Judgment (YES vs NO) by System-Prompt Regime\n"
        "(Hannikainen et al. 2022 stimuli — HuggingFace models)",
        fontsize=12, y=1.01,
    )
    plt.tight_layout()

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=150, bbox_inches="tight")
        print(f"Saved figure to {out}")
    else:
        plt.show()


def visualize_by_scenario(output_dir: str | None = None, model: str | None = None) -> None:
    """One figure per model, with subplots faceted by scenario.

    Each subplot shows log p(YES) − log p(NO) for underinclusion and
    overinclusion side-by-side, with hue = regime (Standard / Ignore irrelevance).
    One data point per bar (no error bars).
    """
    data = load_results(model)
    usable = data[~data["missing"].astype(bool)].copy()

    regime_order = ["standard", "system2"]
    regime_labels = {"standard": "Standard", "system2": "Ignore irrelevance"}
    active_regimes = [r for r in regime_order if r in usable["regime"].unique()]
    condition_order = [c for c in TARGET_CONDITIONS if c in usable["condition"].unique()]

    usable["regime"] = usable["regime"].map(regime_labels)
    label_order = [regime_labels[r] for r in active_regimes]
    palette = sns.color_palette("muted", n_colors=len(active_regimes))

    systems = sorted(usable["system_name"].unique())
    scenarios = sorted(usable["scenario"].unique())
    n_scenarios = len(scenarios)
    n_cols = min(4, n_scenarios)
    n_rows = (n_scenarios + n_cols - 1) // n_cols

    out_dir = Path(output_dir) if output_dir else Path("figures") / "system2-by-scenario"

    sns.set_theme(style="whitegrid", palette="muted")

    for model in systems:
        model_data = usable[usable["system_name"] == model]
        fig, axes = plt.subplots(
            n_rows, n_cols,
            figsize=(4.5 * n_cols, 4 * n_rows),
            squeeze=False,
        )

        for idx, scenario in enumerate(scenarios):
            row, col = divmod(idx, n_cols)
            ax = axes[row][col]
            subset = model_data[model_data["scenario"] == scenario]

            sns.barplot(
                data=subset,
                x="condition",
                y="logprob_diff",
                hue="regime",
                order=condition_order,
                hue_order=label_order,
                palette=palette,
                ax=ax,
            )
            ax.set_title(scenario, fontsize=9, fontweight="bold")
            ax.set_xlabel("Condition")
            ax.set_ylabel("log p(YES) − log p(NO)" if col == 0 else "")
            ax.axhline(0, color="gray", linestyle="--", linewidth=0.8)

            if idx == 0:
                ax.legend(title="System prompt", fontsize=7, title_fontsize=7)
            else:
                legend = ax.get_legend()
                if legend:
                    legend.remove()

        for idx in range(n_scenarios, n_rows * n_cols):
            row, col = divmod(idx, n_cols)
            axes[row][col].set_visible(False)

        fig.suptitle(
            f"{model}\nLog-Odds of Transgression Judgment by Scenario & System-Prompt Regime",
            fontsize=11, y=1.01,
        )
        plt.tight_layout()

        safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", model)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{safe_name}.png"
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        print(f"Saved {out_path}")
        plt.close(fig)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def save_effect_table(output_path: str | None = None, model: str | None = None) -> None:
    """Save a CSV with one row per (model, scenario, condition).

    Columns:
      model, scenario, condition,
      lp_diff_standard   — log p(YES)−log p(NO) under standard prompt,
      lp_diff_system2    — log p(YES)−log p(NO) under ignore-irrelevance prompt,
      manipulation_change — lp_diff_system2 − lp_diff_standard,
      effect             — "increased" | "attenuated" | "no change"
    """
    data = load_results(model)
    usable = data[~data["missing"].astype(bool)]

    # Pivot regimes into columns, keeping (model, scenario, condition) as index
    pivot = usable.pivot_table(
        index=["system_name", "scenario", "condition"],
        columns="regime",
        values="logprob_diff",
        aggfunc="mean",
    ).reset_index()
    pivot.columns.name = None

    for col in ("standard", "system2"):
        if col not in pivot.columns:
            pivot[col] = float("nan")

    pivot = pivot.rename(columns={"standard": "lp_diff_standard", "system2": "lp_diff_system2"})
    pivot["manipulation_change"] = pivot["lp_diff_system2"] - pivot["lp_diff_standard"]

    def label_effect(delta):
        if pd.isna(delta):
            return "missing"
        if delta > 0:
            return "more textualist"
        if delta < 0:
            return "more purposivist"
        return "no change"

    pivot["effect"] = pivot["manipulation_change"].map(label_effect)

    table = pivot[
        ["system_name", "scenario", "condition",
         "lp_diff_standard", "lp_diff_system2", "manipulation_change", "effect"]
    ].rename(columns={"system_name": "model"})
    table = table.sort_values(["model", "condition", "scenario"]).reset_index(drop=True)

    out = Path(output_path) if output_path else RESULTS_BASE / "effect_table.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(out, index=False, float_format="%.4f")
    print(f"Saved effect table ({len(table)} rows) -> {out}")
    print(table.to_string(index=False))


def main():
    parser = argparse.ArgumentParser(
        description="Query HuggingFace models under Standard vs System-2 system prompts."
    )
    parser.add_argument(
        "--hf-models", nargs="+", default=None, metavar="MODEL",
        help="Override default HuggingFace model list.",
    )
    parser.add_argument(
        "--viz-only", action="store_true",
        help="Skip querying and only produce the visualization.",
    )
    parser.add_argument(
        "--output", default=None, metavar="PATH",
        help="Save figure to this path instead of displaying it.",
    )
    parser.add_argument(
        "--table-output", default=None, metavar="PATH",
        help="Path for effect table CSV (default: results/system2-prompting/effect_table.csv).",
    )
    parser.add_argument(
        "--scenario-output-dir", default=None, metavar="DIR",
        help="Directory for per-model scenario figures (default: figures/system2-by-scenario/).",
    )
    parser.add_argument(
        "--model", default=None, metavar="MODEL",
        help="Restrict visualization and table to a single model.",
    )
    args = parser.parse_args()

    if not args.viz_only:
        stims = load_stims()
        print(f"Loaded {len(stims)} stimuli from {STIMS_PATH}.")
        models = args.hf_models or HF_MODELS
        query_huggingface(models, stims)

    visualize(args.output, args.model)
    visualize_by_scenario(args.scenario_output_dir, args.model)
    save_effect_table(args.table_output, args.model)


if __name__ == "__main__":
    main()
