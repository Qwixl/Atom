import { createServer, type Server } from "node:http";
import path from "node:path";
import express from "express";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  COMMS_RECEIPT_PURPOSE,
  COORDINATION_PURPOSES,
  GAME_PURPOSES,
  ROOM_INVITE_PURPOSE,
  createContactInvite,
  decodeEncryptedObjectPayload,
  ACTION_PURPOSES,
  TRANSACTION_PURPOSES,
  QUALIFY_PURPOSES,
  CHANNEL_PURPOSES,
  COMMERCE_PURPOSES,
} from "@qwixl/a2a-transport";
import { createAtomA2aExpressApp } from "@qwixl/a2a-transport/server";
import { base64ToBytes, signDataObject, verifyDataObject, type UnsignedDataObject } from "@qwixl/protocol";
import { createRateLimiter } from "./rateLimit.js";
import { loadAgentBackendConfig, type AgentBackendConfig } from "./config.js";
import { publicBaseUrlForPort, resolvePortWithPrompt } from "./portConflict.js";
import { loadOrCreateAdminToken, requireAdminAuth, adminTokenPath, isAdminAuth, type AuthenticatedRequest } from "./adminAuth.js";
import { mintSessionToken, parseSessionTtlMs, isSessionScope, type SessionScope } from "./sessionToken.js";
import { agentConnectionPath, writeAgentConnectionFile } from "./agentConnectionFile.js";
import { registerAdminDataRoutes } from "./adminDataRoutes.js";
import { registerCustodyAdminRoutes } from "./custodyAdmin.js";
import { registerBrainAdminRoutes } from "./brainAdmin.js";
import { BrainScheduler } from "./brainScheduler.js";
import { registerPushAdminRoutes } from "./push/pushAdmin.js";
import { createReadOnlyConnectorExecutor } from "./readOnlyConnectorExecutor.js";
import { loadVoiceBackend } from "./voice/stubVoiceBackend.js";
import { registerVoiceAdminRoutes } from "./voice/voiceAdmin.js";
import { ConnectorVault } from "./connectorVault.js";
import { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import { MlsSessionRecordStore } from "./mlsSessionRecords.js";
import { RoomStore } from "./roomStore.js";
import { registerRoomsAdminRoutes, handleInboundRoomWire } from "./roomsAdmin.js";
import { seedCoffeeShopBrand, seedCoffeeShopKnowledge, seedCoffeeShopRoom } from "./communityCoffeeShop.js";
import { registerDiscoverAdminRoutes, registerDiscoverPublicRoutes } from "./discoverAdmin.js";
import { registerContactsAdminRoutes } from "./contactsAdmin.js";
import { TrustedAgentsStore } from "./trustedAgentsStore.js";
import { HandleCacheStore } from "./handleCache.js";
import { BudgetLedgerStore } from "./budgetLedger.js";
import { evaluateSpend, registerBillingAdminRoutes } from "./billingAdmin.js";
import { connectMlsPeer, reconnectStoredMlsPeers } from "./mlsReconnect.js";
import { registerActionAdminRoutes } from "./actionAdmin.js";
import { registerConnectorAdminRoutes } from "./connectorAdmin.js";
import { McpServersStore } from "./mcp/mcpServersStore.js";
import { McpRuntime } from "./mcp/mcpRuntime.js";
import { registerMcpAdminRoutes } from "./mcp/mcpAdmin.js";
import { registerCoordinationAdminRoutes } from "./coordinationAdmin.js";
import { CalendarFeedStore } from "./calendarFeedStore.js";
import {
  registerCalendarFeedAdminRoutes,
  registerCalendarFeedPublicRoutes,
  handleCalendarFeedInboxObject,
} from "./calendarFeedRoutes.js";
import { registerPaymentAdminRoutes } from "./paymentAdmin.js";
import { registerTransactionAdminRoutes } from "./transactionAdmin.js";
import { registerQualifyAdminRoutes } from "./qualifyAdmin.js";
import { registerChannelAdminRoutes } from "./channelAdmin.js";
import { registerBusinessAdminRoutes, syncContextPoliciesToKnowledge } from "./businessAdmin.js";
import { formatBusinessAgentPrompt } from "@qwixl/owner-store";
import { createBusinessKnowledgeBackend } from "./businessKnowledgeBackend.js";
import { BusinessCatalogStore } from "./businessCatalogStore.js";
import { BusinessContextStore } from "./businessContextStore.js";
import { BusinessVerificationStore } from "./businessVerificationStore.js";
import { BusinessStore } from "./businessStore.js";
import type { PaymentRail } from "./payment/types.js";
import { createStripePaymentRail, resolveStripeSecretKey } from "./payment/stripeRail.js";
import { TransactionCommitStore } from "./transactionCommitStore.js";
import { QualifyStore } from "./qualifyStore.js";
import { DisputeChannelStore } from "./disputeChannelStore.js";
import { deliverSignedObject } from "./deliverObject.js";
import { maybeSendDemoSchedulingProposal } from "./demoPeer.js";
import { maybeReplySwarmDm } from "./swarmDmReply.js";
import { maybePlaySwarmTtt } from "./swarmGameReply.js";
import { maybeAcceptSwarmRoomInvite } from "./swarmRoomInviteAccept.js";
import { sharedSwarmToolBudget } from "./swarmToolBudget.js";
import { DataObjectInbox } from "./inbox.js";
import { identityPath, loadOrCreateIdentity } from "./identity.js";
import {
  MlsSessionStore,
  peerDidFromContext,
  roomIdFromContext,
} from "./mlsSessions.js";

export interface StartAgentServerOptions {
  config?: AgentBackendConfig;
  /** Override payment rail (integration tests). */
  paymentRail?: PaymentRail;
}

export async function startAgentServer(options: StartAgentServerOptions = {}): Promise<Server> {
  let config = options.config ?? loadAgentBackendConfig();
  if (config.interactivePortResolve) {
    const port = await resolvePortWithPrompt({
      host: config.host,
      startPort: config.port,
      interactive: process.stdin.isTTY === true,
    });
    config = {
      ...config,
      port,
      publicBaseUrl: publicBaseUrlForPort(config.host, port),
    };
  }
  const identity = await loadOrCreateIdentity();
  const adminAuth = await loadOrCreateAdminToken();
  const connectorVault = new ConnectorVault();
  await connectorVault.load();
  const readOnlyConnectorExecutor = createReadOnlyConnectorExecutor(connectorVault);
  let swarmMemory: import("./swarmMemoryStore.js").SwarmMemoryStore | null = null;
  if (config.agentKind === "swarm-npc" || config.agentKind === "swarm-police") {
    const { resolveDataPath } = await import("./dataDir.js");
    const { SwarmMemoryStore } = await import("./swarmMemoryStore.js");
    swarmMemory = new SwarmMemoryStore(resolveDataPath("swarm-memory.sqlite"));
    await swarmMemory.load();
  }
  const swarmSeedId =
    process.env.ATOM_NPC_SEED_ID?.trim() ||
    (process.env.ATOM_DATA_DIR ? path.basename(process.env.ATOM_DATA_DIR) : undefined);
  const inbox = new DataObjectInbox();
  await inbox.load();
  const mlsStore = new MlsSessionStore();
  const sessionRecords = new MlsSessionRecordStore();
  await mlsStore.loadFromRecords(sessionRecords);
  const peerRecords = new MlsPeerRecordStore();
  await peerRecords.load();
  const rooms = new RoomStore();
  const handleCache = new HandleCacheStore();
  const budgetLedger = new BudgetLedgerStore();
  await rooms.load();
  const trustedAgents = new TrustedAgentsStore();
  await trustedAgents.load();
  const swarmSocial =
    config.agentKind === "swarm-npc"
      ? {
          identity,
          mlsStore,
          peerRecords,
          rooms,
          publicBaseUrl: config.publicBaseUrl,
          selfDisplayName: swarmMemory?.getCoreSheet()?.name,
        }
      : null;
  let socialStore: import("./swarmSocialDialogue.js").SwarmSocialDialogueStore | null = null;
  if (config.agentKind === "swarm-npc") {
    const { SwarmSocialDialogueStore } = await import("./swarmSocialDialogue.js");
    const { resolveDataPath } = await import("./dataDir.js");
    socialStore = new SwarmSocialDialogueStore(resolveDataPath("swarm-social.json"));
    socialStore.load();
  }

  const handleSwarmInboxObject = (object: import("@qwixl/protocol").DataObject): void => {
    void maybeReplySwarmDm(
      {
        agentKind: config.agentKind,
        identity,
        mlsStore,
        peerRecords,
        swarmMemory,
        swarmSeedId,
        swarmSocial,
        socialStore,
        connectorExecutor: readOnlyConnectorExecutor,
      },
      object,
    ).catch((error) => {
      console.warn(
        `[swarm-dm] reply failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    void maybeAcceptSwarmRoomInvite(
      {
        agentKind: config.agentKind,
        identity,
        mlsStore,
        peerRecords,
        rooms,
        publicBaseUrl: config.publicBaseUrl,
        selfDisplayName: swarmMemory?.getCoreSheet()?.name,
      },
      object,
    ).catch((error) => {
      console.warn(
        `[swarm-room] accept failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    void maybePlaySwarmTtt(
      {
        agentKind: config.agentKind,
        identity,
        mlsStore,
        peerRecords,
      },
      object,
    ).catch((error) => {
      console.warn(
        `[swarm-game] play failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  const calendarFeed = new CalendarFeedStore();
  await calendarFeed.load();
  calendarFeed.syncFromInbox(inbox.list());

  const mcpServersStore = new McpServersStore();
  await mcpServersStore.load();
  const mcpRuntime = new McpRuntime();

  const catalogStore = new BusinessCatalogStore();
  await catalogStore.load();
  const businessContextStore = new BusinessContextStore();
  await businessContextStore.load();
  const businessKnowledgeStore = createBusinessKnowledgeBackend({
    kind: config.businessKnowledgeBackend,
    remoteUrl: config.businessKnowledgeRemoteUrl,
  });
  await businessKnowledgeStore.load();
  syncContextPoliciesToKnowledge(businessContextStore, businessKnowledgeStore);

  const resolvePaymentRail = (): PaymentRail => {
    if (options.paymentRail) return options.paymentRail;
    const secretKey = resolveStripeSecretKey(config.stripeSecretKey);
    return createStripePaymentRail(secretKey, {
      productId: config.stripeProductId ?? undefined,
    });
  };

  const channelStore = new DisputeChannelStore({
    localDid: identity.did,
    identity,
    mlsStore,
  });
  await channelStore.load();

  const qualifyStore = new QualifyStore({
    localDid: identity.did,
    identity,
    mlsStore,
    onQualifyObject: (object) => {
      const transactionId = String(object.payload.transactionId ?? "").trim();
      if (transactionId) {
        channelStore.appendFromObject(transactionId, object);
      }
    },
  });
  await qualifyStore.load();

  const transactionStore = new TransactionCommitStore({
    localDid: identity.did,
    identity,
    mlsStore,
    resolveRail: resolvePaymentRail,
    recordChannelObject: (transactionId, object) => {
      channelStore.appendFromObject(transactionId, object);
    },
  });
  await transactionStore.load();

  const verificationStore = new BusinessVerificationStore(identity.did, config.businessDomain);
  const businessStore = new BusinessStore({
    localDid: identity.did,
    identity,
    mlsStore,
    catalog: catalogStore,
    businessMode: config.businessMode,
  });
  await businessStore.load();

  const verification = verificationStore.get();
  const agentCard = buildAtomAgentCard({
    name: config.agentName,
    description:
      config.agentKind === "swarm-npc"
        ? "Qwixl-operated Atom NPC — labeled swarm agent for venues and Discover."
        : config.agentKind === "swarm-police"
          ? "Qwixl Police-Agent — monitors swarm NPCs only; does not interact with humans."
          : config.businessMode
            ? "Atom business agent — catalog, signed offers, and commerce flow."
            : "Atom agent — signed data objects and MLS E2E over A2A.",
    baseUrl: config.publicBaseUrl,
    publisherDid: identity.did,
    business: verification
      ? {
          verificationTier: verification.tier,
          businessDomain: verification.businessDomain,
          tierLabel: verification.tierLabel,
        }
      : undefined,
    swarmKind:
      config.agentKind === "swarm-npc" || config.agentKind === "swarm-police"
        ? config.agentKind
        : undefined,
  });

  const inboxPurposes = [
    COMMS_MESSAGE_PURPOSE,
    COMMS_RECEIPT_PURPOSE,
    ROOM_INVITE_PURPOSE,
    ...COORDINATION_PURPOSES,
    ...GAME_PURPOSES,
    ...ACTION_PURPOSES,
    ...TRANSACTION_PURPOSES,
    ...QUALIFY_PURPOSES,
    ...CHANNEL_PURPOSES,
    ...COMMERCE_PURPOSES,
  ];
  const mlsPurposes = [
    COMMS_MESSAGE_PURPOSE,
    ROOM_INVITE_PURPOSE,
    ...COORDINATION_PURPOSES,
    ...GAME_PURPOSES,
    ...ACTION_PURPOSES,
    ...TRANSACTION_PURPOSES,
    ...QUALIFY_PURPOSES,
    ...CHANNEL_PURPOSES,
    ...COMMERCE_PURPOSES,
  ];

  const executor = new AtomDataObjectExecutor({
    identity,
    allowedPurposes: inboxPurposes,
    onReceive: (event) => {
      if (!trustedAgents.shouldAcceptInbound(event.object.issuerDid)) {
        console.log(`[contacts] dropped inbound from ${event.object.issuerDid} (block/mute policy)`);
        return;
      }
      inbox.push(event);
      handleCalendarFeedInboxObject(calendarFeed, event.object);
      void transactionStore.handleInboxObject(event.object).catch((error) => {
        console.warn(
          `[transaction] inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void qualifyStore.handleInboxObject(event.object).catch((error) => {
        console.warn(
          `[qualify] inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void channelStore.handleInboxObject(event.object).catch((error) => {
        console.warn(
          `[channel] inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void businessStore.handleInboxObject(event.object).catch((error) => {
        console.warn(
          `[business] inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      handleSwarmInboxObject(event.object);
      console.log(
        `[inbox] ${event.object.governance.purpose} from ${event.object.issuerDid} id=${event.object.id}`,
      );
    },
    onMlsHandshake: async (event) => {
      await mlsStore.acceptHandshake({
        localDid: identity.did,
        handshake: event.handshake,
      });
      peerRecords.remember(event.handshake.initiatorDid, event.handshake.initiatorEndpoint);
      console.log(`[mls] session established with ${event.handshake.initiatorDid}`);
      void maybeSendDemoSchedulingProposal({
        enabled: config.demoPeerMode,
        identity,
        mlsStore,
        peerRecords,
        peerDid: event.handshake.initiatorDid,
        peerEndpoint: event.handshake.initiatorEndpoint,
      }).catch((error) => {
        console.warn(
          `[demo-peer] proposal failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    },
    onMlsWire: async (event) => {
      const roomId = roomIdFromContext(event.contextId);
      if (roomId) {
        const senderDid = event.senderDid ?? peerDidFromContext(event.contextId);
        if (!senderDid) {
          throw new Error("Cannot resolve sender DID for room MLS message");
        }
        await handleInboundRoomWire({
          roomId,
          senderDid,
          wire: event.wire,
          mlsStore,
          rooms,
          localDid: identity.did,
        });
        console.log(`[rooms/mls] message in ${roomId} from ${senderDid}`);
        return;
      }
      const peerDid =
        peerDidFromContext(event.contextId) ??
        event.senderDid ??
        (mlsStore.listPeers().length === 1 ? mlsStore.listPeers()[0] : undefined);
      if (!peerDid) {
        throw new Error("Cannot resolve peer DID for MLS message (set contextId to mls:<did>)");
      }
      const plaintext = await mlsStore.decryptFrom(peerDid, event.wire);
      const object = decodeEncryptedObjectPayload(plaintext);
      const verified = await verifyDataObject(object, {
        allowedPurposes: mlsPurposes,
      });
      if (!trustedAgents.shouldAcceptInbound(verified.issuerDid)) {
        console.log(`[contacts] dropped MLS inbound from ${verified.issuerDid} (block/mute policy)`);
        return;
      }
      inbox.push({
        object: verified,
        contextId: event.contextId,
        messageId: event.messageId,
      });
      handleCalendarFeedInboxObject(calendarFeed, verified);
      void transactionStore.handleInboxObject(verified).catch((error) => {
        console.warn(
          `[transaction] mls inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void qualifyStore.handleInboxObject(verified).catch((error) => {
        console.warn(
          `[qualify] mls inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void channelStore.handleInboxObject(verified).catch((error) => {
        console.warn(
          `[channel] mls inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void businessStore.handleInboxObject(verified).catch((error) => {
        console.warn(
          `[business] mls inbox handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      handleSwarmInboxObject(verified);
      console.log(
        `[inbox/mls] ${verified.governance.purpose} from ${verified.issuerDid} id=${verified.id}`,
      );
    },
  });

  const a2aApp = createAtomA2aExpressApp({ agentCard, executor });
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && config.allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (typeof origin === "string" && config.allowedOrigins.has(origin)) {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(a2aApp);
  app.use("/discover/capabilities", createRateLimiter(60 * 1000, 60));
  registerCalendarFeedPublicRoutes(app, {
    publicBaseUrl: config.publicBaseUrl,
    calendarFeed,
    inbox,
  });
  registerDiscoverPublicRoutes(app, {
    identity,
    config,
    rooms,
    businessDomain: verification?.businessDomain ?? config.businessDomain,
  });

  const adminApp = express();
  adminApp.use(express.json({ limit: "512kb" }));
  const keyPackageRateLimit = createRateLimiter(60 * 1000, 30);
  adminApp.use(requireAdminAuth(adminAuth.token));

  adminApp.post("/admin/session-token", (req, res) => {
    if (!isAdminAuth(req as AuthenticatedRequest)) {
      res.status(403).json({ error: "Admin token required" });
      return;
    }
    const body = req.body as { scopes?: SessionScope[]; ttlSeconds?: number };
    const scopes =
      body.scopes?.filter(isSessionScope) ?? (["connector:read", "chat:agui"] as SessionScope[]);
    if (scopes.length === 0) {
      res.status(400).json({ error: "At least one valid session scope is required" });
      return;
    }
    const ttlMs = parseSessionTtlMs(body.ttlSeconds);
    res.json({
      token: mintSessionToken(adminAuth.token, { scopes, ttlMs }),
      scopes,
      expiresInSeconds: Math.floor(ttlMs / 1000),
    });
  });

  registerCoordinationAdminRoutes(adminApp, { identity, mlsStore, calendarFeed });
  registerCalendarFeedAdminRoutes(adminApp, {
    publicBaseUrl: config.publicBaseUrl,
    calendarFeed,
    inbox,
  });
  registerActionAdminRoutes(adminApp, { identity, mlsStore });
  registerPaymentAdminRoutes(adminApp, {
    identity,
    mlsStore,
    stripeSecretKey: config.stripeSecretKey,
    stripePublishableKey: config.stripePublishableKey,
    stripeProductId: config.stripeProductId,
    paymentRail: options.paymentRail,
  });
  registerBillingAdminRoutes(adminApp, {
    budgetLedger,
    stripeSecretKey: config.stripeSecretKey,
    platformFeeBps: 0,
    brainAlwaysOn: config.brainAlwaysOn,
    betaFree: process.env.ATOM_BETA_FREE !== "0" && process.env.ATOM_BETA_FREE !== "false",
    alwaysOnStripePriceId: process.env.ATOM_ALWAYS_ON_STRIPE_PRICE_ID?.trim() || null,
    checkoutSuccessUrl: process.env.ATOM_CHECKOUT_SUCCESS_URL?.trim() || null,
    checkoutCancelUrl: process.env.ATOM_CHECKOUT_CANCEL_URL?.trim() || null,
  });
  registerTransactionAdminRoutes(adminApp, {
    stripeSecretKey: config.stripeSecretKey,
    stripeProductId: config.stripeProductId,
    paymentRail: options.paymentRail,
    store: transactionStore,
    workspaceId: process.env.ATOM_WORKSPACE_ID?.trim() || "personal",
    applicationFeeMinor: 0,
    connectAccountId: process.env.ATOM_STRIPE_CONNECT_ACCOUNT_ID?.trim() || null,
    evaluateCommerceSpend: ({ amountMinor, currency }) =>
      evaluateSpend(
        { budgetLedger, stripeSecretKey: config.stripeSecretKey, platformFeeBps: 0 },
        {
          workspaceId: process.env.ATOM_WORKSPACE_ID?.trim() || "personal",
          category: "commerce",
          amountMinor,
          currency,
        },
      ),
    recordCommerceSpend: ({ amountMinor, currency, description }) => {
      budgetLedger.append({
        workspaceId: process.env.ATOM_WORKSPACE_ID?.trim() || "personal",
        category: "commerce",
        amountMinor,
        currency,
        description,
      });
    },
  });
  registerQualifyAdminRoutes(adminApp, { store: qualifyStore });
  registerChannelAdminRoutes(adminApp, { store: channelStore });
  registerBusinessAdminRoutes(adminApp, {
    catalog: catalogStore,
    context: businessContextStore,
    knowledge: businessKnowledgeStore,
    store: businessStore,
    verification: verificationStore,
    vault: connectorVault,
  });
  registerConnectorAdminRoutes(adminApp, {
    vault: connectorVault,
    publicBaseUrl: config.publicBaseUrl,
    allowedOrigins: config.allowedOrigins,
  });
  registerMcpAdminRoutes(adminApp, { store: mcpServersStore, runtime: mcpRuntime });
  registerCustodyAdminRoutes(adminApp, connectorVault);

  let banLadder: import("./banLadder.js").BanLadderStore | null = null;
  {
    const { resolveDataPath } = await import("./dataDir.js");
    const { BanLadderStore } = await import("./banLadder.js");
    banLadder = new BanLadderStore(resolveDataPath("ban-ladder.sqlite"));
    await banLadder.load();
  }
  const { registerSwarmAdminRoutes } = await import("./swarmAdmin.js");
  registerSwarmAdminRoutes(adminApp, {
    memory: swarmMemory,
    agentKind: config.agentKind,
    bans: banLadder,
    socialStore,
    socialAutonomy:
      config.agentKind === "swarm-npc" && socialStore
        ? {
            identity,
            mlsStore,
            peerRecords,
            publicBaseUrl: config.publicBaseUrl,
            swarmMemory,
            swarmSeedId,
            swarmSocial,
            socialStore,
            connectorExecutor: readOnlyConnectorExecutor,
          }
        : null,
    venuePresence:
      config.agentKind === "swarm-npc"
        ? {
            identity,
            mlsStore,
            rooms,
            peerRecords,
            publicBaseUrl: config.publicBaseUrl,
            swarmSeedId,
          }
        : null,
  });

  const brainScheduler = new BrainScheduler({
    vault: connectorVault,
    alwaysOn: config.brainAlwaysOn,
    killSwitch: config.killSwitch,
    intervalMs: config.brainIntervalMs,
    resolveNotification: async (intent, firedAt) => {
      const { loadLlmAgUiConfigFromEnv } = await import("./agUi/llmRunner.js");
      const { runBrainTurn } = await import("./brainTurn.js");
      const { recordLlmInferenceSpend } = await import("./llmSpendMeter.js");
      const { listConfiguredConnectorIds } = await import("./connectorRegistry.js");
      const llmConfig = loadLlmAgUiConfigFromEnv();
      const swarmRole = config.agentKind === "swarm-npc" || config.agentKind === "swarm-police";
      const connectedConnectorIds =
        llmConfig && !swarmRole ? await listConfiguredConnectorIds(connectorVault) : [];
      if (config.agentKind === "swarm-npc" && swarmMemory) {
        const { runSwarmReflectPass, runSwarmPlanPass } = await import("./swarmReflect.js");
        runSwarmReflectPass(swarmMemory, intent.title || intent.scope?.query || "venue plans");
        runSwarmPlanPass(
          swarmMemory,
          "coffee-shop",
          `Standing intent fired: ${intent.title}`,
        );
      }
      return runBrainTurn({
        intent,
        firedAt,
        llmConfig: llmConfig
          ? {
              ...llmConfig,
              agentKind: config.agentKind,
              atomConnectorsAvailable: !swarmRole,
              connectorExecutor: swarmRole ? undefined : readOnlyConnectorExecutor,
              connectedConnectorIds,
              onUsage: ({ promptTokens, completionTokens, model }) => {
                recordLlmInferenceSpend(budgetLedger, {
                  promptTokens,
                  completionTokens,
                  model,
                });
              },
            }
          : null,
      });
    },
  });
  registerBrainAdminRoutes(adminApp, { vault: connectorVault, scheduler: brainScheduler });
  registerPushAdminRoutes(adminApp, { vault: connectorVault });
  const voiceBackend = loadVoiceBackend();
  registerVoiceAdminRoutes(adminApp, voiceBackend);
  registerAdminDataRoutes(adminApp);
  registerRoomsAdminRoutes(adminApp, {
    identity,
    mlsStore,
    rooms,
    peerRecords,
    publicBaseUrl: config.publicBaseUrl,
  });
  registerDiscoverAdminRoutes(adminApp, {
    identity,
    config,
    rooms,
    businessDomain: verification?.businessDomain ?? config.businessDomain,
    handleCache,
  });
  registerContactsAdminRoutes(adminApp, { trustedAgents });

  adminApp.get("/health", (_req, res) => {
    res.json({
      ok: true,
      did: identity.did,
      inbox: inbox.count(),
      mlsPeers: mlsStore.listPeers(),
      mlsRooms: mlsStore.listRooms(),
      rooms: rooms.listRooms().length,
      stripeConfigured: Boolean(config.stripeSecretKey?.trim()),
    });
  });

  adminApp.get("/inbox", (_req, res) => {
    res.json({ entries: inbox.list() });
  });

  adminApp.get("/mls/key-package", keyPackageRateLimit, async (_req, res) => {
    try {
      const payload = await mlsStore.keyPackageForHandshake(identity.did);
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/mls/sessions", (_req, res) => {
    res.json({ peers: mlsStore.listPeers(), rooms: mlsStore.listRooms() });
  });

  adminApp.post("/invite", async (req, res) => {
    try {
      const body = req.body as { ttlSeconds?: number };
      const { token, object } = await createContactInvite({
        identity,
        endpoint: `${config.publicBaseUrl}/a2a/jsonrpc`,
        name: config.agentName,
        ttlSeconds: body?.ttlSeconds,
      });
      res.json({ token, expiresBy: object.governance.ttlSeconds, issuerDid: identity.did });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/mls/connect", async (req, res) => {
    try {
      const body = req.body as { peerUrl?: string; invite?: string; peerDid?: string };
      const result = await connectMlsPeer({
        mlsStore,
        peerRecords,
        localDid: identity.did,
        peerUrl: body.peerUrl ?? "",
        invite: body.invite,
        peerDid: body.peerDid,
        initiatorEndpoint: `${config.publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
      });
      res.json({ connected: result.connected, handshake: { initiatorDid: identity.did } });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  if (config.demoPeerMode) {
    adminApp.post("/demo/resend-proposal", async (req, res) => {
      try {
        const body = req.body as { peerDid?: string };
        const peerDid = body.peerDid?.trim();
        if (!peerDid) {
          res.status(400).json({ error: "peerDid required" });
          return;
        }
        const stored = peerRecords.list().find((peer) => peer.peerDid === peerDid);
        await maybeSendDemoSchedulingProposal({
          enabled: true,
          identity,
          mlsStore,
          peerRecords,
          peerDid,
          peerEndpoint: stored?.peerUrl,
        });
        res.json({ ok: true });
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  adminApp.post("/send", async (req, res) => {
    try {
      const body = req.body as {
        peerUrl?: string;
        peerDid?: string;
        message?: UnsignedDataObject;
        contextId?: string;
        encrypt?: boolean;
      };
      if (!body.peerUrl?.trim()) {
        res.status(400).json({ error: "peerUrl required" });
        return;
      }
      if (!body.message?.governance?.purpose || !body.message.semantic?.schema) {
        res.status(400).json({ error: "message (unsigned data object body) required" });
        return;
      }
      if (!trustedAgents.shouldAllowOutbound(body.peerDid?.trim())) {
        res.status(403).json({ error: "Contact is blocked — unblock to send messages" });
        return;
      }

      const object = await signDataObject(body.message, identity);

      const result = await deliverSignedObject({
        mlsStore,
        peerUrl: body.peerUrl,
        peerDid: body.peerDid,
        object,
        encrypt: body.encrypt,
        contextId: body.contextId,
      });
      res.json({ sent: { objectId: result.objectId, encrypted: result.encrypted }, object });
    } catch (error) {
      res.status(
        error instanceof Error && error.message.includes("MLS session") ? 409 : 502,
      ).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  adminApp.post("/agent", async (req, res) => {
    const { writeAgUiSse } = await import("./agUi/handler.js");
    const { loadLlmAgUiConfigFromEnv } = await import("./agUi/llmRunner.js");
    const input = req.body as import("@ag-ui/client").RunAgentInput;
    const llmConfig = loadLlmAgUiConfigFromEnv();
    const usesBusinessContext = config.businessMode || config.communityHostMode;
    let serverBusinessContext: string | undefined;
    if (usesBusinessContext) {
      const { brandLines } = businessContextStore.brandPolicyLines();
      let query = "";
      for (let i = input.messages.length - 1; i >= 0; i--) {
        const message = input.messages[i];
        if (message?.role === "user" && typeof message.content === "string") {
          query = message.content;
          break;
        }
      }
      const knowledgeSnippets = query
        ? businessKnowledgeStore.retrieveAsync
          ? await businessKnowledgeStore.retrieveAsync(query)
          : businessKnowledgeStore.retrieve(query)
        : [];
      serverBusinessContext = formatBusinessAgentPrompt({
        catalog: config.businessMode ? catalogStore.list() : [],
        brandLines,
        knowledgeSnippets,
      });
    }
    const { recordLlmInferenceSpend } = await import("./llmSpendMeter.js");
    const { listConfiguredConnectorIds } = await import("./connectorRegistry.js");
    const swarmNpc = config.agentKind === "swarm-npc";
    const connectedConnectorIds = llmConfig
      ? swarmNpc
        ? (["news-search", "page-fetch"] as const)
        : await listConfiguredConnectorIds(connectorVault)
      : [];
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    await writeAgUiSse((chunk) => res.write(chunk), input, {
      llmConfig: llmConfig
        ? {
            ...llmConfig,
            agentKind: config.agentKind,
            businessContext: serverBusinessContext?.trim() || undefined,
            atomConnectorsAvailable: true,
            connectorExecutor: readOnlyConnectorExecutor,
            connectedConnectorIds: [...connectedConnectorIds],
            swarmMemory: swarmNpc ? swarmMemory : null,
            swarmSeedId: swarmNpc ? swarmSeedId : undefined,
            swarmToolBudget: swarmNpc ? sharedSwarmToolBudget() : undefined,
            swarmSocial: swarmNpc ? swarmSocial : null,
            onUsage: ({ promptTokens, completionTokens, model }) => {
              recordLlmInferenceSpend(budgetLedger, {
                promptTokens,
                completionTokens,
                model,
              });
            },
          }
        : undefined,
    });
    res.end();
  });

  app.use(adminApp);

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.on("error", reject);
    server.listen(config.port, config.host, () => {
      console.log(`Atom agent ${identity.did}`);
      console.log(`  identity file: ${identityPath()}`);
      console.log(`  admin token:   ${adminAuth.isNew ? adminAuth.token : `(see ${adminTokenPath()})`}`);
      if (adminAuth.isNew) {
        console.log("  Save the admin token above — required as Authorization: Bearer <token> for shell admin API calls.");
      }
      void writeAgentConnectionFile({
        url: config.publicBaseUrl,
        token: adminAuth.token,
        did: identity.did,
        agentName: config.agentName,
      })
        .then(() => {
          console.log(`  connection:    ${agentConnectionPath()}`);
        })
        .catch((error) => {
          console.warn(
            `[atom] failed to write agent connection file: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      console.log(`  agent card:    ${config.publicBaseUrl}/.well-known/agent-card.json`);
      console.log(`  A2A JSON-RPC:  ${config.publicBaseUrl}/a2a/jsonrpc`);
      console.log(`  AG-UI:         POST ${config.publicBaseUrl}/agent (SSE; set LLM_API_KEY)`);
      console.log(`  admin inbox:   ${config.publicBaseUrl}/inbox`);
      console.log(`  invite:        POST ${config.publicBaseUrl}/invite { ttlSeconds? }`);
      console.log(`  MLS connect:   POST ${config.publicBaseUrl}/mls/connect { peerUrl | invite }`);
      console.log(`  admin send:    POST ${config.publicBaseUrl}/send { peerUrl, message, encrypt?, peerDid? }`);
      console.log(`  coordination:  POST ${config.publicBaseUrl}/coordination/* (scheduling, rsvp)`);
      console.log(
        `  webcal:        POST ${config.publicBaseUrl}/connectors/webcal/feeds (ICS feed URLs in vault)`,
      );
      console.log(
        `  publish feed:  GET ${config.publicBaseUrl}/calendar/feed.ics?token=… (accepted meetings)`,
      );
      console.log(`  actions:       POST ${config.publicBaseUrl}/actions/reserve`);
      console.log(
        `  payments:      POST ${config.publicBaseUrl}/payments/{hold,capture,release} (set STRIPE_SECRET_KEY)`,
      );
      console.log(
        `  transactions:  POST ${config.publicBaseUrl}/transactions/{offer,confirm,decline}`,
      );
      void reconnectStoredMlsPeers({ mlsStore, peerRecords, localDid: identity.did })
        .then((result) => {
          if (result.attempted > 0) {
            console.log(
              `[mls] reconnect peers attempted=${result.attempted} connected=${result.connected.length} failed=${result.failed.length}`,
            );
          }
        })
        .catch((error) => {
          console.warn(
            `[mls] reconnect on startup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      brainScheduler.start();
      console.log(
        `  brain:         heartbeat ${config.brainAlwaysOn ? "always-on" : "duty-cycled"} every ${config.brainIntervalMs}ms (GET /brain/status)`,
      );
      console.log(
        `  voice:         ${voiceBackend.id} (GET /voice/status)`,
      );
      const stopBrain = () => {
        brainScheduler.stop();
      };
      process.once("SIGINT", stopBrain);
      process.once("SIGTERM", stopBrain);
      if (config.communityHostMode) {
        void seedCoffeeShopBrand(businessContextStore)
          .then((brand) => {
            if (brand.seeded) {
              console.log("[rooms] Coffee Shop greeter brand voice seeded");
            }
          })
          .catch((error) => {
            console.warn(
              `[rooms] Coffee Shop brand seed failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        void seedCoffeeShopKnowledge(businessKnowledgeStore)
          .then((knowledge) => {
            if (knowledge.seeded) {
              console.log("[rooms] Coffee Shop knowledge base seeded");
            }
          })
          .catch((error) => {
            console.warn(
              `[rooms] Coffee Shop knowledge seed failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        void seedCoffeeShopRoom({ identity, mlsStore, rooms })
          .then((seed) => {
            console.log(
              `[rooms] Coffee Shop ${seed.created ? "created" : "ready"} at ${config.publicBaseUrl}/rooms/${encodeURIComponent(seed.roomId)}`,
            );
          })
          .catch((error) => {
            console.warn(
              `[rooms] Coffee Shop seed failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
      resolve(server);
    });
  });
}
