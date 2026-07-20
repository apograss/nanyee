from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ReservationPayload:
    account: str
    start: str
    end: str
    title: str
    dev_id: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "sysKind": 1,
            "appAccNo": self.account,
            "memberKind": 1,
            "resvBeginTime": self.start,
            "resvEndTime": self.end,
            "testName": self.title,
            "resvKind": 2,
            "resvProperty": 0,
            "appUrl": "",
            "resvMember": [self.account],
            "resvDev": [self.dev_id],
            "memo": "",
            "captcha": "",
            "addServices": [],
        }
