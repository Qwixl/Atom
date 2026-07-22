(function () {
  var STORAGE_KEY = "atom-marketing-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try {
      localStorage.setItem(STORAGE_KEY, theme === "dark" ? "dark" : "default");
    } catch (_) {
      /* ignore */
    }
  }

  function readTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark") return "dark";
      if (saved === "default") return "light";
    } catch (_) {
      /* ignore */
    }
    /* Marketing default: dark (mood board). App shell stays light via /app/. */
    return "dark";
  }

  applyTheme(readTheme());

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  });
})();
