from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from nanyee.tools.qun_checkin import (
    QunSubmitRequest,
    QunUserDefaults,
    build_payload,
    validate_auth_token,
)

SHANGHAI = ZoneInfo("Asia/Shanghai")


def test_token_and_submit_contract_validation() -> None:
    token = "a" * 60
    assert validate_auth_token(f"  {token}  ") == token
    with pytest.raises(ValueError):
        validate_auth_token("short")
    with pytest.raises(ValueError):
        validate_auth_token("a" * 30 + " " + "a" * 30)

    request = QunSubmitRequest.model_validate(
        {
            "form_id": "123456789012345",
            "form_version": 3,
            "title": "每日打卡",
            "catalogs": [{"cid": "field-1", "type": "WORD", "value": "正常"}],
        }
    )
    assert request.form_id == "123456789012345"
    assert "token" not in request.model_dump()


def test_payload_builder_preserves_old_field_rules() -> None:
    catalogs = [
        {
            "cid": "name",
            "type": "WORD",
            "config": {
                "NAME_LIST": {
                    "active": True,
                    "content": {
                        "groups": [
                            {
                                "groupId": "临床1班",
                                "groupName": "临床1班",
                                "value": [{"name": "张三", "status": 1}],
                            }
                        ]
                    },
                },
                "NAME_LIST_ACTIVE_TYPE": {"content": "GROUP"},
            },
        },
        {
            "cid": "health",
            "type": "RADIO",
            "config": {"OPTIONS": {"content": [{"label": "正常", "value": "ok"}]}},
        },
        {"cid": "tags", "type": "CHECKBOX"},
        {"cid": "date", "type": "DATE"},
        {"cid": "location", "type": "LOCATION"},
    ]
    payload = build_payload(
        catalogs,
        {"catalogs": [{"cid": "tags", "value": ["无异常"]}]},
        QunUserDefaults(
            display_name="临床1班 张三",
            default_lat=23.1,
            default_lng=113.3,
            default_address="教学楼",
        ),
        {},
        now=datetime(2026, 7, 20, 8, 30, tzinfo=SHANGHAI),
    )
    values = {item.cid: item.value for item in payload}

    assert values["name"] == "张三 临床1班"
    assert values["health"] == "ok"
    assert values["tags"] == ["无异常"]
    assert values["date"] == "2026-07-20 08:30"
    assert values["location"]["location"]["coordinates"] == [113.3, 23.1]
