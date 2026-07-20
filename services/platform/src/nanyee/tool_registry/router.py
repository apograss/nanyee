from __future__ import annotations

from fastapi import APIRouter

from nanyee.tool_registry import ToolDefinition, all_tools

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolDefinition], operation_id="list_tools")
async def list_tools() -> list[ToolDefinition]:
    return list(all_tools())
