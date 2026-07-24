(function () {
  var toggle = document.querySelector(".site-nav-toggle");
  var drawer = document.getElementById("site-nav-drawer");
  if (!toggle || !drawer) return;

  function setOpen(open) {
    document.body.classList.toggle("site-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  toggle.addEventListener("click", function () {
    setOpen(!document.body.classList.contains("site-nav-open"));
  });

  drawer.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setOpen(false);
    }
  });
})();
