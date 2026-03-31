"""
Visualize LLM responses to Hannikainen et al. (2022) stimuli.

Reads all CSVs from the results/ folder and produces a seaborn facet grid:
  - x axis: condition (underinclusion / overinclusion)
  - y axis: proportion of transgression judgments (YES responses)
  - facet: LLM system (one panel per model)

Usage:
    python visualize.py
    python visualize.py --output figures/results.png
    python visualize.py --conditions underinclusion overinclusion violation compliance
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


RESULTS_DIR = Path("results")
DEFAULT_CONDITIONS = ["underinclusion", "overinclusion"]


def load_results(conditions: list[str]) -> pd.DataFrame:
    dfs = []
    for csv_path in sorted(RESULTS_DIR.glob("*.csv")):
        df = pd.read_csv(csv_path)
        dfs.append(df)
    if not dfs:
        raise FileNotFoundError(f"No CSV files found in {RESULTS_DIR}/")
    data = pd.concat(dfs, ignore_index=True)
    data = data[data["condition"].isin(conditions)].copy()
    data["parseable"] = ~data["malformed"].astype(bool)
    data["transgression"] = data["response"].str.upper() == "YES"
    return data


def report_malformed(data: pd.DataFrame) -> None:
    bad = data[data["malformed"].astype(bool)]
    if bad.empty:
        print("No malformed responses.")
        return
    print(f"\nMalformed responses (n={len(bad)}):")
    counts = (
        bad.groupby(["system_name", "condition", "response"])
        .size()
        .reset_index(name="count")
    )
    print(counts.to_string(index=False))
    print()


def plot(data: pd.DataFrame, output_path: str | None, conditions: list[str]) -> None:
    # Proportion of YES per system × condition, computed only over parseable rows
    parseable = data[data["parseable"]]
    summary = (
        parseable.groupby(["system_name", "condition"])["transgression"]
        .mean()
        .reset_index()
        .rename(columns={"transgression": "proportion_yes"})
    )

    # Malformed count per system × condition (for subtitle annotation)
    malformed_counts = (
        data[data["malformed"].astype(bool)]
        .groupby(["system_name", "condition"])
        .size()
        .reset_index(name="n_malformed")
    )

    systems = sorted(summary["system_name"].unique())
    n_systems = len(systems)

    # Determine a reasonable grid layout
    n_cols = min(4, n_systems)
    n_rows = (n_systems + n_cols - 1) // n_cols

    sns.set_theme(style="whitegrid", palette="muted")
    fig, axes = plt.subplots(
        n_rows, n_cols,
        figsize=(4 * n_cols, 4 * n_rows),
        sharey=True,
        squeeze=False,
    )

    condition_order = [c for c in conditions if c in summary["condition"].unique()]
    palette = sns.color_palette("muted", n_colors=len(condition_order))

    for idx, system in enumerate(systems):
        row, col = divmod(idx, n_cols)
        ax = axes[row][col]
        subset = summary[summary["system_name"] == system]
        sns.barplot(
            data=subset,
            x="condition",
            y="proportion_yes",
            order=condition_order,
            palette=palette,
            ax=ax,
        )
        ax.set_title(system, fontsize=9, fontweight="bold")
        ax.set_xlabel("Condition")
        ax.set_ylabel("Prop. YES" if col == 0 else "")
        ax.set_ylim(0, 1)
        ax.axhline(0.5, color="gray", linestyle="--", linewidth=0.8)

        # Annotate total malformed count for this system across displayed conditions
        sys_malformed = malformed_counts[malformed_counts["system_name"] == system]
        n_bad = sys_malformed["n_malformed"].sum()
        if n_bad > 0:
            ax.annotate(
                f"malformed: {n_bad}",
                xy=(0.98, 0.02), xycoords="axes fraction",
                ha="right", va="bottom", fontsize=7, color="red",
            )

    # Hide any unused subplots
    for idx in range(n_systems, n_rows * n_cols):
        row, col = divmod(idx, n_cols)
        axes[row][col].set_visible(False)

    fig.suptitle(
        "Proportion of Transgression Judgments (YES) by LLM and Condition\n"
        "(Hannikainen et al. 2022 stimuli)",
        fontsize=12,
        y=1.01,
    )
    plt.tight_layout()

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=150, bbox_inches="tight")
        print(f"Saved figure to {out}")
    else:
        plt.show()


def main():
    parser = argparse.ArgumentParser(description="Visualize LLM rule-violation judgments.")
    parser.add_argument(
        "--output", default=None, metavar="PATH",
        help="Save figure to this path instead of displaying it (e.g. figures/results.png).",
    )
    parser.add_argument(
        "--conditions", nargs="+", default=DEFAULT_CONDITIONS,
        help="Conditions to include (default: underinclusion overinclusion).",
    )
    args = parser.parse_args()

    data = load_results(args.conditions)
    print(f"Loaded {len(data)} rows across {data['system_name'].nunique()} system(s).")
    report_malformed(data)
    plot(data, args.output, args.conditions)


if __name__ == "__main__":
    main()
