import {
  ATOM_COMMUNITY_RULES,
  ATOM_COMMUNITY_RULES_FOOTNOTE,
  ATOM_COMMUNITY_RULES_TITLE,
} from "./communityRulesContent.js";

type CommunityRulesModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CommunityRulesModal({ open, onClose }: CommunityRulesModalProps) {
  if (!open) return null;
  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="settings-dialog rooms-rules-dialog"
        role="dialog"
        aria-labelledby="atom-community-rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog-header">
          <h2 id="atom-community-rules-title">{ATOM_COMMUNITY_RULES_TITLE}</h2>
          <button type="button" className="panel-btn panel-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="settings-dialog-body rooms-rules-body">
          <ol className="rooms-rules-list">
            {ATOM_COMMUNITY_RULES.map((rule) => (
              <li key={rule.title}>
                <strong>{rule.title}</strong>
                <p>{rule.body}</p>
              </li>
            ))}
          </ol>
          <p className="settings-note">{ATOM_COMMUNITY_RULES_FOOTNOTE}</p>
        </div>
      </div>
    </div>
  );
}
