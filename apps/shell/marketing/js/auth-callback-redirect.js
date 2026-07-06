(function () {
  var hash = window.location.hash || "";
  var search = window.location.search || "";
  var path = window.location.pathname || "";

  if (path.indexOf("/app") === 0) return;

  var hasAuthTokens =
    hash.indexOf("access_token=") !== -1 ||
    hash.indexOf("error=") !== -1 ||
    search.indexOf("code=") !== -1 ||
    search.indexOf("token_hash=") !== -1;

  if (!hasAuthTokens) return;

  var auth = "register";
  if (hash.indexOf("type=recovery") !== -1) auth = "login";

  window.location.replace("/app/?auth=" + auth + hash);
})();
