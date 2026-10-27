"""
Video pipeline support (spec section 17).

    Video -> extract frames -> detect students -> track students ->
    map students to seats -> aggregate results across frames ->
    final seating verification

`CentroidTracker` is a small, dependency-free implementation of the
classic centroid-distance tracker: it keeps a person from being counted
as a "new" student in every single frame just because HOG re-detected
them a few pixels off. It is not a full DeepSORT-grade tracker, but it
is real, working, and good enough for a mostly-static classroom scene
where people don't swap seats mid-video.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator

import cv2
import numpy as np


def extract_frames(video_path: str, sample_every_n_frames: int = 5) -> Iterator[tuple[int, int, np.ndarray]]:
    """Yield (frame_index, total_frame_count, frame) for every sampled frame."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % sample_every_n_frames == 0:
                yield idx, total, frame
            idx += 1
    finally:
        cap.release()


@dataclass
class TrackedObject:
    track_id: int
    centroid: tuple[float, float]
    bbox: tuple[float, float, float, float]
    confidence: float
    frames_seen: int = 1
    disappeared: int = 0


class CentroidTracker:
    """Assigns stable track_ids to bounding boxes across frames."""

    def __init__(self, max_disappeared: int = 8, max_distance: float = 80.0):
        self.next_id = 0
        self.objects: dict[int, TrackedObject] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def _register(self, bbox: tuple[float, float, float, float], confidence: float) -> int:
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        tid = self.next_id
        self.objects[tid] = TrackedObject(track_id=tid, centroid=(cx, cy), bbox=bbox, confidence=confidence)
        self.next_id += 1
        return tid

    def update(self, detections: list[tuple[tuple[float, float, float, float], float]]) -> dict[int, TrackedObject]:
        """detections: list of (bbox, confidence). Returns current live objects keyed by track_id."""
        if not detections:
            for obj in list(self.objects.values()):
                obj.disappeared += 1
                if obj.disappeared > self.max_disappeared:
                    del self.objects[obj.track_id]
            return self.objects

        input_centroids = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b, _ in detections]

        if not self.objects:
            for (bbox, conf) in detections:
                self._register(bbox, conf)
            return self.objects

        object_ids = list(self.objects.keys())
        object_centroids = [self.objects[oid].centroid for oid in object_ids]

        D = np.zeros((len(object_centroids), len(input_centroids)))
        for i, oc in enumerate(object_centroids):
            for j, ic in enumerate(input_centroids):
                D[i, j] = np.hypot(oc[0] - ic[0], oc[1] - ic[1])

        rows = D.min(axis=1).argsort()
        cols = D.argmin(axis=1)[rows]

        used_rows, used_cols = set(), set()
        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols:
                continue
            if D[row, col] > self.max_distance:
                continue
            oid = object_ids[row]
            bbox, conf = detections[col]
            obj = self.objects[oid]
            obj.centroid = input_centroids[col]
            obj.bbox = bbox
            obj.confidence = conf
            obj.frames_seen += 1
            obj.disappeared = 0
            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(len(object_centroids))) - used_rows
        for row in unused_rows:
            oid = object_ids[row]
            self.objects[oid].disappeared += 1
            if self.objects[oid].disappeared > self.max_disappeared:
                del self.objects[oid]

        unused_cols = set(range(len(input_centroids))) - used_cols
        for col in unused_cols:
            bbox, conf = detections[col]
            self._register(bbox, conf)

        return self.objects
