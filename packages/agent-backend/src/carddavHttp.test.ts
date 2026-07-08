import { describe, expect, it } from "vitest";
import { normalizeCardDavAddressBookUrl, parseAddressDataFromMultistatus } from "./carddavHttp.js";

describe("carddavHttp", () => {
  it("normalizes address book URLs with trailing slash", () => {
    expect(normalizeCardDavAddressBookUrl("https://carddav.example.com/user/Default")).toBe(
      "https://carddav.example.com/user/Default/",
    );
  });

  it("parses address-data from multistatus XML", () => {
    const xml = `<multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <response>
    <C:address-data>BEGIN:VCARD
FN:Sam
END:VCARD</C:address-data>
  </response>
</multistatus>`;
    const chunks = parseAddressDataFromMultistatus(xml);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("FN:Sam");
  });
});
