from __future__ import annotations

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.integrations.qun100 import Qun100Client, Qun100SubmissionUnknown

TOKEN = "a" * 60


@pytest.mark.asyncio
@respx.mock
async def test_qun100_lists_unique_forms_with_required_headers() -> None:
    route = respx.get(
        "https://form.qun100.com/v2/creation_forms?pageNo=1&pageSize=20&folderId=&forDraft=false"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "creations": {
                        "active": [
                            {"formId": "123456789012345", "title": "打卡"},
                            {"formId": "123456789012345", "title": "重复"},
                        ]
                    }
                },
            },
        )
    )

    forms = await Qun100Client(Settings(app_env="test")).list_active_forms(TOKEN)

    assert [item["title"] for item in forms] == ["打卡"]
    request = route.calls[0].request
    assert request.headers["authorization"] == TOKEN
    assert request.headers["client-app-id"] == "wxfc4ef6d539d03373"


@pytest.mark.asyncio
@respx.mock
async def test_qun100_submission_timeout_is_never_retried_as_safe() -> None:
    respx.post("https://form.qun100.com/v1/123456789012345/form_data").mock(
        side_effect=httpx.ReadTimeout("response lost")
    )
    client = Qun100Client(Settings(app_env="test"))

    with pytest.raises(Qun100SubmissionUnknown):
        await client.submit(
            "123456789012345",
            form_version=1,
            catalogs=[{"cid": "field", "type": "WORD", "value": "正常"}],
            token=TOKEN,
        )


@pytest.mark.asyncio
@respx.mock
async def test_qun100_success_without_data_is_still_confirmed() -> None:
    respx.post("https://form.qun100.com/v1/123456789012345/form_data").mock(
        return_value=httpx.Response(200, json={"code": 0, "message": "success"})
    )
    client = Qun100Client(Settings(app_env="test"))

    result = await client.submit(
        "123456789012345",
        form_version=1,
        catalogs=[{"cid": "field", "type": "WORD", "value": "正常"}],
        token=TOKEN,
    )

    assert result == {}
