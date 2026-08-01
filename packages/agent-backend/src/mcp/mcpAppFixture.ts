/**
 * Minimal independent MCP Apps fixture HTML (no Atom branding).
 * Used by bridge/policy tests and as a resources/read body sample.
 */
export const MCP_APP_FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Fixture App</title></head>
<body>
  <h1>Fixture MCP App</h1>
  <button id="call">Call show</button>
  <script>
    window.parent.postMessage({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} }, "*");
    document.getElementById("call").onclick = function () {
      window.parent.postMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "show", arguments: { demo: true } }
      }, "*");
    };
  </script>
</body>
</html>`;

export const MCP_APP_FIXTURE_URI = "ui://fixture/demo-view";
