import { useEffect, useState } from "react";
import {
  ModuleRegistry,
  fetchRegistryRatings,
  formatStarRating,
  modulePriceLabel,
  validateHttpsUrl,
  type ModuleRatingSummary,
  type RegistryModuleEntry,
  type RegistryRatings,
} from "@qwixl/shell-core";
import {
  MODULE_ABUSE_CATEGORIES,
  submitModuleAbuseReport,
  submitModuleFeedback,
  type ModuleAbuseCategory,
} from "./moduleFeedback.js";
import {
  filterRegistryModulesByCategory,
  formatRegistryCategoryLabel,
  moduleRegistryTags,
  uniqueRegistryCategories,
} from "./moduleRegistryCategories.js";

function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <span className="module-rating-input" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={star <= value ? "module-rating-star module-rating-star-on" : "module-rating-star"}
          disabled={disabled}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function ModuleCatalogRow({
  entry,
  rating,
  onFeedbackSent,
}: {
  entry: RegistryModuleEntry;
  rating?: ModuleRatingSummary;
  onFeedbackSent: (note: string) => void;
}) {
  const isSystem = entry.tier === "system";
  const [panel, setPanel] = useState<"none" | "rate" | "report">("none");
  const [userRating, setUserRating] = useState(0);
  const [comment, setComment] = useState("");
  const [abuseCategory, setAbuseCategory] = useState<ModuleAbuseCategory>("other");
  const [abuseDetails, setAbuseDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendFeedback() {
    if (userRating < 1) return;
    setBusy(true);
    try {
      await submitModuleFeedback({
        moduleId: entry.id,
        version: entry.version,
        rating: userRating,
        comment,
      });
      setComment("");
      setPanel("none");
      onFeedbackSent("Thanks — your feedback was received.");
    } catch (error) {
      onFeedbackSent(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendAbuseReport() {
    setBusy(true);
    try {
      await submitModuleAbuseReport({
        moduleId: entry.id,
        version: entry.version,
        category: abuseCategory,
        details: abuseDetails,
        publisher: entry.publisher,
      });
      setAbuseDetails("");
      setPanel("none");
      onFeedbackSent("Abuse report queued for registry operators. Thank you.");
    } catch (error) {
      onFeedbackSent(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="settings-registry-catalog-item">
      <div className="settings-registry-catalog-main">
        <code>
          {entry.id}@{entry.version}
        </code>
        <span className="settings-registry-price">
          {isSystem ? "Core" : modulePriceLabel(entry.pricing)}
        </span>
      </div>
      {isSystem ? (
        <p className="settings-registry-meta">Included with Atom — always available, not rated.</p>
      ) : rating ? (
        <p className="settings-registry-meta">
          <span className="module-rating-display" aria-label={`${rating.average} out of 5 stars`}>
            {formatStarRating(rating.average)}
          </span>
          <span>
            {rating.average.toFixed(1)} ({rating.count} rating{rating.count === 1 ? "" : "s"})
          </span>
        </p>
      ) : (
        <p className="settings-registry-meta">No ratings yet.</p>
      )}
      {entry.publisher ? (
        <span className="settings-registry-publisher">{entry.publisher}</span>
      ) : null}
      <span className="settings-registry-category">
        {moduleRegistryTags(entry)
          .map((tag) => formatRegistryCategoryLabel(tag))
          .join(" · ")}
      </span>
      {entry.pricing?.model === "paid" && entry.pricing.purchaseUrl
        ? (() => {
            const purchaseUrl = validateHttpsUrl(entry.pricing.purchaseUrl);
            return purchaseUrl ? (
              <a
                className="settings-registry-purchase"
                href={purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Purchase (external)
              </a>
            ) : null;
          })()
        : null}
      {!isSystem ? (
        <div className="settings-registry-feedback">
          <button
            type="button"
            className="panel-btn panel-btn-ghost"
            onClick={() => setPanel((current) => (current === "rate" ? "none" : "rate"))}
          >
            {panel === "rate" ? "Cancel" : "Rate & feedback"}
          </button>
          <button
            type="button"
            className="panel-btn panel-btn-ghost"
            onClick={() => setPanel((current) => (current === "report" ? "none" : "report"))}
          >
            {panel === "report" ? "Cancel" : "Report"}
          </button>
          {panel === "rate" ? (
            <div className="settings-registry-feedback-form">
              <StarInput value={userRating} onChange={setUserRating} disabled={busy} />
              <textarea
                className="panel-textarea"
                rows={2}
                maxLength={2000}
                placeholder="Optional comment…"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="panel-btn"
                disabled={busy || userRating < 1}
                onClick={() => void sendFeedback()}
              >
                Submit
              </button>
            </div>
          ) : null}
          {panel === "report" ? (
            <div className="settings-registry-feedback-form">
              <label className="atom-field">
                <span className="atom-field-label">Category</span>
                <select
                  className="panel-select"
                  value={abuseCategory}
                  disabled={busy}
                  onChange={(event) => setAbuseCategory(event.target.value as ModuleAbuseCategory)}
                >
                  {MODULE_ABUSE_CATEGORIES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className="panel-textarea"
                rows={3}
                maxLength={2000}
                placeholder="What happened? Include URLs or steps if relevant…"
                value={abuseDetails}
                onChange={(event) => setAbuseDetails(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="panel-btn"
                disabled={busy}
                onClick={() => void sendAbuseReport()}
              >
                Submit report
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function RegistryCatalogList({
  indexUrl,
  onStatus,
}: {
  indexUrl: string;
  onStatus?: (note: string) => void;
}) {
  const [modules, setModules] = useState<RegistryModuleEntry[]>([]);
  const [category, setCategory] = useState<string | "all">("all");
  const [ratings, setRatings] = useState<RegistryRatings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const registry = new ModuleRegistry({ indexUrl, cache: false });
    void registry
      .loadIndex(true)
      .then(async (index) => {
        const ratingData = await fetchRegistryRatings(indexUrl, index.ratingsUrl);
        if (!cancelled) {
          setModules([...index.modules].sort((a, b) => a.id.localeCompare(b.id)));
          setRatings(ratingData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setModules([]);
          setRatings(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [indexUrl]);

  if (loading) {
    return <p className="settings-note">Loading module catalog…</p>;
  }
  if (error) {
    return <p className="settings-note settings-registry-error">{error}</p>;
  }
  if (modules.length === 0) {
    return <p className="settings-note">No modules in this registry index.</p>;
  }

  const categories = uniqueRegistryCategories(modules);
  const visible = filterRegistryModulesByCategory(modules, category);

  return (
    <>
      {categories.length > 1 ? (
        <label className="atom-field settings-registry-filter">
          <span className="atom-field-label">Category</span>
          <select
            className="panel-select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter modules by category"
          >
            <option value="all">All categories</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {formatRegistryCategoryLabel(entry)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {visible.length === 0 ? (
        <p className="settings-note">No modules in this category.</p>
      ) : (
        <ul className="settings-registry-catalog">
          {visible.map((entry) => (
            <ModuleCatalogRow
              key={`${entry.id}@${entry.version}`}
              entry={entry}
              rating={ratings?.modules[entry.id]}
              onFeedbackSent={(note) => onStatus?.(note)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
