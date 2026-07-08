import type { BusinessIndexEntry } from "@qwixl/business-index";
import {
  DEFAULT_DISCOVER_INDEXES,
  type DiscoverIndexConfig,
} from "./discoverIndexStorage.js";
import { REFERENCE_REGISTRY_PUBLISHER } from "./hostConfig.js";

export type DiscoverTrustBadge = "curated" | "third-party" | "unverified";

export interface DiscoverTrustSignals {
  badge: DiscoverTrustBadge;
  label: string;
  verificationTier: number;
  publisherDid?: string;
  indexLabel: string;
}

/** Default Atom indexes shipped with the shell — curated store. */
export function isCuratedDiscoverIndex(index: DiscoverIndexConfig | { label: string; url: string }): boolean {
  const defaults = new Set(DEFAULT_DISCOVER_INDEXES.map((row) => row.url));
  return defaults.has(index.url) || /qwixl\.com|\/business-index\/|\/community-index\//i.test(index.url);
}

export function discoverTrustSignals(
  entry: BusinessIndexEntry,
  indexLabel: string,
  indexUrl?: string,
): DiscoverTrustSignals {
  const curated =
    indexUrl != null
      ? isCuratedDiscoverIndex({ label: indexLabel, url: indexUrl })
      : DEFAULT_DISCOVER_INDEXES.some((row) => row.label === indexLabel);
  const publisherDid = entry.publisherDid?.trim() || undefined;
  /** Only the reference publisher DID is treated as known; arbitrary `did:` is not enough. */
  const trustedPublisher = publisherDid === REFERENCE_REGISTRY_PUBLISHER;
  const verificationTier = entry.verificationTier ?? 0;

  if (curated && verificationTier >= 1) {
    return {
      badge: "curated",
      label: entry.tierLabel?.trim() || `Curated · tier ${verificationTier}`,
      verificationTier,
      publisherDid,
      indexLabel,
    };
  }
  if (curated) {
    return {
      badge: "curated",
      label: "Curated",
      verificationTier,
      publisherDid,
      indexLabel,
    };
  }
  if (trustedPublisher && verificationTier >= 1) {
    return {
      badge: "third-party",
      label: entry.tierLabel?.trim() || `Owner index · tier ${verificationTier}`,
      verificationTier,
      publisherDid,
      indexLabel,
    };
  }
  return {
    badge: "unverified",
    label: "Unverified",
    verificationTier,
    publisherDid,
    indexLabel,
  };
}
