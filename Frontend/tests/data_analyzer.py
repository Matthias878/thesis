import json
import csv
import sys
from math import ceil
from pathlib import Path
from statistics import median, mean, stdev
from datetime import datetime


def load_data(json_path: Path) -> dict:
    with json_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def parse_iso_datetime(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def parse_memory_to_mib(memory_usage: str) -> float:
    """
    Parses strings like:
      '102.9MiB / 3.283GiB'
      '1.2GiB / 3.283GiB'
      '512KiB / 3.283GiB'
      '123B / 3.283GiB'
    Returns the used memory in MiB.
    """
    used_part = memory_usage.split("/")[0].strip()

    units = {
        "B": 1 / (1024 * 1024),
        "KiB": 1 / 1024,
        "MiB": 1,
        "GiB": 1024,
    }

    for unit in ("GiB", "MiB", "KiB", "B"):
        if used_part.endswith(unit):
            number = float(used_part[:-len(unit)].strip())
            return number * units[unit]

    raise ValueError(f"Unsupported memory format: {memory_usage}")


def load_container_stats(stats_path: Path):
    """
    Reads newline-delimited JSON docker stats logs.
    Returns:
      {
        timestamp1: combined_memory_mib,
        timestamp2: combined_memory_mib,
        ...
      }
    where combined memory is summed across all containers at the same timestamp.
    """
    grouped_by_timestamp = {}

    with stats_path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                # ignore truncated/bad trailing lines
                continue

            timestamp_raw = entry.get("timestamp")
            memory_usage_raw = entry.get("memoryUsage")

            if not timestamp_raw or not memory_usage_raw:
                continue

            try:
                timestamp = parse_iso_datetime(timestamp_raw)
                memory_mib = parse_memory_to_mib(memory_usage_raw)
            except Exception:
                continue

            grouped_by_timestamp.setdefault(timestamp, 0.0)
            grouped_by_timestamp[timestamp] += memory_mib

    return grouped_by_timestamp


def max_combined_memory_during_attempt(upload_at: str, reload_at: str, combined_memory_by_timestamp: dict) -> float:
    start = parse_iso_datetime(upload_at)
    end = parse_iso_datetime(reload_at)

    values = [
        total_memory
        for ts, total_memory in combined_memory_by_timestamp.items()
        if start <= ts <= end
    ]

    return max(values) if values else 0.0


def group_by_filename(events, combined_memory_by_timestamp=None):
    grouped = {}

    for event in events:
        filename = event.get("label")
        delta = event.get("deltaSeconds")
        upload_at = event.get("uploadAt")
        reload_at = event.get("reloadAt")

        if filename is None or delta is None:
            continue

        attempt_record = {
            "delta": float(delta),
            "max_combined_memory_mib": 0.0,
        }

        if combined_memory_by_timestamp and upload_at and reload_at:
            attempt_record["max_combined_memory_mib"] = max_combined_memory_during_attempt(
                upload_at,
                reload_at,
                combined_memory_by_timestamp,
            )

        grouped.setdefault(filename, []).append(attempt_record)

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
            attempts = grouped[filename]
            times = [a["delta"] for a in attempts]
            memory_maxes = [a["max_combined_memory_mib"] for a in attempts]

            stats = compute_stats(times)
            memory_median = median(memory_maxes) if memory_maxes else 0.0

            line = (
                f"{filename} number of upload attempts: {stats['attempt_count']}, "
                f"min time: {stats['min']:.6f}, "
                f"max time: {stats['max']:.6f}, "
                f"median time: {stats['median']:.6f}, "
                f"average time: {stats['average']:.6f}, "
                f"stddev: {stats['stddev']:.6f}, "
                f"p95: {stats['p95']:.6f}, "
                f"median max combined memory per upload (MiB): {memory_median:.6f}"
            )
            f.write(line + "\n")


def write_csv(csv_path: Path, grouped: dict):
    max_attempts = max(len(attempts) for attempts in grouped.values()) if grouped else 0

    header = [
        "filename",
        "attempt_count",
        "min",
        "max",
        "median",
        "average",
        "stddev",
        "p95",
        "median_max_combined_memory_mib",
    ]

    for i in range(1, max_attempts + 1):
        header.append(f"attempt_{i}_seconds")
        header.append(f"attempt_{i}_max_combined_memory_mib")

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for filename in sorted(grouped):
            attempts = grouped[filename]
            times = [a["delta"] for a in attempts]
            memory_maxes = [a["max_combined_memory_mib"] for a in attempts]

            stats = compute_stats(times)
            memory_median = median(memory_maxes) if memory_maxes else 0.0

            row = [
                filename,
                stats["attempt_count"],
                f"{stats['min']:.6f}",
                f"{stats['max']:.6f}",
                f"{stats['median']:.6f}",
                f"{stats['average']:.6f}",
                f"{stats['stddev']:.6f}",
                f"{stats['p95']:.6f}",
                f"{memory_median:.6f}",
            ]

            for attempt in attempts:
                row.append(f"{attempt['delta']:.6f}")
                row.append(f"{attempt['max_combined_memory_mib']:.6f}")

            missing_attempts = max_attempts - len(attempts)
            for _ in range(missing_attempts):
                row.extend(["", ""])

            writer.writerow(row)


def main():
    if len(sys.argv) not in (2, 3):
        print("Usage:")
        print("  python data_analyzer.py <input.json>")
        print("  python data_analyzer.py <input.json> <container_stats.ndjson>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    combined_memory_by_timestamp = None
    if len(sys.argv) == 3:
        stats_path = Path(sys.argv[2])
        if not stats_path.exists():
            print(f"Error: stats file not found: {stats_path}")
            sys.exit(1)
        combined_memory_by_timestamp = load_container_stats(stats_path)

    data = load_data(input_path)
    events = data.get("events", [])
    grouped = group_by_filename(events, combined_memory_by_timestamp)

    summary_path = input_path.with_name(input_path.stem + "_summary.txt")
    csv_path = input_path.with_name(input_path.stem + "_stats.csv")

    write_summary(summary_path, grouped)
    write_csv(csv_path, grouped)

    print(f"Summary written to: {summary_path}")
    print(f"CSV written to: {csv_path}")


if __name__ == "__main__":
    main()