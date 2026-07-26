/**
 * Signup account-type selection (product law):
 * Personal XOR Developer; Business optional; at least one kind required.
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

  static personal(business = false): AccountTypeSelection {
    return new AccountTypeSelection("user", business);
  }

  static developer(business = false): AccountTypeSelection {
    return new AccountTypeSelection("developer", business);
  }

  static businessOnly(): AccountTypeSelection {
    return new AccountTypeSelection(null, true);
  }

  static fromFlags(input: {
    personal: boolean;
    developer: boolean;
    business: boolean;
  }): AccountTypeSelection {
    if (input.personal && input.developer) {
      throw new Error("Choose Personal or Developer, not both.");
    }
    if (!input.personal && !input.developer && !input.business) {
      throw new Error("Select at least one account type.");
    }
    if (input.personal) return AccountTypeSelection.personal(input.business);
    if (input.developer) return AccountTypeSelection.developer(input.business);
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
    const out: AtomAccountType[] = [];
    if (this.persona) out.push(this.persona);
    if (this.business) out.push("business");
    return out;
  }

  static fromAccountTypes(types: readonly AtomAccountType[]): AccountTypeSelection {
    const set = new Set(types);
    return AccountTypeSelection.fromFlags({
      personal: set.has("user"),
      developer: set.has("developer"),
      business: set.has("business"),
    });
  }

  withPersona(persona: PersonaKind | null): AccountTypeSelection {
    if (persona === null && !this.business) {
      throw new Error("Select at least one account type.");
    }
    return new AccountTypeSelection(persona, this.business);
  }

  withBusiness(business: boolean): AccountTypeSelection {
    if (!business && this.persona === null) {
      throw new Error("Select at least one account type.");
    }
    return new AccountTypeSelection(this.persona, business);
  }
}
