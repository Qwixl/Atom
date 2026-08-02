import { describe, expect, it } from "vitest";
import {
  chooserActionButtonLabel,
  emailsEqualIgnoreCase,
  mayClearLocalSignupState,
  mayDiscardPendingAfterLoginWithSession,
  registerChooserActions,
  registerChooserBody,
  resolveRegisterChooserIdentity,
  shouldBypassChooser,
  shouldRenderRegisterChooser,
  shouldShowRegisterChooser,
} from "./accountChooser.js";

describe("shouldBypassChooser", () => {
  it("bypasses billing returns and resume/reload", () => {
    expect(
      shouldBypassChooser({ billing: "plan-success", resumeSetup: false, reloadMidSetup: false }),
    ).toBe(true);
    expect(
      shouldBypassChooser({ billing: "plan-cancel", resumeSetup: false, reloadMidSetup: false }),
    ).toBe(true);
    expect(
      shouldBypassChooser({ billing: null, resumeSetup: true, reloadMidSetup: false }),
    ).toBe(true);
    expect(
      shouldBypassChooser({ billing: null, resumeSetup: false, reloadMidSetup: true }),
    ).toBe(true);
    expect(
      shouldBypassChooser({ billing: null, resumeSetup: false, reloadMidSetup: false }),
    ).toBe(false);
  });
});

describe("shouldShowRegisterChooser", () => {
  it("never shows for login even with session and pending", () => {
    expect(
      shouldShowRegisterChooser({
        mode: "login",
        bypass: false,
        hasSession: true,
        hasPending: true,
        chooserResolved: false,
      }),
    ).toBe(false);
  });

  it("shows for register with session or pending unless bypassed or resolved", () => {
    expect(
      shouldShowRegisterChooser({
        mode: "register",
        bypass: false,
        hasSession: true,
        hasPending: false,
        chooserResolved: false,
      }),
    ).toBe(true);
    expect(
      shouldShowRegisterChooser({
        mode: "register",
        bypass: true,
        hasSession: true,
        hasPending: true,
        chooserResolved: false,
      }),
    ).toBe(false);
    expect(
      shouldShowRegisterChooser({
        mode: "register",
        bypass: false,
        hasSession: true,
        hasPending: true,
        chooserResolved: true,
      }),
    ).toBe(false);
  });
});

describe("shouldRenderRegisterChooser", () => {
  it("never renders on login even if phase is show (stale mount)", () => {
    expect(shouldRenderRegisterChooser({ mode: "login", chooserPhase: "show" })).toBe(false);
  });

  it("renders only for register + show", () => {
    expect(shouldRenderRegisterChooser({ mode: "register", chooserPhase: "show" })).toBe(true);
    expect(shouldRenderRegisterChooser({ mode: "register", chooserPhase: "done" })).toBe(false);
  });
});

describe("mayDiscardPendingAfterLoginWithSession", () => {
  it("requires live session and non-empty email before discard", () => {
    expect(
      mayDiscardPendingAfterLoginWithSession({ hasLiveSession: false, sessionEmail: "a@x.com" }),
    ).toBe(false);
    expect(
      mayDiscardPendingAfterLoginWithSession({ hasLiveSession: true, sessionEmail: "" }),
    ).toBe(false);
    expect(
      mayDiscardPendingAfterLoginWithSession({ hasLiveSession: true, sessionEmail: "a@x.com" }),
    ).toBe(true);
  });
});

describe("registerChooserActions", () => {
  it("conflict X≠Y offers four distinct actions", () => {
    const actions = registerChooserActions({
      hasSession: true,
      sessionEmail: "a@x.com",
      pendingKind: "register",
      pendingEmail: "b@y.com",
    });
    expect(actions.map((a) => a.id)).toEqual([
      "login_with_session",
      "continue_registration",
      "remove_registration",
      "create_new_account",
    ]);
  });

  it("same email omits duplicate Continue registration", () => {
    const actions = registerChooserActions({
      hasSession: true,
      sessionEmail: "a@x.com",
      pendingKind: "register",
      pendingEmail: "a@x.com",
    });
    expect(actions.map((a) => a.id)).toEqual([
      "login_with_session",
      "remove_registration",
      "create_new_account",
    ]);
  });

  it("pending-only offers Continue Remove Create new", () => {
    const actions = registerChooserActions({
      hasSession: false,
      sessionEmail: null,
      pendingKind: "register",
      pendingEmail: "p@x.com",
    });
    expect(actions.map((a) => a.id)).toEqual([
      "continue_registration",
      "remove_registration",
      "create_new_account",
    ]);
  });

  it("login-kind pending on register offers Remove + Create new only", () => {
    const actions = registerChooserActions({
      hasSession: false,
      sessionEmail: null,
      pendingKind: "login",
      pendingEmail: "p@x.com",
    });
    expect(actions.map((a) => a.id)).toEqual(["remove_registration", "create_new_account"]);
  });
});

describe("resolveRegisterChooserIdentity", () => {
  it("exposes both emails without preferring discard", () => {
    expect(
      resolveRegisterChooserIdentity({
        sessionEmail: "a@x.com",
        pendingEmail: "b@y.com",
      }),
    ).toEqual({
      sessionEmail: "a@x.com",
      pendingEmail: "b@y.com",
      emailsMatch: false,
    });
  });

  it("emailsMatch is false when only one side is present", () => {
    expect(
      resolveRegisterChooserIdentity({ sessionEmail: "a@x.com", pendingEmail: null }).emailsMatch,
    ).toBe(false);
  });
});

describe("registerChooserBody", () => {
  it("explains logged-in vs unfinished registration without Complete signup", () => {
    const copy = registerChooserBody({
      sessionEmail: "a@x.com",
      pendingEmail: "b@y.com",
      emailsMatch: false,
    });
    expect(copy).toContain("logged in as a@x.com");
    expect(copy).toContain("b@y.com");
    expect(copy.toLowerCase()).not.toContain("complete signup");
  });
});

describe("chooserActionButtonLabel", () => {
  it("includes email for login_with_session", () => {
    expect(
      chooserActionButtonLabel({
        action: {
          id: "login_with_session",
          label: "Log in with this account",
          email: "a@x.com",
          primary: true,
        },
      }),
    ).toBe("Log in with this account (a@x.com)");
  });
});

describe("mayClearLocalSignupState", () => {
  it("requires successful sign-out and gone session", () => {
    expect(mayClearLocalSignupState({ signOutSucceeded: true, sessionGone: true })).toBe(true);
    expect(mayClearLocalSignupState({ signOutSucceeded: false, sessionGone: true })).toBe(false);
    expect(mayClearLocalSignupState({ signOutSucceeded: true, sessionGone: false })).toBe(false);
  });
});

describe("emailsEqualIgnoreCase", () => {
  it("trims and ignores case", () => {
    expect(emailsEqualIgnoreCase(" A@x.com ", "a@x.com")).toBe(true);
    expect(emailsEqualIgnoreCase("a@x.com", "b@y.com")).toBe(false);
  });
});
