"""
Person detection backends.

Design (spec section 25 -- AI model fallback chain):

    GPU YOLO  ->  CPU YOLO  ->  fallback detection / manual calibration

This build was scoped to run fully offline with zero model-weight
downloads, so only the OpenCV backend is implemented. The `PersonDetector`
interface and `get_detector()` factory below are written so a real
ultralytics/YOLO backend can be dropped in later (see the `YoloDetector`
stub) without touching any calling code -- `get_detector("yolo")`
already degrades gracefully to OpenCV today if ultralytics isn't
installed, which is the same fallback behaviour the finished GPU->CPU->
fallback chain would need.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class RawDetection:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


class PersonDetector(Protocol):
    name: str

    def detect(self, image: np.ndarray) -> list[RawDetection]:
        ...


class OpenCVHOGDetector:
    """Baseline person detector using OpenCV's built-in HOG + SVM descriptor.

    This ships with OpenCV itself -- no model download, no GPU, works
    fully offline. It is intentionally a *baseline*: HOG/SVM is far less
    accurate than a modern deep detector, especially for seated / partly
    occluded students viewed from odd classroom angles. That is why the
    architecture also provides manual seat calibration (app/cv/seats.py)
    and a human verification queue -- the system is designed to stay
    useful even when raw detection confidence is mediocre.
    """

    name = "opencv-hog"

    def __init__(self, confidence_threshold: float = 0.35) -> None:
        self.confidence_threshold = confidence_threshold
        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, image: np.ndarray) -> list[RawDetection]:
        if image is None or image.size == 0:
            return []

        h, w = image.shape[:2]
        # HOG runs faster and more reliably on a normalized width; scale
        # back up afterwards so returned boxes are in original-image pixels.
        scale = 1.0
        target_width = 640
        working = image
        if w > target_width:
            scale = w / target_width
            working = cv2.resize(image, (target_width, int(h / scale)))

        gray_needed = len(working.shape) == 2
        rgb = working if gray_needed else working

        rects, weights = self._hog.detectMultiScale(
            rgb,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05,
        )

        detections: list[RawDetection] = []
        for (x, y, rw, rh), weight in zip(rects, weights):
            # HOG's raw SVM decision score is unbounded; squash to (0,1)
            # with a logistic so it behaves like a probability while
            # preserving relative ranking.
            conf = float(1.0 / (1.0 + np.exp(-weight)))
            if conf < self.confidence_threshold:
                continue
            detections.append(
                RawDetection(
                    x1=x * scale,
                    y1=y * scale,
                    x2=(x + rw) * scale,
                    y2=(y + rh) * scale,
                    confidence=round(conf, 4),
                )
            )
        return detections


class YoloDetector:
    """Pluggable interface for a future ultralytics/YOLO backend.

    Not implemented in this build (the project was scoped to run with the
    OpenCV-only detector, see README > AI Model Setup). `get_detector`
    will only construct this if `ultralytics` is importable; otherwise it
    logs a warning and falls back to `OpenCVHOGDetector`, mirroring the
    GPU->CPU->fallback chain described in spec section 25.
    """

    name = "yolo"

    def __init__(self, confidence_threshold: float = 0.35, weights: str = "yolov8n.pt") -> None:
        from ultralytics import YOLO  # type: ignore

        self.confidence_threshold = confidence_threshold
        self._model = YOLO(weights)

    def detect(self, image: np.ndarray) -> list[RawDetection]:
        results = self._model(image, classes=[0], verbose=False)  # class 0 = person (COCO)
        detections: list[RawDetection] = []
        for r in results:
            for box in r.boxes:
                conf = float(box.conf[0])
                if conf < self.confidence_threshold:
                    continue
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                detections.append(RawDetection(x1=x1, y1=y1, x2=x2, y2=y2, confidence=round(conf, 4)))
        return detections


def get_detector(backend: str, confidence_threshold: float = 0.35) -> PersonDetector:
    """Factory implementing the fallback chain described in spec section 25."""
    if backend == "yolo":
        try:
            return YoloDetector(confidence_threshold=confidence_threshold)
        except Exception as exc:  # ultralytics not installed / weights unavailable
            logger.warning("YOLO backend unavailable (%s); falling back to OpenCV HOG detector.", exc)
            return OpenCVHOGDetector(confidence_threshold=confidence_threshold)
    return OpenCVHOGDetector(confidence_threshold=confidence_threshold)
