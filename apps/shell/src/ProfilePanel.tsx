import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_CATALOG_CATEGORY,
  BUSINESS_KNOWLEDGE_CATEGORY,
  BUSINESS_POLICY_CATEGORY,
  catalogItemsFromStore,
  derivePreferenceWeights,
  formatRecordValue,
  formatConditionalValue,
  formatSplitProposal,
  activeContextTags,
  type OwnerRecord,
  type OwnerStore,
  type RecordProposal,
  type PreferenceTier,
} from "@qwixl/owner-store";
import { CommsAgentClient } from "./comms/client.js";
import { loadCommsAgentConfig } from "./comms/storage.js";
import { BusinessCatalogImportPanel } from "./business/BusinessCatalogImportPanel.js";
import { IconChevronRight } from "./shell/ShellIcons.js";
import {
  clearLocalAvatarBlob,
  loadLocalAvatarBlob,
  readFileAsDataUrl,
  saveLocalAvatarBlob,
} from "./profile/avatarStorage.js";
import { useDirtyForm } from "./ui/useDirtyForm.js";

/**
 * Owner profile editor: the user-visible face of the owner store. Everything
 * here is local to the owner's browser; guarded records are never shared
 * with a model without per-interaction chrome approval.
 */
function tierLabel(tier: PreferenceTier | undefined): string {
  return tier ?? "preference";
}

type ProfileSection = "about" | "overview" | "brand" | "policies" | "knowledge" | "catalog" | "records";

const IDENTITY_LABELS = {
  displayName: "Display name",
  handle: "Handle",
  bio: "About you",
  signature: "Signature",
  avatarUrl: "Photo URL",
} as const;

type IdentityField = keyof typeof IDENTITY_LABELS;

function identityValue(records: OwnerRecord[], field: IdentityField): string {
  const label = IDENTITY_LABELS[field];
  const record = records.find((r) => r.category === "identity" && r.label === label);
  if (!record) return "";
  return typeof record.value === "string" ? record.value : String(record.value ?? "");
}

