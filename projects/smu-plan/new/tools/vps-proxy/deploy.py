"""
Redeploy VPS proxy with path-based routing matching enrollProxyFetch.

enrollProxyFetch sends:
  POST http://VPS:8080/zhjw/path?query
  X-Cookie: cookie_string
  Content-Type: application/x-www-form-urlencoded
  body: form_data

Proxy needs to forward as:
  POST https://zhjw.smu.edu.cn/path?query
  Cookie: cookie_string
  body: form_data
  → returns response with X-Set-Cookie and X-Location headers
"""
import paramiko
import textwrap

HOST = "119.29.161.78"
USER = "ubuntu"
PASS = "_%fPZ6rcW(37A~k}"

PROXY_SCRIPT = textwrap.dedent(r'''
#!/usr/bin/env python3
"""
SMU Enrollment Proxy — path-based reverse proxy
Matches the CF Worker API format expected by enrollProxyFetch.

Routes:
  /zhjw/... → https://zhjw.smu.edu.cn/...
  /uis/...  → https://uis.smu.edu.cn/...

Headers:
  X-Cookie → forwarded as Cookie
  Response cookies → returned as X-Set-Cookie (JSON array)
  Location → returned as X-Location
"""
import http.server
import json
import urllib.request
import urllib.error
import ssl
from http.cookies import SimpleCookie

PORT = 8080

# Host mapping
HOSTS = {
    "/zhjw": "https://zhjw.smu.edu.cn",
    "/uis": "https://uis.smu.edu.cn",
}

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._proxy("GET")

    def do_POST(self):
        self._proxy("POST")

    def _proxy(self, method):
        try:
            # Find target host from path prefix
            target_base = None
            remaining_path = self.path
            for prefix, host in HOSTS.items():
                if self.path.startswith(prefix):
                    target_base = host
                    remaining_path = self.path[len(prefix):]
                    if not remaining_path:
                        remaining_path = "/"
                    break

            if not target_base:
                self._error(404, f"Unknown route: {self.path}")
                return

            target_url = f"{target_base}{remaining_path}"

            # Read body
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else None

            # Build headers — forward X-Cookie as Cookie
            req_headers = {}
            cookie = self.headers.get("X-Cookie", "")
            if cookie:
                req_headers["Cookie"] = cookie

            ct = self.headers.get("Content-Type", "")
            if ct:
                req_headers["Content-Type"] = ct

            req = urllib.request.Request(
                target_url,
                data=body,
                headers=req_headers,
                method=method,
            )

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            try:
                resp = urllib.request.urlopen(req, context=ctx, timeout=15)
                self._send_response(resp.status, resp.read(), resp.headers, resp.url)
            except urllib.error.HTTPError as e:
                self._send_response(e.code, e.read(), e.headers, getattr(e, 'url', ''))
            except urllib.error.URLError as e:
                self._error(502, f"Upstream: {e.reason}")

        except Exception as e:
            self._error(500, str(e))

    def _send_response(self, status, body, headers, final_url=""):
        self.send_response(status)
        self._cors()

        # Forward content type
        ct = headers.get("Content-Type", "text/html")
        self.send_header("Content-Type", ct)

        # Collect Set-Cookie headers → X-Set-Cookie JSON array
        set_cookies = headers.get_all("Set-Cookie") if hasattr(headers, 'get_all') else []
        if not set_cookies:
            # Fallback for http.client headers
            raw = str(headers)
            set_cookies = []
            for line in raw.split("\n"):
                if line.lower().startswith("set-cookie:"):
                    set_cookies.append(line.split(":", 1)[1].strip())

        if set_cookies:
            self.send_header("X-Set-Cookie", json.dumps(set_cookies))

        # Forward Location → X-Location
        location = headers.get("Location", "")
        if location:
            self.send_header("X-Location", location)

        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Cookie")
        self.send_header("Access-Control-Expose-Headers", "X-Set-Cookie, X-Location")

    def log_message(self, fmt, *args):
        print(f"[proxy] {args[0]} {args[1]} {args[2]}")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    print(f"[proxy] SMU Enrollment Proxy running on :{PORT}")
    print(f"[proxy] Routes: /zhjw → zhjw.smu.edu.cn, /uis → uis.smu.edu.cn")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] Shutdown.")
        server.shutdown()
''').strip()


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip(): print(out.strip())
    if err.strip() and "password" not in err.lower(): print(f"[stderr] {err.strip()}")
    return out.strip()


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
ssh.connect(HOST, username=USER, password=PASS, timeout=10)
print("Connected!\n")

# Upload updated proxy
print("=== Uploading updated proxy ===")
sftp = ssh.open_sftp()
with sftp.file("/home/ubuntu/enroll_proxy.py", "w") as f:
    f.write(PROXY_SCRIPT)
sftp.close()
print("✓ enroll_proxy.py updated\n")

# Restart service
print("=== Restarting service ===")
run(ssh, f'echo "{PASS}" | sudo -S systemctl restart enroll-proxy 2>/dev/null')

import time
time.sleep(2)

# Verify
print("\n=== Service status ===")
run(ssh, f'echo "{PASS}" | sudo -S systemctl is-active enroll-proxy 2>/dev/null')

print("\n=== Test: GET /zhjw/ ===")
run(ssh, 'curl -s -o /dev/null -w "HTTP %{http_code}, %{size_download} bytes" http://127.0.0.1:8080/zhjw/ 2>&1')

print("\n=== Test: POST /zhjw/ with X-Cookie ===")
run(ssh, 'curl -s -o /dev/null -w "HTTP %{http_code}, %{size_download} bytes" -X POST http://127.0.0.1:8080/zhjw/ -H "X-Cookie: test=1" 2>&1')

ssh.close()
print(f"\n✓ Proxy ready at http://{HOST}:{8080}")
print("⚠ User needs to open port 8080 in Tencent Cloud security group!")
