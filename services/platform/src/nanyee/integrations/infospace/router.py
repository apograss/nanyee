from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from nanyee.tools.study_cabin import DEFAULT_CABINS

router = APIRouter(prefix="/study-cabin", tags=["study-cabin"])


class StudyCabinResponse(BaseModel):
    dev_id: int
    name: str


@router.get("/cabins", response_model=list[StudyCabinResponse], operation_id="list_study_cabins")
async def list_study_cabins() -> list[StudyCabinResponse]:
    return [StudyCabinResponse(dev_id=cabin.dev_id, name=cabin.name) for cabin in DEFAULT_CABINS]
