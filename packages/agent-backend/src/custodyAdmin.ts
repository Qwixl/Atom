import { randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { hashConsequentialAction } from "@qwixl/connector-custody";
import type { ConnectorVault } from "./connectorVault.js";

interface PendingApproval {
  actionHash: string;
  expiresAt: number;
}

const pendingApprovals = new Map<string, PendingApproval>();

function readOrigin(req: Request): string {
  const origin = req.get("origin")?.trim();
  if (origin) return origin;
  const referer = req.get("referer")?.trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:5200";
}

function rpConfig(origin: string): { rpID: string; rpName: string; origin: string } {
  const parsed = new URL(origin);
  const rpID = process.env.ATOM_WEBAUTHN_RP_ID?.trim() || parsed.hostname;
  return {
    rpID,
    rpName: process.env.ATOM_WEBAUTHN_RP_NAME?.trim() || "Atom Agent",
    origin,
  };
}

export function registerCustodyAdminRoutes(app: Express, vault: ConnectorVault): void {
  app.get("/custody/status", (_req, res) => {
    res.json({
      vaultReady: true,
      passkeyRegistered: vault.hasPasskey(),
      vaultOnlyCustody: true,
    });
  });

  app.post("/custody/webauthn/registration/options", async (req, res) => {
    try {
      const origin = readOrigin(req);
      const { rpID, rpName } = rpConfig(origin);
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: "atom-owner",
        userDisplayName: "Atom owner",
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      });
      res.json({ options, origin });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/custody/webauthn/registration/verify", async (req, res) => {
    try {
      const origin = readOrigin(req);
      const { rpID, origin: expectedOrigin } = rpConfig(origin);
      const body = req.body as {
        response?: RegistrationResponseJSON;
        challenge?: string;
      };
      if (!body.response || !body.challenge) {
        res.status(400).json({ error: "response and challenge required" });
        return;
      }
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: body.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        res.status(401).json({ error: "Passkey registration failed" });
        return;
      }
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      await vault.saveWebAuthnCredential({
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      });
      res.json({
        verified: true,
        credentialDeviceType,
        credentialBackedUp,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/custody/approval/options", async (req, res) => {
    try {
      if (!vault.hasPasskey()) {
        res.status(409).json({ error: "Register a passkey before approving consequential actions" });
        return;
      }
      const origin = readOrigin(req);
      const { rpID, origin: expectedOrigin } = rpConfig(origin);
      const body = req.body as {
        action?: {
          id: string;
          kind: string;
          title: string;
          terms: Record<string, string>;
        };
      };
      if (!body.action?.id) {
        res.status(400).json({ error: "action required" });
        return;
      }
      const actionId = body.action.id;
      const actionHash = hashConsequentialAction(body.action);
      pendingApprovals.set(actionId, {
        actionHash,
        expiresAt: Date.now() + 2 * 60_000,
      });
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: vault.listWebAuthnCredentials().map((cred) => ({
          id: cred.id,
          transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
        })),
      });
      res.json({ options, origin: expectedOrigin, actionId, actionHash });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/custody/unlock/options", async (req, res) => {
    try {
      if (!vault.hasPasskey()) {
        res.status(409).json({ error: "Register a passkey before unlocking local secrets" });
        return;
      }
      const origin = readOrigin(req);
      const { rpID, origin: expectedOrigin } = rpConfig(origin);
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: vault.listWebAuthnCredentials().map((cred) => ({
          id: cred.id,
          transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
        })),
      });
      res.json({ options, origin: expectedOrigin });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/custody/unlock/verify", async (req, res) => {
    try {
      const origin = readOrigin(req);
      const { rpID, origin: expectedOrigin } = rpConfig(origin);
      const body = req.body as {
        response?: AuthenticationResponseJSON;
        challenge?: string;
      };
      if (!body.response || !body.challenge) {
        res.status(400).json({ error: "response and challenge required" });
        return;
      }
      const credential = vault
        .listWebAuthnCredentials()
        .find((item) => item.id === body.response!.id);
      if (!credential) {
        res.status(401).json({ error: "Unknown passkey credential" });
        return;
      }
      const verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: body.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
        },
      });
      if (!verification.verified) {
        res.status(401).json({ error: "Passkey verification failed" });
        return;
      }
      await vault.updateWebAuthnCounter(credential.id, verification.authenticationInfo.newCounter);
      res.json({ unlocked: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/custody/approval/verify", async (req, res) => {
    try {
      const origin = readOrigin(req);
      const { rpID, origin: expectedOrigin } = rpConfig(origin);
      const body = req.body as {
        actionId?: string;
        actionHash?: string;
        response?: AuthenticationResponseJSON;
        challenge?: string;
      };
      if (!body.actionId || !body.actionHash || !body.response || !body.challenge) {
        res.status(400).json({ error: "actionId, actionHash, response, and challenge required" });
        return;
      }
      const pending = pendingApprovals.get(body.actionId);
      pendingApprovals.delete(body.actionId);
      if (!pending || pending.expiresAt < Date.now() || pending.actionHash !== body.actionHash) {
        res.status(400).json({ error: "Approval session expired or action mismatch" });
        return;
      }
      const credential = vault
        .listWebAuthnCredentials()
        .find((item) => item.id === body.response!.id);
      if (!credential) {
        res.status(401).json({ error: "Unknown passkey credential" });
        return;
      }
      const verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: body.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
        },
      });
      if (!verification.verified) {
        res.status(401).json({ error: "Passkey verification failed" });
        return;
      }
      await vault.updateWebAuthnCounter(credential.id, verification.authenticationInfo.newCounter);
      res.json({
        approved: true,
        approvalRef: `passkey:${body.actionId}:${randomBytes(8).toString("hex")}`,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/custody/store/records", (_req, res) => {
    res.json({ records: vault.getOwnerRecords() });
  });

  app.put("/custody/store/records", async (req, res) => {
    const body = req.body as { records?: unknown[] };
    if (!Array.isArray(body.records)) {
      res.status(400).json({ error: "records array required" });
      return;
    }
    await vault.setOwnerRecords(body.records);
    res.json({ ok: true, count: body.records.length });
  });

  app.get("/custody/store/proposals", (_req, res) => {
    res.json({ proposals: vault.getOwnerProposals() });
  });

  app.put("/custody/store/proposals", async (req, res) => {
    const body = req.body as { proposals?: unknown[] };
    if (!Array.isArray(body.proposals)) {
      res.status(400).json({ error: "proposals array required" });
      return;
    }
    await vault.setOwnerProposals(body.proposals);
    res.json({ ok: true, count: body.proposals.length });
  });

  app.get("/custody/store/attestations", (_req, res) => {
    res.json({ entries: vault.getAttestations() });
  });

  app.put("/custody/store/attestations", async (req, res) => {
    const body = req.body as { entries?: unknown[] };
    if (!Array.isArray(body.entries)) {
      res.status(400).json({ error: "entries array required" });
      return;
    }
    await vault.setAttestations(body.entries);
    res.json({ ok: true, count: body.entries.length });
  });

  app.get("/custody/store/chat-feed", (req, res) => {
    const workspaceId =
      typeof req.query.workspaceId === "string" && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : "personal";
    res.json({ feed: vault.getChatFeed(workspaceId) });
  });

  app.put("/custody/store/chat-feed", async (req, res) => {
    const body = req.body as { workspaceId?: string; feed?: unknown };
    const workspaceId = body.workspaceId?.trim() || "personal";
    if (!body.feed || typeof body.feed !== "object") {
      res.status(400).json({ error: "feed object required" });
      return;
    }
    await vault.setChatFeed(workspaceId, body.feed);
    res.json({ ok: true, workspaceId });
  });
}
