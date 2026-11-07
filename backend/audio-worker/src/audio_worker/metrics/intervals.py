from __future__ import annotations

from collections.abc import Iterable


def union(intervals: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
    ordered = sorted((max(0.0, a), max(0.0, b)) for a, b in intervals if b > a)
    result: list[list[float]] = []
    for start, end in ordered:
        if not result or start > result[-1][1]:
            result.append([start, end])
        else:
            result[-1][1] = max(result[-1][1], end)
    return [(a, b) for a, b in result]


def duration(intervals: Iterable[tuple[float, float]]) -> float:
    return sum(b - a for a, b in union(intervals))


def gaps(intervals: Iterable[tuple[float, float]], recording_duration: float) -> list[tuple[float, float]]:
    merged = union(intervals)
    result: list[tuple[float, float]] = []
    cursor = 0.0
    for start, end in merged:
        if start > cursor: result.append((cursor, min(start, recording_duration)))
        cursor = max(cursor, end)
    if cursor < recording_duration: result.append((cursor, recording_duration))
    return [(a, b) for a, b in result if b > a]
