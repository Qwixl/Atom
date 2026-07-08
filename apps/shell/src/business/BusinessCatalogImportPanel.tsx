import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "../connectors/connectorWriteApproval.js";
import { loadCommsAgentConfig } from "../comms/storage.js";
import { CommsAgentClient } from "../comms/client.js";

export function BusinessCatalogImportPanel() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shopifyConfigured, setShopifyConfigured] = useState(false);
  const [wooConfigured, setWooConfigured] = useState(false);
  const [shopifyShop, setShopifyShop] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const [wooCurrency, setWooCurrency] = useState("USD");

  const refresh = useCallback(async () => {
    const config = loadCommsAgentConfig();
    if (!config.adminToken?.trim()) return;
    try {
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      const status = await client.getBusinessStoreStatus();
      setShopifyConfigured(Boolean(status.shopify?.configured));
      setWooConfigured(Boolean(status.woocommerce?.configured));
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveShopify() {
    const shop = shopifyShop.trim();
    const token = shopifyToken.trim();
    if (!shop || !token) return;
    setBusy(true);
    setNote("Saving Shopify credentials to agent vault…");
    try {
      const config = loadCommsAgentConfig();
      const approvalRef = await approvalRefForConnectorWrite("Save Shopify store token", { shop }, config);
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      await client.saveShopifyStore({ shop, accessToken: token, approvalRef });
      setShopifyToken("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function importShopify() {
    setBusy(true);
    setNote("Importing products from Shopify…");
    try {
      const config = loadCommsAgentConfig();
      const approvalRef = await approvalRefForConnectorWrite("Import Shopify catalog", { source: "shopify" }, config);
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      const result = await client.importShopifyCatalog({ approvalRef });
      setNote(`Imported ${result.importedCount} item(s) from Shopify (${result.currency}).`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveWooCommerce() {
    const url = wooUrl.trim();
    const key = wooKey.trim();
    const secret = wooSecret.trim();
    if (!url || !key || !secret) return;
    setBusy(true);
    setNote("Saving WooCommerce credentials to agent vault…");
    try {
      const config = loadCommsAgentConfig();
      const approvalRef = await approvalRefForConnectorWrite("Save WooCommerce store tokens", { storeUrl: url }, config);
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      await client.saveWooCommerceStore({ storeUrl: url, consumerKey: key, consumerSecret: secret, approvalRef });
      setWooKey("");
      setWooSecret("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function importWooCommerce() {
    setBusy(true);
    setNote("Importing products from WooCommerce…");
    try {
      const config = loadCommsAgentConfig();
      const approvalRef = await approvalRefForConnectorWrite("Import WooCommerce catalog", { source: "woocommerce" }, config);
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      const result = await client.importWooCommerceCatalog({
        approvalRef,
        currency: wooCurrency.trim() || undefined,
      });
      setNote(`Imported ${result.importedCount} item(s) from WooCommerce (${result.currency}).`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-subsection shell-profile-import">
      <h4>Import from store</h4>
      <p className="panel-section-note">
        Paste merchant API tokens — stored encrypted on your agent. Import replaces the agent catalog and upserts product knowledge docs.
      </p>

      <div className="connectors-token-row">
        <strong>Shopify {shopifyConfigured ? "(connected)" : ""}</strong>
        <input
          className="panel-input"
          placeholder="Shop (my-store or my-store.myshopify.com)"
          value={shopifyShop}
          onChange={(e) => setShopifyShop(e.target.value)}
          disabled={busy}
        />
        <input
          className="panel-input"
          type="password"
          placeholder="Admin API access token"
          value={shopifyToken}
          onChange={(e) => setShopifyToken(e.target.value)}
          disabled={busy}
        />
        <div className="panel-form-actions">
          <button type="button" className="panel-btn" disabled={busy || !shopifyShop.trim() || !shopifyToken.trim()} onClick={() => void saveShopify()}>
            Save Shopify
          </button>
          <button type="button" className="panel-btn panel-btn-primary" disabled={busy || !shopifyConfigured} onClick={() => void importShopify()}>
            Import catalog
          </button>
        </div>
      </div>

      <div className="connectors-token-row">
        <strong>WooCommerce {wooConfigured ? "(connected)" : ""}</strong>
        <input
          className="panel-input"
          placeholder="Store URL (https://…)"
          value={wooUrl}
          onChange={(e) => setWooUrl(e.target.value)}
          disabled={busy}
        />
        <input className="panel-input" placeholder="Consumer key" value={wooKey} onChange={(e) => setWooKey(e.target.value)} disabled={busy} />
        <input
          className="panel-input"
          type="password"
          placeholder="Consumer secret"
          value={wooSecret}
          onChange={(e) => setWooSecret(e.target.value)}
          disabled={busy}
        />
        <input className="panel-input" placeholder="Currency (USD)" value={wooCurrency} onChange={(e) => setWooCurrency(e.target.value)} disabled={busy} />
        <div className="panel-form-actions">
          <button type="button" className="panel-btn" disabled={busy || !wooUrl.trim() || !wooKey.trim() || !wooSecret.trim()} onClick={() => void saveWooCommerce()}>
            Save WooCommerce
          </button>
          <button type="button" className="panel-btn panel-btn-primary" disabled={busy || !wooConfigured} onClick={() => void importWooCommerce()}>
            Import catalog
          </button>
        </div>
      </div>

      {note ? <p className="panel-section-note">{note}</p> : null}
    </div>
  );
}
