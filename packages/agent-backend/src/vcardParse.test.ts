import { describe, expect, it } from "vitest";
import { parseVCardBlock, parseVCardContacts } from "./vcardParse.js";

describe("vcardParse", () => {
  it("parses a simple vCard block", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
EMAIL;TYPE=INTERNET:jane@example.com
TEL;TYPE=CELL:+15551234567
ORG:Acme Corp
UID:abc-123
END:VCARD`;

    const contact = parseVCardBlock(vcard);
    expect(contact).toEqual({
      uid: "abc-123",
      name: "Jane Doe",
      emails: ["jane@example.com"],
      phones: ["+15551234567"],
      organization: "Acme Corp",
    });
  });

  it("unfolds folded property values", () => {
    const vcard = `BEGIN:VCARD
FN:Jane Doe
EMAIL:long
 @example.com
END:VCARD`;

    const contact = parseVCardBlock(vcard);
    expect(contact?.emails).toEqual(["long@example.com"]);
  });

  it("parses multiple cards from multistatus chunk", () => {
    const contacts = parseVCardContacts(`BEGIN:VCARD
FN:One
END:VCARD
BEGIN:VCARD
FN:Two
EMAIL:two@example.com
END:VCARD`);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("One");
    expect(contacts[1]?.emails).toEqual(["two@example.com"]);
  });
});
