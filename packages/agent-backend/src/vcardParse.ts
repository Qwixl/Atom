/** Minimal vCard 3/4 parser for CardDAV contact summaries — BK-18. */

export interface ContactSummary {
  uid?: string;
  name?: string;
  emails: string[];
  phones: string[];
  organization?: string;
}

function unfoldVcard(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function parsePropertyValue(line: string): string {
  const colon = line.indexOf(":");
  if (colon < 0) return "";
  return line.slice(colon + 1).trim();
}

function propertyName(line: string): string {
  const semi = line.indexOf(";");
  const colon = line.indexOf(":");
  const end = semi >= 0 && semi < colon ? semi : colon;
  if (end < 0) return line.trim().toUpperCase();
  return line.slice(0, end).trim().toUpperCase();
}

export function parseVCardBlock(block: string): ContactSummary | null {
  const unfolded = unfoldVcard(block.trim());
  if (!unfolded.includes("BEGIN:VCARD")) return null;

  const contact: ContactSummary = { emails: [], phones: [] };
  for (const line of unfolded.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "BEGIN:VCARD" || trimmed === "END:VCARD") continue;
    const name = propertyName(trimmed);
    const value = parsePropertyValue(trimmed);
    if (!value) continue;
    switch (name) {
      case "FN":
        contact.name ??= value;
        break;
      case "N":
        if (!contact.name) {
          const parts = value.split(";").filter(Boolean);
          contact.name = parts.reverse().join(" ").trim() || undefined;
        }
        break;
      case "UID":
        contact.uid ??= value;
        break;
      case "EMAIL":
        contact.emails.push(value);
        break;
      case "TEL":
        contact.phones.push(value);
        break;
      case "ORG":
        contact.organization ??= value.split(";")[0]?.trim() || undefined;
        break;
      default:
        break;
    }
  }

  if (!contact.name && contact.emails.length === 0 && contact.phones.length === 0) {
    return null;
  }
  return contact;
}

export function parseVCardContacts(vcardText: string): ContactSummary[] {
  const contacts: ContactSummary[] = [];
  const blocks = vcardText.split(/(?=BEGIN:VCARD)/i);
  for (const block of blocks) {
    const parsed = parseVCardBlock(block);
    if (parsed) contacts.push(parsed);
  }
  return contacts;
}
