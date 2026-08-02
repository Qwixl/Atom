/**
 * Signup account-type selection (product law):
 * Exactly one of Personal, Developer, or Business at create time.
 * Users may add another workspace later — not during this signup.
 */
import type { AtomAccountType } from "./hostedAccount.js";

export type PersonaKind = "user" | "developer";

export class AccountTypeSelection {
  readonly persona: PersonaKind | null;
  readonly business: boolean;

  private constructor(persona: PersonaKind | null, business: boolean) {
    this.persona = persona;
    this.business = business;
  }

  static personal(): AccountTypeSelection {
    return new AccountTypeSelection("user", false);
  }

  static developer(): AccountTypeSelection {
    return new AccountTypeSelection("developer", false);
  }

  static businessOnly(): AccountTypeSelection {
    return new AccountTypeSelection(null, true);
  }

  static fromFlags(input: {
    personal: boolean;
    developer: boolean;
    business: boolean;
  }): AccountTypeSelection {
    const n = Number(input.personal) + Number(input.developer) + Number(input.business);
    if (n === 0) {
      throw new Error("Select one account type.");
    }
    if (n > 1) {
      throw new Error("Create one account type at a time.");
    }
    if (input.personal) return AccountTypeSelection.personal();
    if (input.developer) return AccountTypeSelection.developer();
    return AccountTypeSelection.businessOnly();
  }

  /** Primary value stored on profiles.account_type. */
  primaryAccountType(): AtomAccountType {
    if (this.persona) return this.persona;
    return "business";
  }

  wantsBusinessWorkspace(): boolean {
    return this.business;
  }

  wantsDeveloperWorkspace(): boolean {
    return this.persona === "developer";
  }

  toAccountTypes(): AtomAccountType[] {
    return [this.primaryAccountType()];
  }

  static fromAccountTypes(types: readonly AtomAccountType[]): AccountTypeSelection {
    const set = new Set(types);
    return AccountTypeSelection.fromFlags({
      personal: set.has("user"),
      developer: set.has("developer"),
      business: set.has("business"),
    });
  }
}
