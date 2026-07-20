from __future__ import annotations

from nanyee.tool_registry.models import (
    CredentialMode,
    RiskLevel,
    ThirdPartyFlow,
    ToolDefinition,
)

_TOOLS = (
    ToolDefinition(
        id="timetable",
        name="课表查询与导出",
        description="查询课表并导出 JSON、ICS 或 WakeUp。",
        operations=("query", "export_ics", "export_wakeup"),
        credential_modes=(CredentialMode.TRANSIENT_SERVER,),
        risk_level=RiskLevel.READ_ONLY,
        account_required=False,
        student_identity_required=False,
        third_party_flows=(
            ThirdPartyFlow(provider="WakeUp", purpose="可选课表分享", optional=True),
        ),
    ),
    ToolDefinition(
        id="grades",
        name="成绩与排名查询",
        description="即时查询成绩与排名，结果默认不保存。",
        operations=("query",),
        credential_modes=(CredentialMode.TRANSIENT_SERVER,),
        risk_level=RiskLevel.READ_ONLY,
        account_required=False,
        student_identity_required=False,
    ),
    ToolDefinition(
        id="evaluation",
        name="评课助手",
        description="读取待评课程、生成草稿并在确认后逐项提交。",
        operations=("prepare", "submit"),
        credential_modes=(CredentialMode.TRANSIENT_SERVER,),
        risk_level=RiskLevel.USER_CONFIRMED_WRITE,
        account_required=True,
        student_identity_required=True,
    ),
    ToolDefinition(
        id="qun_checkin",
        name="群报数打卡",
        description="读取表单、预览并立即或预约提交。",
        operations=("preview", "submit"),
        credential_modes=(
            CredentialMode.TRANSIENT_SERVER,
            CredentialMode.HOSTED_AUTOMATION,
        ),
        risk_level=RiskLevel.SCHEDULED_WRITE,
        account_required=True,
        student_identity_required=False,
        third_party_flows=(
            ThirdPartyFlow(provider="Qun100", purpose="表单读取、图片上传与提交", optional=False),
        ),
    ),
    ToolDefinition(
        id="course_selection",
        name="选课助手",
        description="在用户在线确认后按公平配额尝试选课。",
        operations=("preview", "enroll"),
        credential_modes=(CredentialMode.TRANSIENT_SERVER,),
        risk_level=RiskLevel.USER_CONFIRMED_WRITE,
        account_required=True,
        student_identity_required=True,
    ),
    ToolDefinition(
        id="study_cabin",
        name="学习舱预约",
        description="按时间偏好查询并预约学习舱。",
        operations=("reserve",),
        credential_modes=(CredentialMode.HOSTED_AUTOMATION,),
        risk_level=RiskLevel.SCHEDULED_WRITE,
        account_required=True,
        student_identity_required=True,
    ),
)

_TOOLS_BY_ID = {tool.id: tool for tool in _TOOLS}


def all_tools() -> tuple[ToolDefinition, ...]:
    return _TOOLS


def get_tool(tool_id: str) -> ToolDefinition | None:
    return _TOOLS_BY_ID.get(tool_id)
