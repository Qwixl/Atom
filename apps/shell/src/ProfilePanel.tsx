import { useState } from "react";
import {
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_CATALOG_CATEGORY,
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

/**
 * Owner profile editor: the user-visible face of the owner store. Everything
 * here is local to the owner's browser; guarded records are never shared
 * with a model without per-interaction chrome approval.
 */
function tierLabel(tier: PreferenceTier | undefined): string {
  return tier ?? "preference";
}

export function ProfilePanel({
  store,
  records,
  proposals,
  onChanged,
}: {
  store: OwnerStore;
  records: OwnerRecord[];
  proposals: RecordProposal[];
  onChanged: () => void;
}) {
  const [category, setCategory] = useState("preferences");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [guarded, setGuarded] = useState(false);
  const [catalogItemId, setCatalogItemId] = useState("");
  const [catalogLabel, setCatalogLabel] = useState("");
  const [catalogCurrency, setCatalogCurrency] = useState("EUR");
  const [catalogAmount, setCatalogAmount] = useState("");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

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
      setSyncStatus(`Synced ${items.length} item${items.length === 1 ? "" : "s"} to agent backend.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : String(error));
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

  return (
    <aside className="panel-view shell-profile">
      <div className="panel-body panel-body-scroll">
        <div className="panel-content panel-content-wide">
      <p className="panel-section-note">
        Stored only on this device. Open records are shared with your agent's model; guarded records
        require shell approval every time.
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
                    <span className={`shell-profile-badge shell-profile-badge-tier tier-${proposal.tier}`}>
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
      ) : null}

      <div className="panel-section shell-profile-business">
        <h3>Business catalog</h3>
        <p className="panel-section-note">
          Add sellable items, then sync to a business-mode agent backend. Brand voice uses{" "}
          <code>{BUSINESS_BRAND_CATEGORY}</code>; policies use <code>{BUSINESS_POLICY_CATEGORY}</code>.
        </p>
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
      </div>

      <div className="panel-section">
        <h3>Add record</h3>
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
        <input className="panel-input" value={label} placeholder="Label" onChange={(e) => setLabel(e.target.value)} />
        <input
          className="panel-input"
          value={value}
          placeholder="Value"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addRecord();
          }}
        />
        <button className="panel-btn panel-btn-primary" onClick={addRecord} disabled={!label.trim() || !value.trim()}>
          Add record
        </button>
        </div>
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
              <div key={record.id} className={`shell-profile-record${record.guarded ? " guarded" : ""}`}>
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
                  <span className="shell-profile-record-value">
                    {formatConditionalValue(record)}
                  </span>
                  {tags.length > 0 ? (
                    <span className="shell-profile-context-tags">context: {tags.join(", ")}</span>
                  ) : null}
                  {(record.evidence?.length ?? 0) > 0 ? (
                    <span className="shell-profile-evidence-note">
                      {record.evidence!.length} observation{record.evidence!.length === 1 ? "" : "s"}
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
        </div>
      </div>
    </aside>
  );
}
