from __future__ import annotations

import copy
import json
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator

FORM_ID_PATTERN = re.compile(r"^\d{15,32}$")
SHANGHAI = ZoneInfo("Asia/Shanghai")


def validate_auth_token(value: str) -> str:
    token = value.strip()
    if (
        len(token) < 60
        or len(token) > 4096
        or "..." in token
        or "…" in token
        or any(character.isspace() for character in token)
    ):
        raise ValueError("invalid Qun100 authorization token")
    return token


class QunUserDefaults(BaseModel):
    display_name: str = Field(default="", max_length=100)
    default_lat: float | None = Field(default=None, ge=-90, le=90)
    default_lng: float | None = Field(default=None, ge=-180, le=180)
    default_address: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def require_complete_coordinates(self) -> QunUserDefaults:
        if (self.default_lat is None) != (self.default_lng is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class QunPreviewRequest(BaseModel):
    auth_token: SecretStr
    defaults: QunUserDefaults = Field(default_factory=QunUserDefaults)
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)

    @field_validator("auth_token")
    @classmethod
    def validate_token(cls, value: SecretStr) -> SecretStr:
        return SecretStr(validate_auth_token(value.get_secret_value()))

    @model_validator(mode="after")
    def limit_custom_fields(self) -> QunPreviewRequest:
        if len(self.custom_fields) > 200:
            raise ValueError("too many custom fields")
        encoded = json.dumps(
            self.custom_fields, ensure_ascii=False, separators=(",", ":"), default=str
        ).encode("utf-8")
        if len(encoded) > 32_768:
            raise ValueError("custom fields exceed 32 KiB")
        return self


class QunCatalogItem(BaseModel):
    cid: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=64)
    value: Any


class QunSubmitRequest(BaseModel):
    form_id: str
    form_version: str | int
    title: str = Field(default="", max_length=200)
    catalogs: list[QunCatalogItem] = Field(min_length=1, max_length=200)

    @field_validator("form_id")
    @classmethod
    def validate_form_id(cls, value: str) -> str:
        normalized = value.strip()
        if not FORM_ID_PATTERN.fullmatch(normalized):
            raise ValueError("invalid Qun100 form ID")
        return normalized


def build_payload(
    catalogs: list[dict[str, Any]],
    last_record: dict[str, Any] | None,
    defaults: QunUserDefaults,
    custom_fields: dict[str, Any],
    *,
    now: datetime | None = None,
) -> list[QunCatalogItem]:
    values = {
        str(item.get("cid")): item.get("value")
        for item in (last_record or {}).get("catalogs", [])
        if isinstance(item, dict) and item.get("cid") is not None
    }
    result: list[QunCatalogItem] = []
    for catalog in catalogs:
        cid = str(catalog.get("cid") or "")
        field_type = str(catalog.get("type") or "")
        if not cid or not field_type:
            continue
        custom = custom_fields.get(cid)
        previous = values.get(cid)
        value = _field_value(
            catalog,
            field_type,
            custom,
            previous,
            defaults,
            now=now,
        )
        result.append(QunCatalogItem(cid=cid, type=field_type, value=value))
    return result


def _field_value(
    catalog: dict[str, Any],
    field_type: str,
    custom: Any,
    previous: Any,
    defaults: QunUserDefaults,
    *,
    now: datetime | None,
) -> Any:
    if field_type == "LOCATION":
        return _location_value(catalog, custom, previous, defaults)
    if field_type == "IMAGE":
        value = custom if custom not in (None, "") else previous
        if value is None:
            return []
        return copy.deepcopy(value if isinstance(value, list) else [value])
    if field_type == "DATE":
        current = (now or datetime.now(SHANGHAI)).astimezone(SHANGHAI)
        return current.strftime("%Y-%m-%d %H:%M")
    if field_type in {"WORD", "TEXTAREA", "NUMBER", "NUMBER_FLOAT", "TELEPHONE", "ID_CARD"}:
        if _name_list_active(catalog) and defaults.display_name:
            return _resolve_name_list(catalog, defaults.display_name)
        selected = custom if custom not in (None, "") else previous
        return _resolve_name_list(catalog, selected) if selected not in (None, "") else ""
    if field_type in {"RADIO", "RADIO_V2"}:
        if custom not in (None, ""):
            return copy.deepcopy(custom)
        if previous not in (None, ""):
            return copy.deepcopy(previous)
        options = _config(catalog).get("OPTIONS", {}).get("content", [])
        first = options[0] if isinstance(options, list) and options else {}
        if not isinstance(first, dict):
            return ""
        return first.get("value") or first.get("label") or ""
    if field_type in {"CHECKBOX", "CHECKBOX_V2"}:
        selected = custom if isinstance(custom, list) else previous
        return copy.deepcopy(selected) if isinstance(selected, list) else []
    selected = custom if custom is not None else previous
    return copy.deepcopy(selected) if selected is not None else ""


