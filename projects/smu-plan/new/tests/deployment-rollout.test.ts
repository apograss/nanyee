import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getCloudMailGatewayConfig,
  getVerificationDeliveryMode,
} from "@/lib/mail/cloudmail";

test("cloudmail gateway config normalizes base URL and takes precedence", () => {
  assert.equal(getCloudMailGatewayConfig({}), null);

  assert.deepEqual(
    getCloudMailGatewayConfig({
      CLOUDMAIL_GATEWAY_URL: "https://mail.nanyee.de/",
      CLOUDMAIL_GATEWAY_TOKEN: "shared-secret",
    }),
    {
      baseUrl: "https://mail.nanyee.de",
      token: "shared-secret",
    },
  );

  assert.equal(
    getVerificationDeliveryMode({
      CLOUDMAIL_GATEWAY_URL: "https://mail.nanyee.de/",
      CLOUDMAIL_GATEWAY_TOKEN: "shared-secret",
      RESEND_API_KEY: "re_fallback",
    }),
    "cloudmail",
  );

  assert.equal(
    getVerificationDeliveryMode({
      RESEND_API_KEYS: "re_first,re_second",
    }),
    "resend",
  );

  assert.equal(getVerificationDeliveryMode({}), "disabled");
});

test("maintenance page keeps clear UTF-8 chinese status copy", () => {
  const html = readFileSync(
    path.join(process.cwd(), "scripts", "nanyee-maintenance.html"),
    "utf8",
  );

  assert.match(html, /<meta charset="utf-8"/i);
  assert.match(html, /站点维护中/);
  assert.match(html, /CloudMail/);
  assert.match(html, /OIDC/);
});
