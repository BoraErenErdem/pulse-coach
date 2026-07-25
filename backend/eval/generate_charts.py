"""raw_results.json (ve raw_results_round1.json) üzerinden özet istatistikler
hesaplar ve model_comparison.md için PNG grafikler üretir. Her iki tur için de
ayrı dosya önekiyle (round1_/round2_) çalıştırılabilir, böylece iki turun
grafikleri de rapora yan yana konabilir.

Palet: Claude dataviz skill'inin referans kategorik paletinden slot 1 (mavi,
gemma4:e4b) ve slot 2 (turuncu, qwen3:14b) — sabit sıra, iki seri için
doğrulanmış bitişik çift.
"""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

RESULTS_DIR = Path(__file__).resolve().parent / "results"
CHARTS_DIR = RESULTS_DIR / "charts"

MODELS = ["gemma4:e4b", "qwen3:14b"]
COLORS = {"gemma4:e4b": "#2a78d6", "qwen3:14b": "#eb6834"}
INK = "#0b0b0b"
SECONDARY_INK = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"

plt.rcParams.update(
    {
        "font.family": "sans-serif",
        "text.color": INK,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": SECONDARY_INK,
        "xtick.color": SECONDARY_INK,
        "ytick.color": SECONDARY_INK,
        "figure.facecolor": "#fcfcfb",
        "axes.facecolor": "#fcfcfb",
        "savefig.facecolor": "#fcfcfb",
    }
)


def grouped_bar(
    filename: str,
    title: str,
    categories: list[str],
    values: dict[str, list[float]],
    ylabel: str,
    ylim: tuple[float, float],
    value_fmt: str = "{:.0f}",
):
    fig, ax = plt.subplots(figsize=(7.5, 4.3), dpi=150)
    n = len(categories)
    width = 0.32
    x = range(n)

    for i, model in enumerate(MODELS):
        offset = (i - 0.5) * width
        xs = [xi + offset for xi in x]
        bars = ax.bar(
            xs, values[model], width=width, color=COLORS[model], label=model, zorder=3
        )
        for b, v in zip(bars, values[model]):
            ax.text(
                b.get_x() + b.get_width() / 2,
                b.get_height() + (ylim[1] - ylim[0]) * 0.015,
                value_fmt.format(v),
                ha="center",
                va="bottom",
                fontsize=9,
                color=SECONDARY_INK,
            )

    ax.set_xticks(list(x))
    ax.set_xticklabels(categories, fontsize=9.5)
    ax.set_ylabel(ylabel, fontsize=9.5)
    ax.set_ylim(*ylim)
    ax.set_title(title, fontsize=12, color=INK, pad=14, loc="left", fontweight="bold")
    ax.yaxis.grid(True, color=GRID, linewidth=1, zorder=0)
    ax.set_axisbelow(True)
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(length=0)
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=2, fontsize=9.5)

    fig.tight_layout()
    fig.savefig(CHARTS_DIR / filename, bbox_inches="tight")
    plt.close(fig)