export function ProfilePanel({
  store,
  records,
  proposals,
  onChanged,
  showBusinessSections = false,
  embeddedInSettings = false,
  lockedHandle,
  accountDisplayName,
}: {
  store: OwnerStore;
  records: OwnerRecord[];
  proposals: RecordProposal[];
  onChanged: () => void;
  /** Brand voice, policies, knowledge, and catalog — business agents only. */
  showBusinessSections?: boolean;
  /** When true, open About you immediately (Settings → Profile drill-down). */
  embeddedInSettings?: boolean;
  /** Registered @handle — display-only; cannot be changed after signup. */
  lockedHandle?: string;
  /** Display name from hosted profile when owner-store has none yet. */
  accountDisplayName?: string;
}) {
  const [displayName, setDisplayName] = useState(
    () => identityValue(records, "displayName") || accountDisplayName?.trim() || "",
  );
  const [handle, setHandle] = useState(() => identityValue(records, "handle"));
  const [bio, setBio] = useState(() => identityValue(records, "bio"));
  const [signature, setSignature] = useState(() => identityValue(records, "signature"));
  const [avatarUrl, setAvatarUrl] = useState(() => identityValue(records, "avatarUrl"));
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [identityNote, setIdentityNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedHandle = (lockedHandle?.trim() || identityValue(records, "handle")).replace(/^@/, "");
  const identityForm = useMemo(
    () => ({
      displayName: displayName.trim(),
      handle: resolvedHandle,
      bio: bio.trim(),
      signature: signature.trim(),
      avatarUrl: avatarUrl.trim(),
    }),
    [displayName, resolvedHandle, bio, signature, avatarUrl],
  );
  const { dirty: identityDirty, markClean: markIdentityClean } = useDirtyForm(identityForm);
  const [category, setCategory] = useState("preferences");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [guarded, setGuarded] = useState(false);
  const [catalogItemId, setCatalogItemId] = useState("");
  const [catalogLabel, setCatalogLabel] = useState("");
  const [catalogCurrency, setCatalogCurrency] = useState("EUR");
  const [catalogAmount, setCatalogAmount] = useState("");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [brandLabel, setBrandLabel] = useState("");
  const [brandValue, setBrandValue] = useState("");
  const [policyLabel, setPolicyLabel] = useState("");
  const [policyValue, setPolicyValue] = useState("");
  const [contextSyncStatus, setContextSyncStatus] = useState<string | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeCategory, setKnowledgeCategory] = useState<
    "policy" | "terms" | "faq" | "product" | "general"
  >("general");
  const [knowledgeBody, setKnowledgeBody] = useState("");
  const [knowledgeSyncStatus, setKnowledgeSyncStatus] = useState<string | null>(null);

  function businessContextFromRecords(source: OwnerRecord[]) {
    return source
      .filter(
        (record) =>
          !record.guarded &&
          (record.category === BUSINESS_BRAND_CATEGORY ||
            record.category === BUSINESS_POLICY_CATEGORY),
      )
      .map((record) => ({
        category: record.category as "business-brand" | "business-policy",
        label: record.label,
        value: formatRecordValue(record.value),
      }));
  }

  const brandRecords = records.filter((record) => record.category === BUSINESS_BRAND_CATEGORY);
  const policyRecords = records.filter((record) => record.category === BUSINESS_POLICY_CATEGORY);
  const knowledgeRecords = records.filter((record) => record.category === BUSINESS_KNOWLEDGE_CATEGORY);
  const contextRecords = businessContextFromRecords(records);

  function knowledgeBodyFromRecord(record: OwnerRecord): string {
    if (typeof record.value === "string") return record.value;
    if (typeof record.value === "object" && record.value !== null && "body" in record.value) {
      return String((record.value as { body?: unknown }).body ?? "");
    }
    return formatRecordValue(record.value);
  }

  function knowledgeCategoryFromRecord(record: OwnerRecord): string {
    if (typeof record.value === "object" && record.value !== null && "category" in record.value) {
      const category = (record.value as { category?: unknown }).category;
      return typeof category === "string" ? category : "general";
    }
    return "general";
  }

  function knowledgeDocumentsFromRecords(source: OwnerRecord[]) {
    return source
      .filter((record) => record.category === BUSINESS_KNOWLEDGE_CATEGORY && !record.guarded)
      .map((record) => ({
        id: record.id,
        title: record.label,
        category: knowledgeCategoryFromRecord(record) as
          | "policy"
          | "terms"
          | "faq"
          | "product"
          | "general",
        body: knowledgeBodyFromRecord(record),
      }))
      .filter((doc) => doc.title.trim() && doc.body.trim());
  }

  function addCatalogItem() {
    const amountMajor = Number(catalogAmount);
    if (!catalogItemId.trim() || !catalogLabel.trim() || !Number.isFinite(amountMajor) || amountMajor <= 0) {
      return;
    }
    const amountMinor = Math.round(amountMajor * 100);
    store.upsert({
      category: BUSINESS_CATALOG_CATEGORY,
      label: catalogLabel.trim(),
      value: {
        catalogItemId: catalogItemId.trim(),
        label: catalogLabel.trim(),
        amount: { currency: catalogCurrency.trim().toUpperCase() || "EUR", amountMinor },
        available: true,
      },
      guarded: false,
    });
    setCatalogItemId("");
    setCatalogLabel("");
    setCatalogAmount("");
    onChanged();
  }

  async function syncCatalogToAgent() {
    const config = loadCommsAgentConfig();
    const url = config.adminUrl;
    const items = catalogItemsFromStore(records);
    if (items.length === 0) {
      setSyncStatus("Add catalog items below before syncing.");
      return;
    }
    setSyncStatus("Syncing…");
    try {
      const client = new CommsAgentClient(url, config.adminToken);
      await client.syncBusinessCatalog(items);
      setSyncStatus(`Synced ${items.length} item${items.length === 1 ? "" : "s"} to your agent.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function addBrandRecord() {
    if (!brandLabel.trim() || !brandValue.trim()) return;
    store.upsert({
      category: BUSINESS_BRAND_CATEGORY,
      label: brandLabel.trim(),
      value: brandValue.trim(),
      guarded: false,
    });
    setBrandLabel("");
    setBrandValue("");
    onChanged();
  }

  function addPolicyRecord() {
    if (!policyLabel.trim() || !policyValue.trim()) return;
    store.upsert({
      category: BUSINESS_POLICY_CATEGORY,
      label: policyLabel.trim(),
      value: policyValue.trim(),
      guarded: false,
    });
    setPolicyLabel("");
    setPolicyValue("");
    onChanged();
  }

  async function syncContextToAgent() {
    const config = loadCommsAgentConfig();
    const url = config.adminUrl;
    const payload = businessContextFromRecords(records);
    if (payload.length === 0) {
      setContextSyncStatus("Add brand voice or policy records before syncing.");
      return;
    }
    setContextSyncStatus("Syncing…");
    try {
      const client = new CommsAgentClient(url, config.adminToken);
      await client.syncBusinessContext(payload);
      setContextSyncStatus(
        `Synced ${payload.length} record${payload.length === 1 ? "" : "s"} to your agent.`,
      );
    } catch (error) {
      setContextSyncStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function addKnowledgeDocument() {
    if (!knowledgeTitle.trim() || !knowledgeBody.trim()) return;
    store.upsert({
      category: BUSINESS_KNOWLEDGE_CATEGORY,
      label: knowledgeTitle.trim(),
      value: { category: knowledgeCategory, body: knowledgeBody.trim() },
      guarded: false,
    });
    setKnowledgeTitle("");
    setKnowledgeBody("");
    onChanged();
  }

  async function syncKnowledgeToAgent() {
    const config = loadCommsAgentConfig();
    const url = config.adminUrl;
    const documents = knowledgeDocumentsFromRecords(records);
    if (documents.length === 0) {
      setKnowledgeSyncStatus("Add knowledge documents before syncing.");
      return;
    }
    setKnowledgeSyncStatus("Syncing…");
    try {
      const client = new CommsAgentClient(url, config.adminToken);
      await client.syncBusinessKnowledge(documents);
      setKnowledgeSyncStatus(
        `Synced ${documents.length} document${documents.length === 1 ? "" : "s"} to agent knowledge base.`,
      );
    } catch (error) {
      setKnowledgeSyncStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function addRecord() {
    if (!label.trim() || !value.trim()) return;
    store.upsert({ category: category.trim() || "preferences", label, value, guarded });
    setLabel("");
    setValue("");
    onChanged();
  }

  const byCategory = new Map<string, OwnerRecord[]>();
  for (const record of records) {
    const list = byCategory.get(record.category) ?? [];
    list.push(record);
    byCategory.set(record.category, list);
  }

  const [activeSection, setActiveSection] = useState<ProfileSection>("about");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(embeddedInSettings);

  useEffect(() => {
    const nextName = identityValue(records, "displayName") || accountDisplayName?.trim() || "";
    const nextBio = identityValue(records, "bio");
    const nextSignature = identityValue(records, "signature");
    const nextAvatar = identityValue(records, "avatarUrl");
    setDisplayName(nextName);
    setHandle(resolvedHandle);
    setBio(nextBio);
    setSignature(nextSignature);
    setAvatarUrl(nextAvatar);
    markIdentityClean({
      displayName: nextName.trim(),
      handle: resolvedHandle,
      bio: nextBio.trim(),
      signature: nextSignature.trim(),
      avatarUrl: nextAvatar.trim(),
    });
  }, [records, resolvedHandle, accountDisplayName, markIdentityClean]);

  useEffect(() => {
    if (!resolvedHandle) return;
    const existing = identityValue(records, "handle").replace(/^@/, "");
    if (existing === resolvedHandle) return;
    const record = records.find(
      (r) => r.category === "identity" && r.label === IDENTITY_LABELS.handle,
    );
    store.upsert({
      id: record?.id,
      category: "identity",
      label: IDENTITY_LABELS.handle,
      value: resolvedHandle,
      guarded: true,
    });
    onChanged();
  }, [resolvedHandle, records, store, onChanged]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void loadLocalAvatarBlob().then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setAvatarPreview(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const navItems = useMemo(() => {
    const items: Array<{ id: ProfileSection; label: string; hint: string }> = [
      { id: "about", label: "About you", hint: "Name, photo, and signature" },
      { id: "overview", label: "Suggestions", hint: "Things your agent wants to remember" },
    ];
    if (showBusinessSections) {
      items.push(
        { id: "brand", label: "Brand voice", hint: "Tone and personality" },
        { id: "policies", label: "Policies", hint: "House rules and guidelines" },
        { id: "knowledge", label: "Knowledge", hint: "FAQs and reference docs" },
        { id: "catalog", label: "Catalog", hint: "Sellable items" },
      );
    }
    items.push({ id: "records", label: "Memory", hint: "Preferences and custom data" });
    return items;
  }, [showBusinessSections]);

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0]!;

  useEffect(() => {
    if (!navItems.some((item) => item.id === activeSection)) {
      setActiveSection("about");
      setMobileDetailOpen(false);
    }
  }, [activeSection, navItems]);

  function selectProfileSection(id: ProfileSection) {
    setActiveSection(id);
    setMobileDetailOpen(true);
  }

  function upsertIdentity(field: IdentityField, nextValue: string) {
    const trimmed = nextValue.trim();
    const existing = records.find(
      (r) => r.category === "identity" && r.label === IDENTITY_LABELS[field],
    );
    if (!trimmed) {
      if (existing) {
        store.remove(existing.id);
        onChanged();
      }
      return;
    }
    store.upsert({
      id: existing?.id,
      category: "identity",
      label: IDENTITY_LABELS[field],
      value: trimmed,
      guarded: true,
    });
    onChanged();
  }

  function saveIdentity() {
    upsertIdentity("displayName", displayName);
    if (resolvedHandle) upsertIdentity("handle", resolvedHandle);
    upsertIdentity("bio", bio);
    upsertIdentity("signature", signature);
    upsertIdentity("avatarUrl", avatarUrl);
    markIdentityClean({
      displayName: displayName.trim(),
      handle: resolvedHandle,
      bio: bio.trim(),
      signature: signature.trim(),
      avatarUrl: avatarUrl.trim(),
    });
    setIdentityNote("Saved.");
    window.setTimeout(() => setIdentityNote(null), 2000);
  }

  async function onAvatarSelected(file: File | null) {
    if (!file) return;
    setIdentityNote(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveLocalAvatarBlob(file);
      setAvatarUrl(dataUrl);
      upsertIdentity("avatarUrl", dataUrl);
      setAvatarPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return dataUrl;
      });
      markIdentityClean({
        displayName: displayName.trim(),
        handle: resolvedHandle,
        bio: bio.trim(),
        signature: signature.trim(),
        avatarUrl: dataUrl.trim(),
      });
      setIdentityNote("Photo saved locally and to your profile.");
      window.setTimeout(() => setIdentityNote(null), 2500);
    } catch (error) {
      setIdentityNote(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearAvatar() {
    await clearLocalAvatarBlob();
    setAvatarUrl("");
    setAvatarPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    upsertIdentity("avatarUrl", "");
    markIdentityClean({
      displayName: displayName.trim(),
      handle: resolvedHandle,
      bio: bio.trim(),
      signature: signature.trim(),
      avatarUrl: "",
    });
  }

  function renderAboutPanel() {
    const photoSrc = avatarPreview || avatarUrl.trim() || "";
    const initials = (displayName.trim() || resolvedHandle || "?").slice(0, 2).toUpperCase();
    return (
      <>
        <p className="panel-section-note">
          How you appear to your agent and in rooms. Identity details stay guarded — your agent only
          sees them when you approve.
        </p>
        <div className="profile-about-hero">
          <button
            type="button"
            className="profile-avatar profile-avatar--button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload profile photo"
          >
            {photoSrc ? (
              <img src={photoSrc} alt="" className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-initials">{initials}</span>
            )}
          </button>
          <div className="profile-about-hero-text">
            <strong>{displayName.trim() || "Add your name"}</strong>
            <span>{resolvedHandle ? `@${resolvedHandle}` : "Handle not set yet"}</span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="profile-avatar-file"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            void onAvatarSelected(file);
          }}
        />
        <div className="profile-avatar-actions">
          <button type="button" className="panel-btn" onClick={() => fileInputRef.current?.click()}>
            Upload photo
          </button>
          {photoSrc ? (
            <button type="button" className="panel-btn panel-btn-ghost" onClick={() => void clearAvatar()}>
              Remove
            </button>
          ) : null}
        </div>
        <label className="atom-field">
          <span className="atom-field-label">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you want to be called"
            autoComplete="nickname"
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Handle</span>
          <input
            value={resolvedHandle ? `@${resolvedHandle}` : ""}
            readOnly
            disabled
            placeholder="Set at registration"
            autoComplete="username"
          />
          <span className="settings-note">Your @handle is set at registration and cannot be changed.</span>
        </label>
        <label className="atom-field">
          <span className="atom-field-label">About you</span>
          <textarea
            className="panel-textarea"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short background your agent can use when introducing you"
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Signature</span>
          <textarea
            className="panel-textarea"
            rows={2}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Closing line for messages (optional)"
          />
        </label>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={!identityDirty}
            onClick={saveIdentity}
          >
            Save profile
          </button>
        </div>
        {identityNote ? <p className="settings-note">{identityNote}</p> : null}
      </>
    );
  }

  function renderOverviewPanel() {
    return (
      <>
        <p className="panel-section-note">
          When chat remembers something about you, it shows up here for you to accept or dismiss.
          Open records are shared with your agent; guarded ones need your approval each time.
        </p>
        {proposals.length > 0 ? (
          <div className="panel-section shell-profile-proposals">
            <h3>Curator proposals</h3>
            <p className="panel-section-note">
              Background extraction from your last Live LLM turn — approve to save, dismiss to discard.
            </p>
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className={`shell-profile-record proposal${proposal.guarded ? " guarded" : ""}`}
              >
                <div className="shell-profile-record-main">
                  <span className="shell-profile-record-label">
                    {proposal.label}
                    <span className="shell-profile-badge">{proposal.category}</span>
                    {proposal.guarded ? <span className="shell-profile-badge">guarded</span> : null}
                    {proposal.tier ? (
                      <span
                        className={`shell-profile-badge shell-profile-badge-tier tier-${proposal.tier}`}
                      >
                        {proposal.tier}
                      </span>
                    ) : null}
                  </span>
                  <span className="shell-profile-record-value">
                    {proposal.splitConditions?.length
                      ? formatSplitProposal(proposal)
                      : formatRecordValue(proposal.value)}
                  </span>
                  {proposal.splitConditions?.length ? (
                    <span className="shell-profile-badge">conditional split</span>
                  ) : null}
                  {proposal.reason ? (
                    <span className="shell-profile-proposal-reason">{proposal.reason}</span>
                  ) : null}
                </div>
                <div className="shell-profile-record-actions">
                  <button
                    className="panel-btn panel-btn-primary"
                    onClick={() => {
                      store.acceptProposal(proposal.id);
                      onChanged();
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="panel-btn"
                    onClick={() => {
                      store.rejectProposal(proposal.id);
                      onChanged();
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="shell-profile-empty">No pending curator proposals.</p>
        )}
      </>
    );
  }

  function renderBrandPanel() {
    return (
      <>
        <p className="panel-section-note">
          Tone and personality for your business agent&apos;s replies. Sync when you change these.
        </p>
        {brandRecords.length > 0 ? (
          <ul className="shell-profile-context-list">
            {brandRecords.map((record) => (
              <li key={record.id}>
                <strong>{record.label}</strong>
                <span>{formatRecordValue(record.value)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="panel-form-grid shell-profile-add">
          <input
            className="panel-input"
            value={brandLabel}
            placeholder="Label (e.g. Tone, Greeter role, Values)"
            onChange={(e) => setBrandLabel(e.target.value)}
          />
          <textarea
            className="panel-input shell-profile-textarea"
            value={brandValue}
            placeholder="Voice guidance for the agent model…"
            rows={3}
            onChange={(e) => setBrandValue(e.target.value)}
          />
          <button
            className="panel-btn panel-btn-primary"
            onClick={() => addBrandRecord()}
            disabled={!brandLabel.trim() || !brandValue.trim()}
          >
            Add brand record
          </button>
        </div>
      </>
    );
  }

  function renderPoliciesPanel() {
    return (
      <>
        <p className="panel-section-note">
          House rules and guidelines your agent can reference in conversation.
        </p>
        {policyRecords.length > 0 ? (
          <ul className="shell-profile-context-list">
            {policyRecords.map((record) => (
              <li key={record.id}>
                <strong>{record.label}</strong>
                <span>{formatRecordValue(record.value)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="panel-form-grid shell-profile-add">
          <input
            className="panel-input"
            value={policyLabel}
            placeholder="Label (e.g. House rules, Returns)"
            onChange={(e) => setPolicyLabel(e.target.value)}
          />
          <textarea
            className="panel-input shell-profile-textarea"
            value={policyValue}
            placeholder="Policy text the agent should honor…"
            rows={3}
            onChange={(e) => setPolicyValue(e.target.value)}
          />
          <button
            className="panel-btn panel-btn-primary"
            onClick={() => addPolicyRecord()}
            disabled={!policyLabel.trim() || !policyValue.trim()}
          >
            Add policy record
          </button>
          <button
            className="panel-btn"
            onClick={() => void syncContextToAgent()}
            disabled={contextRecords.length === 0}
          >
            Sync {contextRecords.length} brand/policy record{contextRecords.length === 1 ? "" : "s"} to
            agent
          </button>
          {contextSyncStatus ? <p className="panel-section-note">{contextSyncStatus}</p> : null}
        </div>
      </>
    );
  }

  function renderKnowledgePanel() {
    return (
      <>
        <p className="panel-section-note">
          Policies, FAQs, and reference docs your agent can look up during chat.
        </p>
        {knowledgeRecords.length > 0 ? (
          <ul className="shell-profile-context-list">
            {knowledgeRecords.map((record) => (
              <li key={record.id}>
                <strong>
                  {record.label}
                  <span className="shell-profile-badge">{knowledgeCategoryFromRecord(record)}</span>
                </strong>
                <span>{knowledgeBodyFromRecord(record)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="panel-form-grid shell-profile-add">
          <input
            className="panel-input"
            value={knowledgeTitle}
            placeholder="Document title (e.g. Returns policy, Terms of service)"
            onChange={(e) => setKnowledgeTitle(e.target.value)}
          />
          <select
            className="panel-input"
            value={knowledgeCategory}
            onChange={(e) =>
              setKnowledgeCategory(
                e.target.value as "policy" | "terms" | "faq" | "product" | "general",
              )
            }
          >
            <option value="policy">Policy</option>
            <option value="terms">Terms</option>
            <option value="faq">FAQ</option>
            <option value="product">Product</option>
            <option value="general">General</option>
          </select>
          <textarea
            className="panel-input shell-profile-textarea"
            value={knowledgeBody}
            placeholder="Document text your agent can search when answering questions…"
            rows={5}
            onChange={(e) => setKnowledgeBody(e.target.value)}
          />
          <button
            className="panel-btn panel-btn-primary"
            onClick={() => addKnowledgeDocument()}
            disabled={!knowledgeTitle.trim() || !knowledgeBody.trim()}
          >
            Add knowledge document
          </button>
          <button
            className="panel-btn"
            onClick={() => void syncKnowledgeToAgent()}
            disabled={knowledgeDocumentsFromRecords(records).length === 0}
          >
            Sync {knowledgeDocumentsFromRecords(records).length} document
            {knowledgeDocumentsFromRecords(records).length === 1 ? "" : "s"} to agent
          </button>
          {knowledgeSyncStatus ? <p className="panel-section-note">{knowledgeSyncStatus}</p> : null}
        </div>
      </>
    );
  }

  function renderCatalogPanel() {
    return (
      <>
        <p className="panel-section-note">
          Sellable items for commerce flows. Sync after editing; catalog is separate from brand voice.
        </p>
        <BusinessCatalogImportPanel />
        <div className="panel-form-grid shell-profile-add">
          <input
            className="panel-input"
            value={catalogItemId}
            placeholder="Item id (e.g. room-standard)"
            onChange={(e) => setCatalogItemId(e.target.value)}
          />
          <input
            className="panel-input"
            value={catalogLabel}
            placeholder="Label (e.g. Standard room · 2 nights)"
            onChange={(e) => setCatalogLabel(e.target.value)}
          />
          <div className="panel-form-grid panel-form-grid-2">
            <input
              className="panel-input"
              value={catalogCurrency}
              placeholder="EUR"
              onChange={(e) => setCatalogCurrency(e.target.value)}
            />
            <input
              className="panel-input"
              value={catalogAmount}
              placeholder="Price (e.g. 89.00)"
              onChange={(e) => setCatalogAmount(e.target.value)}
            />
          </div>
          <div className="panel-form-actions">
            <button
              className="panel-btn panel-btn-primary"
              onClick={() => void addCatalogItem()}
              disabled={!catalogItemId.trim() || !catalogLabel.trim() || !catalogAmount.trim()}
            >
              Add catalog item
            </button>
            <button className="panel-btn" onClick={() => void syncCatalogToAgent()}>
              Sync {catalogItemsFromStore(records).length} item(s) to agent
            </button>
          </div>
          {syncStatus ? <p className="panel-section-note">{syncStatus}</p> : null}
        </div>
      </>
    );
  }

  function renderRecordsPanel() {
    return (
      <>
        <p className="panel-section-note">
          Personal preferences and custom categories. Guarded records never leave this device without
          approval.
        </p>
        <div className="panel-form-grid shell-profile-add">
          <div className="panel-form-grid panel-form-grid-2">
            <input
              className="panel-input"
              value={category}
              placeholder="Category"
              onChange={(e) => setCategory(e.target.value)}
            />
            <label className="shell-profile-guarded">
              <input type="checkbox" checked={guarded} onChange={(e) => setGuarded(e.target.checked)} />
              Guarded
            </label>
          </div>
          <input
            className="panel-input"
            value={label}
            placeholder="Label"
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="panel-input"
            value={value}
            placeholder="Value"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addRecord();
            }}
          />
          <button
            className="panel-btn panel-btn-primary"
            onClick={addRecord}
            disabled={!label.trim() || !value.trim()}
          >
            Add record
          </button>
        </div>
        {records.length === 0 ? (
          <p className="shell-profile-empty">No records yet.</p>
        ) : (
          [...byCategory.entries()].map(([cat, group]) => (
            <div key={cat} className="shell-profile-group">
              <h3>{cat}</h3>
              {group.map((record) => {
                const tier = record.tier ?? "preference";
                const weights = derivePreferenceWeights(record.evidence ?? [], tier);
                const tags = activeContextTags(record.evidence ?? []);
                return (
                  <div
                    key={record.id}
                    className={`shell-profile-record${record.guarded ? " guarded" : ""}`}
                  >
                    <div className="shell-profile-record-main">
                      <span className="shell-profile-record-label">
                        {record.label}
                        {record.guarded ? <span className="shell-profile-badge">guarded</span> : null}
                        {!record.guarded ? (
                          <span className={`shell-profile-badge shell-profile-badge-tier tier-${tier}`}>
                            {tierLabel(record.tier)}
                          </span>
                        ) : null}
                        {record.guarded ? (
                          <span className="shell-profile-badge shell-profile-badge-guarded-hint">
                            not shared with model
                          </span>
                        ) : null}
                        {!record.guarded ? (
                          <span className="shell-profile-badge shell-profile-badge-weight">
                            conf {weights.confidence.toFixed(2)} · str {weights.strength.toFixed(2)}
                          </span>
                        ) : null}
                      </span>
                      <span className="shell-profile-record-value">{formatConditionalValue(record)}</span>
                      {tags.length > 0 ? (
                        <span className="shell-profile-context-tags">context: {tags.join(", ")}</span>
                      ) : null}
                      {(record.evidence?.length ?? 0) > 0 ? (
                        <span className="shell-profile-evidence-note">
                          {record.evidence!.length} observation
                          {record.evidence!.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                    <div className="shell-profile-record-actions">
                      <button
                        title={record.guarded ? "Make open" : "Make guarded"}
                        onClick={() => {
                          store.upsert({ ...record, guarded: !record.guarded });
                          onChanged();
                        }}
                      >
                        {record.guarded ? "unguard" : "guard"}
                      </button>
                      <button
                        title="Delete record"
                        onClick={() => {
                          store.remove(record.id);
                          onChanged();
                        }}
                      >
                        delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {records.length > 0 ? (
          <button
            className="panel-btn panel-btn-danger shell-profile-wipe"
            onClick={() => {
              store.wipe();
              onChanged();
            }}
          >
            Wipe all records
          </button>
        ) : null}
      </>
    );
  }

  function renderActivePanel() {
    switch (activeSection) {
      case "about":
        return renderAboutPanel();
      case "overview":
        return renderOverviewPanel();
      case "brand":
        return renderBrandPanel();
      case "policies":
        return renderPoliciesPanel();
      case "knowledge":
        return renderKnowledgePanel();
      case "catalog":
        return renderCatalogPanel();
      case "records":
        return renderRecordsPanel();
      default:
        return renderAboutPanel();
    }
  }

  return (
    <div className={`shell-profile${embeddedInSettings ? " shell-profile--embedded" : " panel-view"}`}>
      <div
        className={`profile-panel-layout${mobileDetailOpen ? " profile-panel-layout--detail" : " profile-panel-layout--list"}`}
      >
        <nav className="settings-nav profile-nav" aria-label="Profile sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item${activeSection === item.id ? " is-active" : ""}`}
              aria-current={activeSection === item.id ? "true" : undefined}
              onClick={() => selectProfileSection(item.id)}
            >
              <span className="settings-nav-label">{item.label}</span>
              <span className="settings-nav-hint">{item.hint}</span>
              <IconChevronRight className="settings-nav-chevron" />
            </button>
          ))}
        </nav>
        <div className="profile-panel-body panel-body-scroll">
          <div className="settings-panel profile-panel-content">
            <div className="settings-panel-head">
              <h3>{activeNav.label}</h3>
              <p className="settings-panel-desc">{activeNav.hint}</p>
            </div>
            <div className="settings-panel-fields">{renderActivePanel()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
