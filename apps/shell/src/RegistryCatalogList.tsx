import { useEffect, useState } from "react";
import { ModuleRegistry, modulePriceLabel, type RegistryModuleEntry } from "@qwixl/shell-core";

export function RegistryCatalogList({ indexUrl }: { indexUrl: string }) {
  const [modules, setModules] = useState<RegistryModuleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const registry = new ModuleRegistry({ indexUrl });
    void registry
      .loadIndex()
      .then((index) => {
        if (!cancelled) {
          setModules([...index.modules].sort((a, b) => a.id.localeCompare(b.id)));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setModules([]);
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

  return (
    <ul className="settings-registry-catalog">
      {modules.map((entry) => (
        <li key={`${entry.id}@${entry.version}`} className="settings-registry-catalog-item">
          <div className="settings-registry-catalog-main">
            <code>
              {entry.id}@{entry.version}
            </code>
            <span className="settings-registry-price">{modulePriceLabel(entry.pricing)}</span>
          </div>
          {entry.publisher ? (
            <span className="settings-registry-publisher">{entry.publisher}</span>
          ) : null}
          {entry.pricing?.model === "paid" && entry.pricing.purchaseUrl ? (
            <a
              className="settings-registry-purchase"
              href={entry.pricing.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Purchase (external)
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
