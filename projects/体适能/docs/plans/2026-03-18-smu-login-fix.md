# SMU Public Login Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Southern Medical University public login succeed reliably by normalizing credentials, trying the correct public school code, and surfacing meaningful auth failures.

**Architecture:** Keep the existing public/private auth split and patch only the public auth edge. Add one small helper module for input normalization and candidate school-code resolution, harden the public token fetcher so it can classify redirects and non-JSON payloads, then update the auth flow to fall back from `NFYKDX` to `smu` and persist the winning code.

**Tech Stack:** Python 3.14, httpx, SQLAlchemy async ORM, standard-library unittest/unittest.mock

---

### Task 1: Scaffold Regression Tests For Auth Helpers

**Files:**
- Create: `C:\Users\Liukai\.codex\projects\体适能\tests\__init__.py`
- Create: `C:\Users\Liukai\.codex\projects\体适能\tests\test_public_auth.py`

**Step 1: Write the failing tests**

```python
import unittest

from auth_utils import normalize_login_value, build_public_school_code_candidates


class PublicAuthHelperTests(unittest.TestCase):
    def test_normalize_login_value_removes_bom_and_whitespace(self):
        self.assertEqual(normalize_login_value("\ufeff3257043015 \n"), "3257043015")

    def test_build_public_school_code_candidates_prioritizes_existing_and_alias(self):
        self.assertEqual(
            build_public_school_code_candidates(1001, "NFYKDX"),
            ["NFYKDX", "smu"],
        )
```

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_public_auth.PublicAuthHelperTests -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'auth_utils'`

**Step 3: Write minimal implementation**

```python
def normalize_login_value(value: str) -> str:
    return value.lstrip("\ufeff").strip()


def build_public_school_code_candidates(school_id: int, school_code: str) -> list[str]:
    candidates = []
    for code in [school_code, "smu" if school_id == 1001 else None]:
        if code and code not in candidates:
            candidates.append(code)
    return candidates
```

**Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_public_auth.PublicAuthHelperTests -v`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/__init__.py tests/test_public_auth.py auth_utils.py
git commit -m "test: add public auth helper coverage"
```

### Task 2: Harden Public Token Response Parsing

**Files:**
- Modify: `C:\Users\Liukai\.codex\projects\体适能\TiShiNengSdkPublic.py`
- Modify: `C:\Users\Liukai\.codex\projects\体适能\tests\test_public_auth.py`

**Step 1: Write the failing tests**

```python
from unittest.mock import AsyncMock


class PublicTokenParsingTests(unittest.IsolatedAsyncioTestCase):
    async def test_redirect_response_is_reported_as_code_mismatch(self):
        client = make_public_client("NFYKDX")
        client.httpClient.post = AsyncMock(return_value=FakeResponse(302, "", ""))

        resp = await client.getAccessToken("3257043015", "lk2021lk!")

        self.assertEqual(resp["data"], "school_code_mismatch")

    async def test_html_response_is_reported_as_non_json_auth_response(self):
        client = make_public_client("smu")
        client.httpClient.post = AsyncMock(return_value=FakeResponse(200, "<html>login</html>", "text/html"))

        resp = await client.getAccessToken("3257043015", "lk2021lk!")

        self.assertEqual(resp["data"], "non_json_auth_response")
```

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_public_auth.PublicTokenParsingTests -v`

Expected: FAIL because `getAccessToken()` still tries `resp.json()` and raises `JSONDecodeError`

**Step 3: Write minimal implementation**

```python
if resp.status_code in (301, 302, 303, 307, 308):
    return {"code": resp.status_code, "msg": "认证入口重定向，学校 code 可能不匹配", "data": "school_code_mismatch"}

try:
    return resp.json()
except ValueError:
    text = resp.text[:120]
    return {"code": resp.status_code, "msg": f"认证服务返回非 JSON 响应: {text}", "data": "non_json_auth_response"}
```

**Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_public_auth.PublicTokenParsingTests -v`

Expected: PASS

**Step 5: Commit**

```bash
git add TiShiNengSdkPublic.py tests/test_public_auth.py
git commit -m "fix: classify public auth redirect responses"
```

### Task 3: Add Public School-Code Fallback And Persistence

**Files:**
- Modify: `C:\Users\Liukai\.codex\projects\体适能\tsnClient.py`
- Modify: `C:\Users\Liukai\.codex\projects\体适能\auth_utils.py`
- Modify: `C:\Users\Liukai\.codex\projects\体适能\tests\test_public_auth.py`

**Step 1: Write the failing tests**

```python
class PublicAuthFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_auth_retries_with_alias_and_persists_working_school_code(self):
        school = FakeSchoolModel(school_id=1001, school_code="NFYKDX", open_id="c929...")
        session = FakeSession(school=school)

        with patch("tsnClient.getSchoolBySchoolId", AsyncMock(return_value=school)), \
             patch("tsnClient.getTsnAccountByUid", AsyncMock(return_value=None)), \
             patch("tsnClient.addTsnAccount", AsyncMock()), \
             patch("tsnClient.TiShiNengSdkPublic", FakePublicSdkFactory([
                 {"code": 302, "msg": "认证入口重定向，学校 code 可能不匹配", "data": "school_code_mismatch"},
                 {"access_token": "token", "refresh_token": "refresh", "expires_in": 1, "user_id": "u1"},
                 {"studentId": "3257043015"},
             ])):
            uid = await tsnPasswordAuthServer(1001, "\ufeff3257043015", "lk2021lk!", session)

        self.assertEqual(uid, "u1")
        self.assertEqual(school.school_code, "smu")
```

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_public_auth.PublicAuthFlowTests -v`

Expected: FAIL because `tsnPasswordAuthServer()` only tries one `school_code` and does not normalize the username

**Step 3: Write minimal implementation**

```python
username = normalize_login_value(userName)
password = normalize_login_value(password)

for school_code in build_public_school_code_candidates(schoolModel.school_id, schoolModel.school_code):
    tsn = TiShiNengSdkPublic(...)
    login_resp = await tsn.getAccessToken(username, password)
    if login_resp.get("data") == "school_code_mismatch":
        continue
    if "msg" in login_resp:
        raise TiShiNengError(login_resp["msg"])
    schoolModel.school_code = school_code
    await session.flush()
    break
```

**Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_public_auth.PublicAuthFlowTests -v`

Expected: PASS

**Step 5: Commit**

```bash
git add auth_utils.py tsnClient.py tests/test_public_auth.py
git commit -m "fix: retry public auth with resolved school code"
```

### Task 4: Normalize CLI Inputs And Remove Duplicated Fallback Logic

**Files:**
- Modify: `C:\Users\Liukai\.codex\projects\体适能\main.py`
- Modify: `C:\Users\Liukai\.codex\projects\体适能\setup_and_auth.py`
- Modify: `C:\Users\Liukai\.codex\projects\体适能\tests\test_public_auth.py`

**Step 1: Write the failing tests**

```python
class ScriptInputTests(unittest.TestCase):
    def test_normalize_login_value_is_used_for_cli_inputs(self):
        self.assertEqual(normalize_login_value("\ufeff3257043015"), "3257043015")
```

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_public_auth.ScriptInputTests -v`

Expected: FAIL if the helper is not imported and used in both scripts

**Step 3: Write minimal implementation**

```python
from auth_utils import normalize_login_value

username = normalize_login_value(input("请输入用户名: "))
password = normalize_login_value(input("请输入密码: "))
```

Also remove the ad hoc `NFYKDX -> smu` retry block from `setup_and_auth.py`, because `tsnPasswordAuthServer()` now owns fallback behavior.

**Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_public_auth -v`

Expected: PASS

**Step 5: Commit**

```bash
git add main.py setup_and_auth.py tests/test_public_auth.py
git commit -m "fix: normalize CLI auth input handling"
```

### Task 5: Run Manual Verification Against The Live School Endpoint

**Files:**
- Verify: `C:\Users\Liukai\.codex\projects\体适能\setup_and_auth.py`
- Verify: `C:\Users\Liukai\.codex\projects\体适能\tsn_data.db`
- Verify: `C:\Users\Liukai\.codex\projects\体适能\.claude\docx\school-params.md`

**Step 1: Run the automated regression suite**

Run: `python -m unittest tests.test_public_auth -v`

Expected: PASS

**Step 2: Run live auth verification**

Run: `python setup_and_auth.py`

Expected: token exchange succeeds for account `3257043015`, without manually editing `school_code`

**Step 3: Verify persisted school code**

Run: `python - <<'PY'\nimport sqlite3\nconn = sqlite3.connect('tsn_data.db')\nprint(conn.execute(\"select school_id, school_code from tsn_school where school_id = 1001\").fetchone())\nPY`

Expected: `(1001, 'smu')`

**Step 4: Update the tracking note**

Append the successful login evidence and final behavior to `C:\Users\Liukai\.codex\projects\体适能\.claude\docx\school-params.md`.

**Step 5: Commit**

```bash
git add .claude/docx/school-params.md
git commit -m "docs: record verified smu login flow"
```
