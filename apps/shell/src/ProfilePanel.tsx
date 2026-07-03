import { useState } from "react";
import { derivePreferenceWeights, formatRecordValue, activeContextTags, type OwnerRecord, type OwnerStore, type RecordProposal, type PreferenceTier } from "@atom/owner-store";

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
    <aside className="shell-profile">
      <h2>Owner profile</h2>
      <p className="shell-profile-note">
        Stored only on this device, in portable records you control. Open records are shared with
        your agent's model; <strong>guarded</strong> records require your approval in shell chrome,
        every time. Curator proposals appear below for your review before they enter the store.
      </p>

      {proposals.length > 0 ? (
        <div className="shell-profile-proposals">
          <h3>Curator proposals</h3>
          <p className="shell-profile-proposals-note">
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
                <span className="shell-profile-record-value">{formatRecordValue(proposal.value)}</span>
                {proposal.reason ? (
                  <span className="shell-profile-proposal-reason">{proposal.reason}</span>
                ) : null}
              </div>
              <div className="shell-profile-record-actions">
                <button
                  onClick={() => {
                    store.acceptProposal(proposal.id);
                    onChanged();
                  }}
                >
                  accept
                </button>
                <button
                  onClick={() => {
                    store.rejectProposal(proposal.id);
                    onChanged();
                  }}
                >
                  dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="shell-profile-add">
        <div className="shell-profile-add-row">
          <input
            value={category}
            placeholder="category (e.g. travel-history)"
            onChange={(e) => setCategory(e.target.value)}
          />
          <label className="shell-profile-guarded">
            <input type="checkbox" checked={guarded} onChange={(e) => setGuarded(e.target.checked)} />
            guarded
          </label>
        </div>
        <input value={label} placeholder="label (e.g. Favourite hotel)" onChange={(e) => setLabel(e.target.value)} />
        <input
          value={value}
          placeholder="value (e.g. Hotel Sacher, Vienna — loved it)"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addRecord();
          }}
        />
        <button className="atom-button" onClick={addRecord} disabled={!label.trim() || !value.trim()}>
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
                  <span className="shell-profile-record-value">{formatRecordValue(record.value)}</span>
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
          className="shell-profile-wipe"
          onClick={() => {
            store.wipe();
            onChanged();
          }}
        >
          Wipe all records
        </button>
      ) : null}
    </aside>
  );
}
