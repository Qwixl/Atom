import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  loadFcmServiceAccount,
  resetFcmAccessTokenCacheForTests,
  sendFcmHttpV1,
} from "./fcmHttpV1.js";

function testServiceAccount() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    type: "service_account",
    project_id: "qwixl-atom-app",
    client_email: "firebase-adminsdk@qwixl-atom-app.iam.gserviceaccount.com",
    private_key: privateKey,
  };
}

afterEach(() => {
  resetFcmAccessTokenCacheForTests();
  vi.unstubAllGlobals();
});

describe("loadFcmServiceAccount", () => {
  it("loads from base64 env", () => {
    const sa = testServiceAccount();
    const b64 = Buffer.from(JSON.stringify(sa), "utf8").toString("base64");
    const loaded = loadFcmServiceAccount({ ATOM_FCM_SERVICE_ACCOUNT_B64: b64 });
    expect(loaded?.projectId).toBe("qwixl-atom-app");
    expect(loaded?.clientEmail).toContain("firebase-adminsdk");
    expect(loaded?.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("loads from inline JSON env", () => {
    const sa = testServiceAccount();
    const loaded = loadFcmServiceAccount({
      ATOM_FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(sa),
    });
    expect(loaded?.projectId).toBe("qwixl-atom-app");
  });
});

describe("sendFcmHttpV1", () => {
  it("mints OAuth then posts HTTP v1 message", async () => {
    const sa = testServiceAccount();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "ya29.test", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    await sendFcmHttpV1(
      {
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      },
      "device-token",
      { title: "Atom", body: "Hello", data: { url: "/app/" } },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenCall = fetchMock.mock.calls[0]!;
    expect(tokenCall[0]).toBe("https://oauth2.googleapis.com/token");
    const sendCall = fetchMock.mock.calls[1]!;
    expect(String(sendCall[0])).toContain(
      "https://fcm.googleapis.com/v1/projects/qwixl-atom-app/messages:send",
    );
    expect(sendCall[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer ya29.test",
      }),
    });
    const body = JSON.parse(String(sendCall[1].body)) as {
      message: { token: string; notification: { title: string } };
    };
    expect(body.message.token).toBe("device-token");
    expect(body.message.notification.title).toBe("Atom");
  });
});
