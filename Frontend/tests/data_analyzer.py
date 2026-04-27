import argparse
import csv
import json
import sys
from math import ceil
from pathlib import Path
from statistics import median, mean, stdev
from datetime import datetime


DEFAULT_EXCLUDED_CONTAINERS = {"frontend_test"}


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


def load_container_stats(stats_path: Path, excluded_containers: set[str]):
    """
    Reads newline-delimited JSON docker stats logs.

    Returns:
      included:
        Sum of memory for containers NOT in excluded_containers.

      excluded:
        Sum of memory for containers in excluded_containers.

      total:
        Sum of memory for all containers.
    """
    included_memory_by_timestamp = {}
    excluded_memory_by_timestamp = {}
    total_memory_by_timestamp = {}

    with stats_path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            container = entry.get("container")
            timestamp_raw = entry.get("timestamp")
            memory_usage_raw = entry.get("memoryUsage")

            if not container or not timestamp_raw or not memory_usage_raw:
                continue

            try:
                timestamp = parse_iso_datetime(timestamp_raw)
                memory_mib = parse_memory_to_mib(memory_usage_raw)
            except Exception:
                continue

            total_memory_by_timestamp.setdefault(timestamp, 0.0)
            total_memory_by_timestamp[timestamp] += memory_mib

            if container in excluded_containers:
                excluded_memory_by_timestamp.setdefault(timestamp, 0.0)
                excluded_memory_by_timestamp[timestamp] += memory_mib
            else:
                included_memory_by_timestamp.setdefault(timestamp, 0.0)
                included_memory_by_timestamp[timestamp] += memory_mib

    return {
        "included": included_memory_by_timestamp,
        "excluded": excluded_memory_by_timestamp,
        "total": total_memory_by_timestamp,
    }


def max_memory_during_attempt(upload_at: str, reload_at: str, memory_by_timestamp: dict) -> float:
    start = parse_iso_datetime(upload_at)
    end = parse_iso_datetime(reload_at)

    values = [
        memory_mib
        for ts, memory_mib in memory_by_timestamp.items()
        if start <= ts <= end
    ]

    return max(values) if values else 0.0


