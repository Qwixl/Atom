/**
 * Draft {{processing}} check 3: when a Governed Object arrived inside an MLS
 * session, `issuerDid` MUST equal the Agent Identity in the sending member's
 * MLS credential. Without this, any group member can re-present another
 * member's validly signed object.
 */
export function assertMlsSenderMatchesIssuer(
  issuerDid: string,
  mlsSenderDid: string,
): void {
  if (issuerDid !== mlsSenderDid) {
    throw new Error(
      `issuerDid ${issuerDid} does not match MLS sender ${mlsSenderDid}`,
    );
  }
}
