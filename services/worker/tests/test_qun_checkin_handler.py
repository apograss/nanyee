from __future__ import annotations

import re

from nanyee.tools.qun_checkin import QunSubmitRequest
from nanyee_worker.qun_checkin import _catalogs_for_execution


def _request() -> QunSubmitRequest:
    return QunSubmitRequest.model_validate(
        {
            "form_id": "1865916470380662785",
            "form_version": 3,
            "title": "打卡",
            "catalogs": [
                {"cid": "date-1", "type": "DATE", "value": "2026-08-04 09:00"},
                {"cid": "word-1", "type": "WORD", "value": "张三"},
                {"cid": "loc-1", "type": "LOCATION", "value": {"address": "x"}},
            ],
        }
    )


def test_catalogs_for_execution_refreshes_date_fields_only() -> None:
    catalogs = _catalogs_for_execution(_request())
    by_cid = {item["cid"]: item for item in catalogs}

    refreshed = by_cid["date-1"]["value"]
    assert isinstance(refreshed, str)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", refreshed)

    # 非 DATE 字段原样保留
    assert by_cid["word-1"]["value"] == "张三"
    assert by_cid["loc-1"]["value"] == {"address": "x"}
