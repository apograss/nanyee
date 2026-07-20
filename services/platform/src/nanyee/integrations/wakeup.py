from __future__ import annotations

import httpx

from nanyee.config import Settings


class WakeUpShareError(RuntimeError):
    pass


class WakeUpClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport

    async def share(self, schedule: str) -> str:
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    self._settings.wakeup_share_url,
                    data={"schedule": schedule},
                    headers={"version": "180", "User-Agent": "okhttp/3.14.9"},
                )
        except httpx.HTTPError as exc:
            raise WakeUpShareError("WakeUp request failed") from exc
        if response.status_code != 200 or len(response.content) > 64 * 1024:
            raise WakeUpShareError("WakeUp returned an invalid response")
        try:
            payload = response.json()
        except ValueError as exc:
            raise WakeUpShareError("WakeUp returned invalid JSON") from exc
        share_code = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(share_code, str) or not share_code or len(share_code) > 256:
            raise WakeUpShareError("WakeUp did not return a share code")
        return share_code
