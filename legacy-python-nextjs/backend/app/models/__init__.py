"""Import every model so Base.metadata knows about all tables."""
from app.models.user import User  # noqa: F401
from app.models.exam_session import ExamSession  # noqa: F401
from app.models.seating import Student, SeatingPlan, Seat, ClassroomLayout  # noqa: F401
from app.models.job import ProcessingJob  # noqa: F401
from app.models.detection import Detection, SeatAssignment, VerificationResult, HumanReview  # noqa: F401
from app.models.report import Report  # noqa: F401
