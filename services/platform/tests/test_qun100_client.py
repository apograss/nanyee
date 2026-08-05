from __future__ import annotations

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.integrations.qun100 import Qun100Client, Qun100Rejected, Qun100SubmissionUnknown

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


@pytest.mark.asyncio
@respx.mock
async def test_qun100_resolves_direct_and_shared_form_links() -> None:
    client = Qun100Client(Settings(app_env="test"))
    assert await client.resolve_form_id("123456789012345") == "123456789012345"

    respx.get("https://qun100.com/share/abc").mock(
        return_value=httpx.Response(
            302,
            headers={"location": "https://form.qun100.com/open?formId%3D123456789012345"},
        )
    )
    assert await client.resolve_form_id("https://qun100.com/share/abc") == "123456789012345"


@pytest.mark.asyncio
@respx.mock
async def test_qun100_rejection_body_is_exposed_on_http_error() -> None:
    respx.post("https://form.qun100.com/v1/123456789012345/form_data").mock(
        return_value=httpx.Response(422, json={"code": 13399, "message": "表单已截止，无法提交"})
    )
    client = Qun100Client(Settings(app_env="test"))

    with pytest.raises(Qun100Rejected) as excinfo:
        await client.submit(
            "123456789012345",
            form_version=1,
            catalogs=[{"cid": "field", "type": "WORD", "value": "正常"}],
            token=TOKEN,
        )

    assert excinfo.value.code == 13399
    assert excinfo.value.message == "表单已截止，无法提交"


@pytest.mark.asyncio
@respx.mock
async def test_qun100_http_error_without_body_stays_unknown() -> None:
    respx.post("https://form.qun100.com/v1/123456789012345/form_data").mock(
        return_value=httpx.Response(502, text="bad gateway")
    )
    client = Qun100Client(Settings(app_env="test"))

    with pytest.raises(Qun100SubmissionUnknown):
        await client.submit(
            "123456789012345",
            form_version=1,
            catalogs=[{"cid": "field", "type": "WORD", "value": "正常"}],
            token=TOKEN,
        )