def _location_value(
    catalog: dict[str, Any], custom: Any, previous: Any, defaults: QunUserDefaults
) -> Any:
    specified = _config(catalog).get("SPECIFIED_LOCATION", {})
    content = specified.get("content", {}) if isinstance(specified, dict) else {}
    locations = content.get("locations", []) if isinstance(content, dict) else []
    if specified.get("active") and isinstance(locations, list) and locations:
        location = locations[0]
        if isinstance(location, dict):
            return _location_object(
                _as_float(location.get("latitude")),
                _as_float(location.get("longitude")),
                str(location.get("address") or defaults.default_address),
                specified_address=str(location.get("specifiedAddress") or ""),
            )
    if isinstance(custom, dict):
        try:
            return _location_object(
                float(custom["lat"]),
                float(custom["lng"]),
                str(custom.get("address") or defaults.default_address),
            )
        except (KeyError, TypeError, ValueError):
            pass
    if defaults.default_lat is not None and defaults.default_lng is not None:
        return _location_object(
            defaults.default_lat,
            defaults.default_lng,
            defaults.default_address,
        )
    return copy.deepcopy(previous) if previous is not None else ""


def _location_object(
    latitude: float, longitude: float, address: str, *, specified_address: str | None = None
) -> dict[str, Any]:
    return {
        "address": address,
        "title": specified_address or address,
        "location": {"type": "Point", "coordinates": [longitude, latitude]},
        "specifiedAddress": specified_address or address,
        "setupLongitude": longitude,
        "setupLatitude": latitude,
        "setupAddress": address,
    }


def _as_float(value: object) -> float:
    if not isinstance(value, (str, int, float)):
        raise ValueError("invalid coordinate")
    return float(value)


def _config(catalog: dict[str, Any]) -> dict[str, Any]:
    value = catalog.get("config")
    return value if isinstance(value, dict) else {}


def _name_list_active(catalog: dict[str, Any]) -> bool:
    name_list = _config(catalog).get("NAME_LIST", {})
    return isinstance(name_list, dict) and bool(name_list.get("active"))


def _normalize_name(value: object) -> str:
    return re.sub(r"[\s()（）]", "", str(value or ""))


def _resolve_name_list(catalog: dict[str, Any], raw_name: object) -> str:
    name = str(raw_name or "").strip()
    config = _config(catalog)
    active_type = config.get("NAME_LIST_ACTIVE_TYPE", {})
    if not (
        _name_list_active(catalog)
        and isinstance(active_type, dict)
        and active_type.get("content") == "GROUP"
    ):
        return name
    name_list = config.get("NAME_LIST", {})
    content = name_list.get("content", {}) if isinstance(name_list, dict) else {}
    groups = content.get("groups", []) if isinstance(content, dict) else []
    candidates: list[tuple[int, str]] = []
    normalized = _normalize_name(name)
    for group in groups if isinstance(groups, list) else []:
        if not isinstance(group, dict) or group.get("status") == -1:
            continue
        group_id = str(group.get("groupId") or "").strip()
        group_name = _normalize_name(group.get("groupName"))
        for item in group.get("value", []):
            if not isinstance(item, dict) or item.get("status") == -1:
                continue
            item_name = str(item.get("name") or "").strip()
            if not group_id or not item_name:
                continue
            item_normalized = _normalize_name(item_name)
            score = 0
            if normalized == _normalize_name(f"{item_name}{group_id}"):
                score = 110
            elif normalized == f"{group_name}{item_normalized}":
                score = 100
            elif group_name in normalized and normalized.endswith(item_normalized):
                score = 90
            elif normalized == item_normalized:
                score = 70
            if score:
                candidates.append((score, f"{item_name} {group_id}"))
    candidates.sort(reverse=True)
    if not candidates:
        return name
    best_score = candidates[0][0]
    if best_score < 90 and sum(score == best_score for score, _ in candidates) > 1:
        return name
    return candidates[0][1]
