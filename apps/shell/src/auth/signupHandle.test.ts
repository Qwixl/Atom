import { describe, expect, it } from "vitest";
import {
  buildHandleCheckUrl,
  friendlyHandleWriteError,
  maySetProfileHandle,
} from "./signupHandle.js";

describe("maySetProfileHandle", () => {
  it("blocks overwrite luke → testb", () => {
    const r = maySetProfileHandle({ existingHandle: "luke", requestedHandle: "testb" });
    expect(r.ok).toBe(false);
  });

  it("allows first set", () => {
    expect(maySetProfileHandle({ existingHandle: null, requestedHandle: "fresh" }).ok).toBe(true);
  });
});

describe("friendlyHandleWriteError", () => {
  it("maps postgres unique to taken copy", () => {
    expect(
      friendlyHandleWriteError('duplicate key value violates unique constraint "profiles_handle_key"'),
    ).toBe("That username is already taken");
  });

  it("maps immutable", () => {
    expect(friendlyHandleWriteError("handle_immutable")).toBe("Your username can’t be changed.");
  });
});

describe("buildHandleCheckUrl", () => {
  it("includes email and handle", () => {
    const url = buildHandleCheckUrl({
      controlPlaneBase: "https://cp.example",
      handle: "@TestB",
      email: "Support@Qwixl.com",
    });
    expect(url).toContain("email=support%40qwixl.com");
    expect(url).toContain("handle=");
  });
});
