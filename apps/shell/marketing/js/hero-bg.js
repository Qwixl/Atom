(function () {
  var canvas = document.querySelector(".hero-bg-canvas");
  if (!canvas) return;

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;
  var time = 0;
  var lastTs = 0;
  var raf = 0;

  var rings = [
    { rx: 0.34, ry: 0.14, rot: 0, speed: 0.0000009, hueA: 185, hueB: 15 },
    { rx: 0.34, ry: 0.14, rot: Math.PI / 3, speed: -0.0000007, hueA: 265, hueB: 85 },
    { rx: 0.34, ry: 0.14, rot: (Math.PI * 2) / 3, speed: 0.00000055, hueA: 210, hueB: 30 },
  ];

  var particles = Array.from({ length: 36 }, function (_, i) {
    return {
      angle: (i / 36) * Math.PI * 2,
      radius: 0.28 + (i % 5) * 0.018,
      speed: 0.000001 + (i % 7) * 0.0000002,
      size: 1.2 + (i % 4) * 0.6,
      hue: 160 + (i * 17) % 200,
    };
  });

  var drift = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    wanderTimer: 0,
  };

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function palette() {
    if (isLight()) {
      return {
        bg: "#ffffff",
        ringLight: 46,
        ringAlpha: 0.72,
        particleLight: 40,
        particleAlpha: 0.65,
        nucleusLight: 12,
        nucleusCoreLight: 8,
        glowAlpha: 0.18,
        shadowAlpha: 0.2,
        ambient: [
          [0, "rgba(10,10,10,0.03)"],
          [0.45, "rgba(60,100,180,0.05)"],
          [1, "rgba(255,255,255,0)"],
        ],
      };
    }
    return {
      bg: "#0a0a0a",
      ringLight: 68,
      ringAlpha: 0.85,
      particleLight: 72,
      particleAlpha: 0.75,
      nucleusLight: 70,
      nucleusCoreLight: 96,
      glowAlpha: 0.28,
      shadowAlpha: 0.45,
      ambient: [
        [0, "rgba(255,255,255,0.04)"],
        [0.45, "rgba(120,180,255,0.02)"],
        [1, "rgba(0,0,0,0)"],
      ],
    };
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function initDrift() {
    drift.x = width * 0.42;
    drift.y = height * 0.46;
    var angle = rand(0, Math.PI * 2);
    var speed = rand(0.006, 0.014);
    drift.vx = Math.cos(angle) * speed;
    drift.vy = Math.sin(angle) * speed;
    drift.wanderTimer = rand(2000, 5000);
  }

  function heartbeatScale(t) {
    var cycleMs = 4400;
    var p = (t % cycleMs) / cycleMs;
    var lub = Math.exp(-Math.pow((p - 0.055) / 0.032, 2)) * 0.2;
    var dub = Math.exp(-Math.pow((p - 0.155) / 0.026, 2)) * 0.11;
    return 1 + lub + dub;
  }

  function resize() {
    var prevW = width || window.innerWidth;
    var prevH = height || window.innerHeight;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (prevW > 0 && prevH > 0) {
      drift.x = (drift.x / prevW) * width;
      drift.y = (drift.y / prevH) * height;
    } else {
      initDrift();
    }
  }

  function lerpHue(a, b, t) {
    var delta = ((b - a + 540) % 360) - 180;
    return (a + delta * t + 360) % 360;
  }

  function hsl(h, s, l, a) {
    return "hsla(" + h + "," + s + "%," + l + "%," + a + ")";
  }

  function nucleusRadius() {
    return Math.min(width, height) * 0.04;
  }

  function updateDrift(dt) {
    var margin = nucleusRadius();
    drift.x += drift.vx * dt;
    drift.y += drift.vy * dt;

    if (drift.x - margin <= 0) {
      drift.x = margin;
      drift.vx = Math.abs(drift.vx) * rand(0.92, 1.08);
      drift.vy += rand(-0.003, 0.003);
    } else if (drift.x + margin >= width) {
      drift.x = width - margin;
      drift.vx = -Math.abs(drift.vx) * rand(0.92, 1.08);
      drift.vy += rand(-0.003, 0.003);
    }

    if (drift.y - margin <= 0) {
      drift.y = margin;
      drift.vy = Math.abs(drift.vy) * rand(0.92, 1.08);
      drift.vx += rand(-0.003, 0.003);
    } else if (drift.y + margin >= height) {
      drift.y = height - margin;
      drift.vy = -Math.abs(drift.vy) * rand(0.92, 1.08);
      drift.vx += rand(-0.003, 0.003);
    }

    drift.wanderTimer -= dt;
    if (drift.wanderTimer <= 0) {
      drift.vx += rand(-0.002, 0.002);
      drift.vy += rand(-0.002, 0.002);
      var maxSpeed = 0.0175;
      var speed = Math.hypot(drift.vx, drift.vy) || 0.0001;
      if (speed > maxSpeed) {
        drift.vx = (drift.vx / speed) * maxSpeed;
        drift.vy = (drift.vy / speed) * maxSpeed;
      } else if (speed < 0.005) {
        var a = rand(0, Math.PI * 2);
        drift.vx = Math.cos(a) * 0.009;
        drift.vy = Math.sin(a) * 0.009;
      }
      drift.wanderTimer = rand(3000, 7000);
    }
  }

  function drawRing(ring, cx, cy, scale, t, pal) {
    var hue = lerpHue(ring.hueA, ring.hueB, (Math.sin(t * 0.000002 + ring.rot) + 1) * 0.5);
    var rx = width * ring.rx * scale;
    var ry = height * ring.ry * scale;
    var rot = ring.rot + t * ring.speed * 60;
    var sat = isLight() ? 82 : 78;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

    var grad = ctx.createLinearGradient(-rx, 0, rx, 0);
    grad.addColorStop(0, hsl(hue, sat, pal.ringLight, 0));
    grad.addColorStop(0.35, hsl(hue, sat, pal.ringLight, pal.ringAlpha));
    grad.addColorStop(0.65, hsl((hue + 180) % 360, sat - 2, pal.ringLight, pal.ringAlpha));
    grad.addColorStop(1, hsl((hue + 180) % 360, sat, pal.ringLight, 0));

    ctx.strokeStyle = grad;
    ctx.lineWidth = isLight() ? 1.5 : 1.35;
    ctx.shadowColor = hsl(hue, 80, pal.ringLight, pal.shadowAlpha);
    ctx.shadowBlur = isLight() ? 10 : 14;
    ctx.stroke();
    ctx.restore();
  }

  function drawNucleus(cx, cy, t, pal) {
    var beat = heartbeatScale(t);
    var baseR = Math.min(width, height) * 0.018;
    var r = baseR * beat;
    var hue = lerpHue(195, 25, (Math.sin(t * 0.000003) + 1) * 0.5);

    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 8 * beat);
    glow.addColorStop(0, hsl(hue, 70, pal.nucleusLight, pal.glowAlpha + (beat - 1) * 0.6));
    glow.addColorStop(1, hsl(hue, 70, pal.nucleusLight, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 8 * beat, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hsl(hue, isLight() ? 24 : 18, pal.nucleusCoreLight, 0.95);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles(cx, cy, scale, t, pal) {
    particles.forEach(function (p) {
      var angle = p.angle + t * p.speed * 60;
      var x = cx + Math.cos(angle) * width * p.radius * scale;
      var y = cy + Math.sin(angle) * height * p.radius * scale * 0.42;
      var hue = (p.hue + t * 0.0001) % 360;
      ctx.fillStyle = hsl(hue, isLight() ? 78 : 82, pal.particleLight, pal.particleAlpha);
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function frame(ts) {
    raf = window.requestAnimationFrame(frame);
    if (reduced) return;

    if (!lastTs) lastTs = ts;
    var dt = Math.min(48, ts - lastTs);
    lastTs = ts;
    time = ts;

    updateDrift(dt);

    var cx = drift.x;
    var cy = drift.y;
    var scale = 1;
    var pal = palette();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    var ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.55);
    pal.ambient.forEach(function (stop) {
      ambient.addColorStop(stop[0], stop[1]);
    });
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, width, height);

    rings.forEach(function (ring) {
      drawRing(ring, cx, cy, scale, time, pal);
    });
    drawParticles(cx, cy, scale, time, pal);
    drawNucleus(cx, cy, time, pal);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });

  if (reduced) {
    ctx.fillStyle = isLight() ? "#ffffff" : "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    return;
  }

  raf = window.requestAnimationFrame(frame);
})();