def group_by_filename(events, container_memory_maps=None):
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
            "max_app_memory_mib": 0.0,
            "max_excluded_memory_mib": 0.0,
            "max_total_memory_mib": 0.0,
        }

        if container_memory_maps and upload_at and reload_at:
            attempt_record["max_app_memory_mib"] = max_memory_during_attempt(
                upload_at,
                reload_at,
                container_memory_maps["included"],
            )

            attempt_record["max_excluded_memory_mib"] = max_memory_during_attempt(
                upload_at,
                reload_at,
                container_memory_maps["excluded"],
            )

            attempt_record["max_total_memory_mib"] = max_memory_during_attempt(
                upload_at,
                reload_at,
                container_memory_maps["total"],
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


def write_summary(summary_path: Path, grouped: dict, excluded_containers: set[str]):
    excluded_label = ", ".join(sorted(excluded_containers)) if excluded_containers else "none"

    with summary_path.open("w", encoding="utf-8") as f:
        f.write(f"Excluded containers from app memory result: {excluded_label}\n\n")

        for filename in sorted(grouped):
            attempts = grouped[filename]

            times = [a["delta"] for a in attempts]
            app_memory_maxes = [a["max_app_memory_mib"] for a in attempts]
            excluded_memory_maxes = [a["max_excluded_memory_mib"] for a in attempts]
            total_memory_maxes = [a["max_total_memory_mib"] for a in attempts]

            stats = compute_stats(times)

            app_memory_median = median(app_memory_maxes) if app_memory_maxes else 0.0
            excluded_memory_median = median(excluded_memory_maxes) if excluded_memory_maxes else 0.0
            total_memory_median = median(total_memory_maxes) if total_memory_maxes else 0.0

            line = (
                f"{filename} number of upload attempts: {stats['attempt_count']}, "
                f"min time: {stats['min']:.6f}, "
                f"max time: {stats['max']:.6f}, "
                f"median time: {stats['median']:.6f}, "
                f"average time: {stats['average']:.6f}, "
                f"stddev: {stats['stddev']:.6f}, "
                f"p95: {stats['p95']:.6f}, "
                f"median max app memory per upload excluding frontend_test (MiB): {app_memory_median:.6f}, "
                f"median max excluded memory per upload (MiB): {excluded_memory_median:.6f}, "
                f"median max total memory per upload including all containers (MiB): {total_memory_median:.6f}"
            )

            f.write(line + "\n")


def write_csv(csv_path: Path, grouped: dict, excluded_containers: set[str]):
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
        "median_max_app_memory_mib",
        "median_max_excluded_memory_mib",
        "median_max_total_memory_mib",
        "excluded_containers",
    ]

    for i in range(1, max_attempts + 1):
        header.append(f"attempt_{i}_seconds")
        header.append(f"attempt_{i}_max_app_memory_mib")
        header.append(f"attempt_{i}_max_excluded_memory_mib")
        header.append(f"attempt_{i}_max_total_memory_mib")

    excluded_label = ",".join(sorted(excluded_containers))

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for filename in sorted(grouped):
            attempts = grouped[filename]

            times = [a["delta"] for a in attempts]
            app_memory_maxes = [a["max_app_memory_mib"] for a in attempts]
            excluded_memory_maxes = [a["max_excluded_memory_mib"] for a in attempts]
            total_memory_maxes = [a["max_total_memory_mib"] for a in attempts]

            stats = compute_stats(times)

            app_memory_median = median(app_memory_maxes) if app_memory_maxes else 0.0
            excluded_memory_median = median(excluded_memory_maxes) if excluded_memory_maxes else 0.0
            total_memory_median = median(total_memory_maxes) if total_memory_maxes else 0.0

            row = [
                filename,
                stats["attempt_count"],
                f"{stats['min']:.6f}",
                f"{stats['max']:.6f}",
                f"{stats['median']:.6f}",
                f"{stats['average']:.6f}",
                f"{stats['stddev']:.6f}",
                f"{stats['p95']:.6f}",
                f"{app_memory_median:.6f}",
                f"{excluded_memory_median:.6f}",
                f"{total_memory_median:.6f}",
                excluded_label,
            ]

            for attempt in attempts:
                row.append(f"{attempt['delta']:.6f}")
                row.append(f"{attempt['max_app_memory_mib']:.6f}")
                row.append(f"{attempt['max_excluded_memory_mib']:.6f}")
                row.append(f"{attempt['max_total_memory_mib']:.6f}")

            missing_attempts = max_attempts - len(attempts)
            for _ in range(missing_attempts):
                row.extend(["", "", "", ""])

            writer.writerow(row)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Analyze upload timing data and optional Docker container stats."
    )

    parser.add_argument(
        "input_json",
        help="Input JSON file containing an 'events' array.",
    )

    parser.add_argument(
        "container_stats",
        nargs="?",
        help="Optional newline-delimited JSON Docker stats file.",
    )

    parser.add_argument(
        "--exclude-container",
        action="append",
        default=[],
        help=(
            "Additional container name to exclude from app memory. "
            "frontend_test is always excluded automatically."
        ),
    )

    return parser.parse_args()


def build_excluded_container_set(args) -> set[str]:
    excluded = set(DEFAULT_EXCLUDED_CONTAINERS)

    for name in args.exclude_container:
        name = name.strip()
        if name:
            excluded.add(name)

    return excluded


def main():
    args = parse_args()

    input_path = Path(args.input_json)

    if not input_path.exists():
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    excluded_containers = build_excluded_container_set(args)

    container_memory_maps = None

    if args.container_stats:
        stats_path = Path(args.container_stats)

        if not stats_path.exists():
            print(f"Error: stats file not found: {stats_path}")
            sys.exit(1)

        container_memory_maps = load_container_stats(
            stats_path,
            excluded_containers=excluded_containers,
        )

    data = load_data(input_path)
    events = data.get("events", [])

    grouped = group_by_filename(
        events,
        container_memory_maps=container_memory_maps,
    )

    summary_path = input_path.with_name(input_path.stem + "_summary.txt")
    csv_path = input_path.with_name(input_path.stem + "_stats.csv")

    write_summary(summary_path, grouped, excluded_containers)
    write_csv(csv_path, grouped, excluded_containers)

    print(f"Summary written to: {summary_path}")
    print(f"CSV written to: {csv_path}")
    print(
        "App memory result excludes containers: "
        + ", ".join(sorted(excluded_containers))
    )


if __name__ == "__main__":
    main()