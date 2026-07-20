from __future__ import annotations

import argparse
import json
from pathlib import Path

from nanyee.config import Settings
from nanyee.main import create_app

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "openapi" / "openapi.json"


def render_openapi() -> str:
    settings = Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        allowed_hosts=["testserver", "localhost", "127.0.0.1"],
    )
    schema = create_app(settings).openapi()
    return json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Export the committed OpenAPI contract")
    parser.add_argument("--check", action="store_true", help="Fail when the schema has drifted")
    args = parser.parse_args()
    rendered = render_openapi()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != rendered:
            print("openapi/openapi.json is out of date")
            return 1
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