def run(results_filename: str, prefix: str, boundary_llm_n: int) -> dict:
    """Bir tur için tüm grafikleri üretir, konsol/rapor için özet dict döner."""
    data = json.loads((RESULTS_DIR / results_filename).read_text(encoding="utf-8"))
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)

    # ---- 1) Otomatik başarı oranları (%) ----
    auto_categories = [
        ("tool_calling", "Tool-Calling"),
        ("orchestrator_routing", "Yönlendirme"),
        ("boundary_safety_llm", f"Güvenlik Sınırı\n(LLM-mediated, {boundary_llm_n} senaryo)"),
    ]
    success_values = {m: [] for m in MODELS}
    for cat_key, _ in auto_categories:
        for model in MODELS:
            if cat_key == "boundary_safety_llm":
                records = [
                    r
                    for r in data
                    if r["category"] == "boundary_safety" and r["model"] == model and not r["deterministic"]
                ]
            else:
                records = [r for r in data if r["category"] == cat_key and r["model"] == model]
            passed = sum(1 for r in records if r["auto_checks"].get("passed"))
            pct = 100 * passed / len(records)
            success_values[model].append(pct)

    grouped_bar(
        f"{prefix}_success_rates.png",
        "Otomatik Başarı Oranı (%)",
        [label for _, label in auto_categories],
        success_values,
        "Başarı oranı (%)",
        (0, 110),
        value_fmt="%{:.0f}",
    )

    # ---- 2) Öznel kalite puanları (1-5, Claude puanlaması) ----
    subjective_categories = [("rag_groundedness", "RAG Sadakati"), ("turkish_quality", "Türkçe Kalitesi")]
    subj_values = {m: [] for m in MODELS}
    for cat_key, _ in subjective_categories:
        for model in MODELS:
            scores = [r["manual_score"] for r in data if r["category"] == cat_key and r["model"] == model]
            subj_values[model].append(sum(scores) / len(scores))

    grouped_bar(
        f"{prefix}_subjective_scores.png",
        "Öznel Kalite Puanı (1-5, Claude tarafından puanlandı)",
        [label for _, label in subjective_categories],
        subj_values,
        "Ortalama puan (1-5)",
        (0, 5.5),
        value_fmt="{:.1f}",
    )

    # ---- 3) Ortalama yanıt süresi (saniye) — deterministik kriz senaryoları hariç ----
    latency_categories = [
        ("tool_calling", "Tool-Calling"),
        ("orchestrator_routing", "Yönlendirme"),
        ("boundary_safety", "Güvenlik Sınırı"),
        ("rag_groundedness", "RAG Sadakati"),
        ("turkish_quality", "Türkçe Kalitesi"),
    ]
    latency_values = {m: [] for m in MODELS}
    for cat_key, _ in latency_categories:
        for model in MODELS:
            records = [
                r
                for r in data
                if r["category"] == cat_key and r["model"] == model and not r["deterministic"]
            ]
            avg = sum(r["latency_s"] for r in records) / len(records)
            latency_values[model].append(avg)

    grouped_bar(
        f"{prefix}_latency.png",
        "Ortalama Yanıt Süresi (saniye, kriz şablonu hariç)",
        [label for _, label in latency_categories],
        latency_values,
        "Saniye",
        (0, max(max(v) for v in latency_values.values()) * 1.25),
        value_fmt="{:.1f}s",
    )

    # ---- 4) Ortalama emoji sayısı / yanıt (genel) ----
    emoji_values = {m: [] for m in MODELS}
    for model in MODELS:
        records = [r for r in data if r["model"] == model and not r["deterministic"]]
        avg = sum(r["auxiliary_metrics"]["emoji_count"] for r in records) / len(records)
        emoji_values[model] = [avg]

    n_non_deterministic = sum(1 for r in data if r["model"] == MODELS[0] and not r["deterministic"])
    grouped_bar(
        f"{prefix}_emoji_usage.png",
        "Ortalama Emoji Sayısı / Yanıt",
        [f"Tüm senaryolar (n={n_non_deterministic})"],
        emoji_values,
        "Ortalama emoji sayısı",
        (0, max(max(v) for v in emoji_values.values()) * 1.4 + 0.1),
        value_fmt="{:.2f}",
    )

    overall_latency = {
        m: round(
            sum(r["latency_s"] for r in data if r["model"] == m and not r["deterministic"])
            / sum(1 for r in data if r["model"] == m and not r["deterministic"]),
            1,
        )
        for m in MODELS
    }

    summary = {
        "success_rates": {label: {m: round(success_values[m][i], 1) for m in MODELS} for i, (_, label) in enumerate(auto_categories)},
        "subjective_scores": {label: {m: round(subj_values[m][i], 2) for m in MODELS} for i, (_, label) in enumerate(subjective_categories)},
        "latency": {label: {m: round(latency_values[m][i], 1) for m in MODELS} for i, (_, label) in enumerate(latency_categories)},
        "overall_latency": overall_latency,
        "emoji": {m: round(emoji_values[m][0], 2) for m in MODELS},
    }
    return summary


def main():
    print("=== ROUND 1 (42 senaryo, boundary_safety 6 LLM-mediated) ===")
    round1_summary = run("raw_results_round1.json", "round1", boundary_llm_n=6)
    print(json.dumps(round1_summary, ensure_ascii=False, indent=2))

    print("\n=== ROUND 2 / FINAL (82 senaryo, boundary_safety 14 LLM-mediated) ===")
    round2_summary = run("raw_results.json", "round2", boundary_llm_n=14)
    print(json.dumps(round2_summary, ensure_ascii=False, indent=2))

    print("\nGrafikler yazıldı:", CHARTS_DIR)


if __name__ == "__main__":
    main()
