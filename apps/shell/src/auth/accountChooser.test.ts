import { describe, expect, it } from "vitest";
import {
  chooserActions,
  emailsEqualIgnoreCase,
  mayClearLocalSignupState,
  resolveChooserIdentity,
  shouldBypassChooser,
  shouldShowChooser,
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

describe("shouldShowChooser", () => {
  it("shows for session or pending unless bypassed", () => {
    expect(shouldShowChooser({ bypass: true, hasSession: true, hasPending: true })).toBe(false);
    expect(shouldShowChooser({ bypass: false, hasSession: true, hasPending: false })).toBe(true);
    expect(shouldShowChooser({ bypass: false, hasSession: false, hasPending: true })).toBe(true);
    expect(shouldShowChooser({ bypass: false, hasSession: false, hasPending: false })).toBe(false);
  });
});

describe("resolveChooserIdentity", () => {
  it("prefers session and flags pending conflict", () => {
    expect(
      resolveChooserIdentity({
        sessionEmail: "a@example.com",
        pendingEmail: "b@example.com",
      }),
    ).toEqual({
      primaryEmail: "a@example.com",
      conflictEmail: "b@example.com",
      emailsMatch: false,
    });
    expect(
      resolveChooserIdentity({
        sessionEmail: "A@Example.com",
        pendingEmail: "a@example.com",
      }).emailsMatch,
    ).toBe(true);
    expect(
      resolveChooserIdentity({ sessionEmail: null, pendingEmail: "p@x.com" }).primaryEmail,
    ).toBe("p@x.com");
  });
});

describe("chooserActions", () => {
  it("unpaid register session offers Complete + Different", () => {
    const actions = chooserActions({
      mode: "register",
      hasSession: true,
      pendingKind: "register",
      provisionable: false,
    });
    expect(actions.map((a) => a.id)).toEqual(["complete_signup", "different_account"]);
  });

  it("pending-only offers Resume + Start over, not Log in as", () => {
    const actions = chooserActions({
      mode: "register",
      hasSession: false,
      pendingKind: "register",
      provisionable: null,
    });
    expect(actions.map((a) => a.id)).toEqual(["resume_pending", "start_over"]);
  });

  it("unpaid login session offers Finish payment then Different", () => {
    const actions = chooserActions({
      mode: "login",
      hasSession: true,
      pendingKind: null,
      provisionable: false,
    });
    expect(actions.map((a) => a.id)).toEqual(["complete_signup", "different_account"]);
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
    expect(emailsEqualIgnoreCase("a@x.com", "b@x.com")).toBe(false);
  });
});

describe("self_hosted continue semantics", () => {
  it("paid login continue is continue_session not complete_signup", () => {
    const actions = chooserActions({
      mode: "login",
      hasSession: true,
      pendingKind: null,
      provisionable: true,
    });
    expect(actions[0]?.id).toBe("continue_session");
  });
});
