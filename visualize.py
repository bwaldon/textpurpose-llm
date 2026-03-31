"""
Visualize LLM responses to Hannikainen et al. (2022) stimuli.

Single condition-set (reproduces original graph):
    python visualize.py
    python visualize.py --condition-sets baseline --output figures/baseline.png

Compare across all three condition-sets (grouped bars per LLM):
    python visualize.py --condition-sets baseline purpose-fewshot textualist-fewshot
    python visualize.py --condition-sets baseline purpose-fewshot textualist-fewshot --output figures/comparison.png

Options:
    --conditions       Which scenario conditions to include (default: underinclusion overinclusion)
    --condition-sets   Which prompting conditions to load (default: baseline)
    --output           Save figure to path instead of displaying
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


RESULTS_BASE = Path("results")
DEFAULT_CONDITIONS = ["underinclusion", "overinclusion"]
ALL_CONDITION_SETS = ["baseline", "purpose-fewshot", "textualist-fewshot"]


def load_results(conditions: list[str], condition_sets: list[str]) -> pd.DataFrame:
    dfs = []
    for cs in condition_sets:
        subdir = RESULTS_BASE / cs
        if not subdir.exists():
            print(f"  Warning: no results directory for condition-set '{cs}' ({subdir})")
            continue
        for csv_path in sorted(subdir.glob("*.csv")):
            df = pd.read_csv(csv_path)
            df["condition_set"] = cs
            dfs.append(df)
    if not dfs:
        raise FileNotFoundError(f"No CSV files found under {RESULTS_BASE}/ for condition-sets: {condition_sets}")
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
        bad.groupby(["condition_set", "system_name", "condition", "response"])
        .size()
        .reset_index(name="count")
    )
    print(counts.to_string(index=False))
    print()


def plot(data: pd.DataFrame, output_path: str | None, conditions: list[str], condition_sets: list[str]) -> None:
    parseable = data[data["parseable"]]
    summary = (
        parseable.groupby(["system_name", "condition_set", "condition"])["transgression"]
        .mean()
        .reset_index()
        .rename(columns={"transgression": "proportion_yes"})
    )

    malformed_counts = (
        data[data["malformed"].astype(bool)]
        .groupby(["system_name", "condition_set"])
        .size()
        .reset_index(name="n_malformed")
    )

    systems = sorted(summary["system_name"].unique())
    n_systems = len(systems)
    n_cols = min(4, n_systems)
    n_rows = (n_systems + n_cols - 1) // n_cols

    condition_order = [c for c in conditions if c in summary["condition"].unique()]
    active_sets = [cs for cs in condition_sets if cs in summary["condition_set"].unique()]

    sns.set_theme(style="whitegrid", palette="muted")

    if len(active_sets) == 1:
        # Single condition-set: one bar per condition, same as original graph
        palette = sns.color_palette("muted", n_colors=len(condition_order))
        fig, axes = plt.subplots(
            n_rows, n_cols,
            figsize=(4 * n_cols, 4 * n_rows),
            sharey=True,
            squeeze=False,
        )
        for idx, system in enumerate(systems):
            row, col = divmod(idx, n_cols)
            ax = axes[row][col]
            subset = summary[
                (summary["system_name"] == system) &
                (summary["condition_set"] == active_sets[0])
            ]
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

            sys_mal = malformed_counts[
                (malformed_counts["system_name"] == system) &
                (malformed_counts["condition_set"] == active_sets[0])
            ]
            n_bad = sys_mal["n_malformed"].sum()
            if n_bad > 0:
                ax.annotate(
                    f"malformed: {n_bad}",
                    xy=(0.98, 0.02), xycoords="axes fraction",
                    ha="right", va="bottom", fontsize=7, color="red",
                )

        title = (
            f"Proportion of Transgression Judgments (YES) — {active_sets[0]}\n"
            "(Hannikainen et al. 2022 stimuli)"
        )

    else:
        # Multiple condition-sets: grouped bars with hue=condition_set
        palette = sns.color_palette("muted", n_colors=len(active_sets))
        fig, axes = plt.subplots(
            n_rows, n_cols,
            figsize=(4.5 * n_cols, 4 * n_rows),
            sharey=True,
            squeeze=False,
        )
        for idx, system in enumerate(systems):
            row, col = divmod(idx, n_cols)
            ax = axes[row][col]
            subset = summary[summary["system_name"] == system]
            sns.barplot(
                data=subset,
                x="condition",
                y="proportion_yes",
                hue="condition_set",
                order=condition_order,
                hue_order=active_sets,
                palette=palette,
                ax=ax,
            )
            ax.set_title(system, fontsize=9, fontweight="bold")
            ax.set_xlabel("Condition")
            ax.set_ylabel("Prop. YES" if col == 0 else "")
            ax.set_ylim(0, 1)
            ax.axhline(0.5, color="gray", linestyle="--", linewidth=0.8)
            if idx == 0:
                ax.legend(title="condition set", fontsize=7, title_fontsize=7)
            else:
                legend = ax.get_legend()
                if legend:
                    legend.remove()

            sys_mal = malformed_counts[malformed_counts["system_name"] == system]
            n_bad = sys_mal["n_malformed"].sum()
            if n_bad > 0:
                ax.annotate(
                    f"malformed: {n_bad}",
                    xy=(0.98, 0.02), xycoords="axes fraction",
                    ha="right", va="bottom", fontsize=7, color="red",
                )

        title = (
            "Proportion of Transgression Judgments (YES) by Condition Set\n"
            "(Hannikainen et al. 2022 stimuli)"
        )

    # Hide any unused subplots
    for idx in range(n_systems, n_rows * n_cols):
        row, col = divmod(idx, n_cols)
        axes[row][col].set_visible(False)

    fig.suptitle(title, fontsize=12, y=1.01)
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
        "--condition-sets", nargs="+", default=["baseline"],
        metavar="CSET",
        help="Which condition-sets to load (default: baseline). "
             "Pass multiple to compare side-by-side.",
    )
    parser.add_argument(
        "--conditions", nargs="+", default=DEFAULT_CONDITIONS,
        help="Scenario conditions to include (default: underinclusion overinclusion).",
    )
    parser.add_argument(
        "--output", default=None, metavar="PATH",
        help="Save figure to this path instead of displaying it.",
    )
    args = parser.parse_args()

    data = load_results(args.conditions, args.condition_sets)
    print(f"Loaded {len(data)} rows across {data['system_name'].nunique()} system(s), "
          f"{data['condition_set'].nunique()} condition-set(s).")
    report_malformed(data)
    plot(data, args.output, args.conditions, args.condition_sets)


if __name__ == "__main__":
    main()
