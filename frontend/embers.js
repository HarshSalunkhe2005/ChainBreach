// Rising embers behind the hero. Decorative only: pauses off-screen and in hidden tabs, static under reduced motion.
(function () {
  const canvas = document.getElementById("embers");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["255,90,31", "255,122,61", "255,178,61", "255,226,170"];
  let w = 0, h = 0, dpr = 1, running = false, raf = 0, last = 0;
  let embers = [];

  function spawn(fromBottom) {
    const size = 0.8 + Math.random() * 2.6;
    return {
      x: Math.random() * w,
      y: fromBottom ? h + 10 : Math.random() * h,
      size,
      vy: 14 + Math.random() * 34 + size * 6,
      sway: 8 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.9,
      life: 0,
      max: 5 + Math.random() * 6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(24, Math.min(90, Math.round((w * h) / 14000)));
    embers = Array.from({ length: count }, () => spawn(false));
    if (reduced) draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.life += dt;
      e.y -= e.vy * dt;
      e.phase += e.speed * dt;
      if (e.life > e.max || e.y < -10) {
        embers[i] = spawn(true);
        continue;
      }
      const x = e.x + Math.sin(e.phase) * e.sway;
      // brightest in the lower half where the heat is, fading as it rises and ages
      const heat = Math.max(0, Math.min(1, e.y / h + 0.15));
      const age = 1 - e.life / e.max;
      const a = Math.max(0, Math.min(1, heat * age * 1.4));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${e.color},${a})`;
      ctx.shadowColor = `rgba(${e.color},${a})`;
      ctx.shadowBlur = e.size * 5;
      ctx.arc(x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  window.addEventListener("resize", resize);
  if (reduced) return;

  const hero = canvas.parentElement;
  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    visible && !document.hidden ? start() : stop();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : visible && start()));
  start();
})();
