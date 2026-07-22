(function () {
  var header = document.querySelector(".site-header");
  if (!header) return;

  function onScroll() {
    var y = window.scrollY || 0;
    header.classList.toggle("site-header--scrolled", y > 24);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();
