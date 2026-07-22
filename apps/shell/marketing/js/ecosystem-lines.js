(function () {
  var diagram = document.querySelector(".ecosystem-diagram");
  if (!diagram) return;

  var hub = diagram.querySelector(".ecosystem-hub");
  var svg = diagram.querySelector(".ecosystem-lines");
  if (!hub || !svg) return;

  var nodes = diagram.querySelectorAll(".ecosystem-node");
  var lines = [];

  function center(el) {
    var d = diagram.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - d.left,
      y: r.top + r.height / 2 - d.top,
    };
  }

  function ensureLines() {
    while (lines.length < nodes.length) {
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("opacity", "0.35");
      svg.appendChild(line);
      lines.push(line);
    }
  }

  function update() {
    ensureLines();
    var hubC = center(hub);
    nodes.forEach(function (node, i) {
      var nodeC = center(node);
      var line = lines[i];
      line.setAttribute("x1", hubC.x.toFixed(1));
      line.setAttribute("y1", hubC.y.toFixed(1));
      line.setAttribute("x2", nodeC.x.toFixed(1));
      line.setAttribute("y2", nodeC.y.toFixed(1));
    });
  }

  update();
  window.addEventListener("resize", update, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(update);
  }
  window.addEventListener("load", update);
})();
