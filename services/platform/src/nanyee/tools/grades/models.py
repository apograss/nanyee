from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class GradeDistribution(BaseModel):
    lt60: int = 0
    s60to70: int = 0
    s70to80: int = 0
    s80to90: int = 0
    gte90: int = 0


class RankingInfo(BaseModel):
    course_rank: int = 0
    course_total: int = 0
    class_rank: int = 0
    class_total: int = 0
    distribution: GradeDistribution = Field(default_factory=GradeDistribution)


class GradeRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    english_name: str = ""
    raw_score: str
    numeric_score: float = 0
    grade_point: float = 0
    credits: float = Field(default=0, ge=0)
    study_type: str = ""
    course_category: str = ""
    semester: str = ""
    department: str = ""
    exam_type: str = ""
    grade_id: str = ""
    total_hours: float = 0
    ranking: RankingInfo | None = None

    @classmethod
    def from_upstream(cls, row: dict[str, object]) -> GradeRecord:
        return cls(
            name=str(row.get("kcmc") or ""),
            english_name=str(row.get("kcywmc") or ""),
            raw_score=str(row.get("zcj") or ""),
            numeric_score=_number(row.get("zcjfs")),
            grade_point=_number(row.get("cjjd")),
            credits=max(0, _number(row.get("xf"))),
            study_type=str(row.get("xdfsmc") or ""),
            course_category=str(row.get("kcdlmc") or row.get("kcflmc") or ""),
            semester=str(row.get("xnxqmc") or ""),
            department=str(row.get("kkbmmc") or ""),
            exam_type=str(row.get("ksxzmc") or ""),
            grade_id=str(row.get("cjdm") or ""),
            total_hours=_number(row.get("zxs")),
        )


class GradeSummary(BaseModel):
    total_credits: float
    total_courses: int
    weighted_gpa: float
    required_gpa: float
    average_score: float
    required_average_score: float
    failed_count: int
    semesters: tuple[str, ...]
    grades: tuple[GradeRecord, ...]


def _number(value: object) -> float:
    try:
        return float(str(value or 0))
    except (TypeError, ValueError):
        return 0


def parse_grades(payload: object) -> list[GradeRecord]:
    if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
        raise ValueError("grade response does not contain a rows array")
    return [GradeRecord.from_upstream(row) for row in payload["rows"] if isinstance(row, dict)]


def calculate_summary(grades: list[GradeRecord]) -> GradeSummary:
    total_credits = sum(grade.credits for grade in grades)
    required = [grade for grade in grades if grade.study_type == "必修"]
    required_credits = sum(grade.credits for grade in required)

    def weighted(items: list[GradeRecord], attribute: str, credits: float) -> float:
        if credits <= 0:
            return 0
        return sum(grade.credits * float(getattr(grade, attribute)) for grade in items) / credits

    return GradeSummary(
        total_credits=total_credits,
        total_courses=len(grades),
        weighted_gpa=weighted(grades, "grade_point", total_credits),
        required_gpa=weighted(required, "grade_point", required_credits),
        average_score=weighted(grades, "numeric_score", total_credits),
        required_average_score=weighted(required, "numeric_score", required_credits),
        failed_count=sum(
            1 for grade in grades if grade.grade_point == 0 and grade.numeric_score < 60
        ),
        semesters=tuple(sorted({grade.semester for grade in grades if grade.semester})),
        grades=tuple(grades),
    )
