import json
import csv
import sys
from math import ceil
from pathlib import Path
from statistics import median, mean, stdev


def load_data(json_path: Path) -> dict:
    with json_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def group_by_filename(events):
    grouped = {}
    for event in events:
        filename = event.get("label")
        delta = event.get("deltaSeconds")

        if filename is None or delta is None:
            continue

        grouped.setdefault(filename, []).append(float(delta))
    return grouped


def percentile(values, p: float) -> float:
    if not values:
        raise ValueError("percentile() requires at least one value")

    sorted_values = sorted(values)
    index = ceil((p / 100) * len(sorted_values)) - 1
    index = max(0, min(index, len(sorted_values) - 1))
    return sorted_values[index]


def compute_stats(times):
    return {
        "attempt_count": len(times),
        "min": min(times),
        "max": max(times),
        "median": median(times),
        "average": mean(times),
        "stddev": stdev(times) if len(times) > 1 else 0.0,
        "p95": percentile(times, 95),
    }


def write_summary(summary_path: Path, grouped: dict):
    with summary_path.open("w", encoding="utf-8") as f:
        for filename in sorted(grouped):
            times = grouped[filename]
            stats = compute_stats(times)
            line = (
                f"{filename} number of upload attempts: {stats['attempt_count']}, "
                f"min time: {stats['min']:.6f}, "
                f"max time: {stats['max']:.6f}, "
                f"median time: {stats['median']:.6f}, "
                f"average time: {stats['average']:.6f}, "
                f"stddev: {stats['stddev']:.6f}, "
                f"p95: {stats['p95']:.6f}"
            )
            f.write(line + "\n")


def write_csv(csv_path: Path, grouped: dict):
    max_attempts = max(len(times) for times in grouped.values()) if grouped else 0

    header = ["filename", "attempt_count", "min", "max", "median", "average", "stddev", "p95"]
    header += [f"attempt_{i}" for i in range(1, max_attempts + 1)]

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for filename in sorted(grouped):
            times = grouped[filename]
            stats = compute_stats(times)

            row = [
                filename,
                stats["attempt_count"],
                f"{stats['min']:.6f}",
                f"{stats['max']:.6f}",
                f"{stats['median']:.6f}",
                f"{stats['average']:.6f}",
                f"{stats['stddev']:.6f}",
                f"{stats['p95']:.6f}",
            ]
            row += [f"{t:.6f}" for t in times]
            row += [""] * (max_attempts - len(times))
            writer.writerow(row)


def main():
    if len(sys.argv) != 2:
        print("Usage: python data_analyzer.py <input.json>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    data = load_data(input_path)
    events = data.get("events", [])
    grouped = group_by_filename(events)

    summary_path = input_path.with_name(input_path.stem + "_summary.txt")
    csv_path = input_path.with_name(input_path.stem + "_stats.csv")

    write_summary(summary_path, grouped)
    write_csv(csv_path, grouped)

    print(f"Summary written to: {summary_path}")
    print(f"CSV written to: {csv_path}")


if __name__ == "__main__":
    main()