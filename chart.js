/* Minimal canvas chart for coin prices. Draws an optional orange dashed exit line. */
(function (global) {
  function draw(canvas, points, exitLine) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length === 0) {
      ctx.fillStyle = "#8e8e93";
      ctx.font = "13px -apple-system, sans-serif";
      ctx.fillText("No candles yet", 16, h / 2);
      return;
    }
    const vals = points.map((p) => Number(p.price_usd)).filter((n) => isFinite(n));
    if (!vals.length) return;
    let min = Math.min.apply(null, vals);
    let max = Math.max.apply(null, vals);
    if (exitLine && isFinite(exitLine.price)) {
      min = Math.min(min, exitLine.price);
      max = Math.max(max, exitLine.price);
    }
    if (min === max) { min *= 0.99; max *= 1.01; }
    const pad = 12;
    const ys = (v) => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    const xs = (i) => pad + (i / Math.max(vals.length - 1, 1)) * (w - pad * 2);
    ctx.strokeStyle = "#64d2ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xs(i), y = ys(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (exitLine && isFinite(exitLine.price)) {
      const y = ys(exitLine.price);
      ctx.strokeStyle = "#ff9f0a";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff9f0a";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText(exitLine.label || "Risk trailing stop", pad, Math.max(12, y - 4));
    }
  }
  global.DeskChart = { draw };
})(window);
