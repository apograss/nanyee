from __future__ import annotations

import httpx
import pytest
from nanyee.config import Settings
from nanyee.integrations.wakeup import WakeUpClient


@pytest.mark.asyncio
async def test_wakeup_share_uses_existing_protocol() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://i.wakeup.fun/share_schedule"
        assert request.headers["version"] == "180"
        assert b"schedule=" in request.content
        return httpx.Response(200, json={"data": "share-code"})

    client = WakeUpClient(
        Settings(app_env="test"),
        transport=httpx.MockTransport(handler),
    )
    assert await client.share("schedule-content") == "share-code"
