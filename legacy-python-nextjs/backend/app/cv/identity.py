"""
Optional identity-matching module (spec section 9, Mode 2).

IMPORTANT: this module is only ever invoked when the caller explicitly
enables identity matching AND supplies authorized reference images for
students (see Student.reference_image_path). It is never used to
"guess" who someone is from a general population -- that would be
exactly the kind of hallucinated identity the spec explicitly forbids
(section 9, Mode 1: "Do NOT hallucinate a student identity").

Implementation note: a production system should use a proper face
embedding model (e.g. a FaceNet/ArcFace-style network). Because this
build was scoped to run fully offline with the OpenCV-only detection
backend (no model downloads), the embedding here is a documented
baseline: an HSV color-histogram signature of the detected person crop.
It captures coarse appearance (clothing colors) well enough to demo the
full pipeline end-to-end, but it is NOT a reliable face-identity
system -- treat any match from this module as low-confidence evidence
only, exactly like the rest of the pipeline. The `IdentityMatcher`
interface is written so a real face-embedding backend can be substituted
without touching any calling code.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class IdentityMatch:
    student_id: str
    similarity: float


def compute_embedding(image_bgr: np.ndarray) -> list[float]:
    """HSV color-histogram appearance signature, L2-normalized.

    Baseline only -- see module docstring.
    """
    if image_bgr is None or image_bgr.size == 0:
        return [0.0] * 48
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 3], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    return [float(v) for v in hist]


def embedding_to_json(embedding: list[float]) -> str:
    return json.dumps(embedding)


def embedding_from_json(raw: str) -> list[float]:
    return json.loads(raw)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    if va.size == 0 or vb.size == 0 or va.shape != vb.shape:
        return 0.0
    denom = (np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0:
        return 0.0
    return float(np.clip(np.dot(va, vb) / denom, -1.0, 1.0))


def match_identity(
    detected_embedding: list[float],
    known_embeddings: dict[str, list[float]],
    threshold: float,
) -> IdentityMatch | None:
    """Return the best-matching authorized student, or None if below threshold.

    Never returns a "best guess" below `threshold` -- callers must treat a
    None result as "identity could not be verified" (Mode 1 language),
    never as an accusation.
    """
    best_id: str | None = None
    best_score = -1.0
    for student_id, emb in known_embeddings.items():
        score = cosine_similarity(detected_embedding, emb)
        if score > best_score:
            best_score = score
            best_id = student_id

    if best_id is None or best_score < threshold:
        return None
    return IdentityMatch(student_id=best_id, similarity=round(best_score, 4))
