/** CardDAV HTTP helpers (PROPFIND, addressbook-query REPORT) — BK-18. */

import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import { type CalDavAuth, caldavRequest } from "./caldavHttp.js";

export function normalizeCardDavAddressBookUrl(raw: string): string {
  const url = validateConnectorHttpsUrl(raw.trim());
  return url.endsWith("/") ? url : `${url}/`;
}

export function parseAddressDataFromMultistatus(xml: string): string[] {
  const chunks: string[] = [];
  const re = /<(?:C:|card:)address-data[^>]*>([\s\S]*?)<\/(?:C:|card:)address-data>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    chunks.push(
      raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"'),
    );
  }
  return chunks;
}

function addressBookQueryBody(query?: string): string {
  const filter = query?.trim()
    ? `<C:filter>
    <C:prop-filter name="FN">
      <C:text-match collation="i;unicode-casemap">${escapeXml(query.trim())}</C:text-match>
    </C:prop-filter>
  </C:filter>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <C:address-data/>
  </D:prop>
  ${filter}
</C:addressbook-query>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function reportAddressBookContacts(
  addressBookUrl: string,
  auth: CalDavAuth,
  query?: string,
): Promise<string[]> {
  const url = normalizeCardDavAddressBookUrl(addressBookUrl);
  const { text } = await caldavRequest(url, "REPORT", auth, addressBookQueryBody(query), {
    Depth: "1",
    "Content-Type": "application/xml; charset=utf-8",
  });
  return parseAddressDataFromMultistatus(text);
}

export async function propfindAddressBooks(
  addressBookUrl: string,
  auth: CalDavAuth,
): Promise<Array<{ href: string; name?: string }>> {
  const url = normalizeCardDavAddressBookUrl(addressBookUrl);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`;
  const { text } = await caldavRequest(url, "PROPFIND", auth, body, {
    Depth: "1",
    "Content-Type": "application/xml; charset=utf-8",
  });
  const books: Array<{ href: string; name?: string }> = [];
  const responseRe = /<(?:D:|d:)?response[\s>]([\s\S]*?)<\/(?:D:|d:)?response>/gi;
  let block: RegExpExecArray | null;
  while ((block = responseRe.exec(text)) !== null) {
    const chunk = block[1] ?? "";
    const hrefMatch = chunk.match(/<(?:D:|d:)?href[^>]*>([^<]+)<\/(?:D:|d:)?href>/i);
    const href = hrefMatch?.[1]?.trim();
    if (!href) continue;
    const nameMatch = chunk.match(
      /<(?:D:|d:)?displayname[^>]*>([\s\S]*?)<\/(?:D:|d:)?displayname>/i,
    );
    const name = nameMatch?.[1]?.trim();
    books.push({ href, name: name || undefined });
  }
  return books;
}
