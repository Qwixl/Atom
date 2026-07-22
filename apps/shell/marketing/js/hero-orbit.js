(function () {
  var root = document.querySelector("[data-hero-orbit]");
  if (!root) return;

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  var stage = root.querySelector(".hero-orbit-stage");
  if (!stage) return;

  var px = 0;
  var py = 0;
  var tx = 0;
  var ty = 0;
  var scrollY = 0;
  var raf = 0;

  function apply() {
    raf = 0;
    px += (tx - px) * 0.12;
    py += (ty - py) * 0.12;
    var scrollTilt = Math.max(-12, Math.min(12, scrollY * 0.02));
    stage.style.setProperty("--orbit-x", px.toFixed(2) + "px");
    stage.style.setProperty("--orbit-y", (py + scrollTilt).toFixed(2) + "px");
    stage.style.setProperty("--orbit-rot", (px * 0.04 - py * 0.02).toFixed(3) + "deg");
    if (Math.abs(tx - px) > 0.05 || Math.abs(ty - py) > 0.05) {
      raf = window.requestAnimationFrame(apply);
    }
  }

  function schedule() {
    if (!raf) raf = window.requestAnimationFrame(apply);
  }

  root.addEventListener(
    "pointermove",
    function (e) {
      var rect = root.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      tx = ((e.clientX - cx) / Math.max(rect.width, 1)) * 48;
      ty = ((e.clientY - cy) / Math.max(rect.height, 1)) * 32;
      schedule();
    },
    { passive: true },
  );

  root.addEventListener(
    "pointerleave",
    function () {
      tx = 0;
      ty = 0;
      schedule();
    },
    { passive: true },
  );

  window.addEventListener(
    "scroll",
    function () {
      scrollY = window.scrollY || 0;
      schedule();
    },
    { passive: true },
  );

  scrollY = window.scrollY || 0;
  schedule();
})();
