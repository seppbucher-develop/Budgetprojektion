// Trotz des Namens ohne "CHF"-Präfix (nur Zahl mit Tausendertrennzeichen) —
// die Währung ist app-weit immer CHF und wird nicht wiederholt angezeigt,
// um Platz zu sparen (v. a. auf schmalen Bildschirmen).
const currencyFormatter = new Intl.NumberFormat("de-CH", {
  maximumFractionDigits: 0
});

// Für Detailtabellen (z. B. Buchungen-Drilldown), in denen die Währung aus
// dem Kontext klar ist und der Betrag mit Rappen angezeigt werden soll.
const betragFormatter = new Intl.NumberFormat("de-CH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

function isDarkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function theme() {
  const dark = isDarkMode();
  return {
    axis: dark ? "#334155" : "#e5e7eb",
    text: dark ? "#94a3b8" : "#6b7280",
    line: dark ? "#3b82f6" : "#2563eb",
    zero: dark ? "#f87171" : "#dc2626",
    positive: dark ? "#22c55e" : "#16a34a",
    negative: dark ? "#f87171" : "#dc2626",
    secondary: dark ? "#a78bfa" : "#7c3aed"
  };
}

function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 800;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  return { ctx: ctx, width: cssWidth, height: cssHeight };
}

/** Linienchart, x = Jahr, y = Wert (z. B. Vermögensverlauf). */
export function drawLineChart(canvas, points) {
  const { ctx, width, height } = setupCanvas(canvas, 380);
  const padding = { top: 16, right: 20, bottom: 32, left: 100 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const t = theme();

  if (points.length === 0) return;
  const values = points.map(function (p) { return p.value; });
  const maxV = Math.max.apply(null, values.concat([0]));
  const minV = Math.min.apply(null, values.concat([0]));
  const range = maxV - minV || 1;
  const minJahr = points[0].jahr;
  const maxJahr = points[points.length - 1].jahr;
  const jahrSpanne = Math.max(1, maxJahr - minJahr);

  function x(jahr) { return padding.left + ((jahr - minJahr) / jahrSpanne) * plotW; }
  function y(v) { return padding.top + plotH - ((v - minV) / range) * plotH; }

  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  if (minV < 0 && maxV > 0) {
    ctx.strokeStyle = t.zero;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y(0));
    ctx.lineTo(padding.left + plotW, y(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = t.text;
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let s = 0; s <= 5; s++) {
    const val = minV + (range * s) / 5;
    ctx.fillText(currencyFormatter.format(val), padding.left - 8, y(val));
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.max(1, Math.round(jahrSpanne / 8));
  for (let jahr = minJahr; jahr <= maxJahr; jahr += step) {
    ctx.fillText(String(jahr), x(jahr), padding.top + plotH + 8);
  }

  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(x(p.jahr), y(p.value));
    else ctx.lineTo(x(p.jahr), y(p.value));
  });
  ctx.stroke();
}

/**
 * Gruppiertes Balkendiagramm. categories = string[], series = [{name, color, values:number[]}]
 */
export function drawGroupedBarChart(canvas, categories, series) {
  const estWidth = canvas.clientWidth || 800;
  const rotateLabels = categories.length > 0 && (estWidth - 120) / categories.length < 70;
  const { ctx, width, height } = setupCanvas(canvas, rotateLabels ? 380 : 340);
  const padding = { top: 16, right: 20, bottom: rotateLabels ? 80 : 40, left: 100 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const t = theme();

  if (categories.length === 0) return;
  const allValues = series.flatMap(function (s) { return s.values; });
  const maxV = Math.max.apply(null, allValues.concat([0]));
  const minV = Math.min.apply(null, allValues.concat([0]));
  const range = (maxV - minV) || 1;

  function y(v) { return padding.top + plotH - ((v - minV) / range) * plotH; }

  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  ctx.fillStyle = t.text;
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let s = 0; s <= 5; s++) {
    const val = minV + (range * s) / 5;
    ctx.fillText(currencyFormatter.format(val), padding.left - 8, y(val));
  }
  if (minV < 0 && maxV > 0) {
    ctx.strokeStyle = t.text;
    ctx.beginPath();
    ctx.moveTo(padding.left, y(0));
    ctx.lineTo(padding.left + plotW, y(0));
    ctx.stroke();
  }

  const groupW = plotW / categories.length;
  const barGap = 4;
  const barW = (groupW - barGap * (series.length + 1)) / series.length;

  categories.forEach(function (cat, i) {
    const groupX = padding.left + i * groupW;
    series.forEach(function (s, si) {
      const v = s.values[i] || 0;
      const barX = groupX + barGap + si * (barW + barGap);
      const yTop = y(Math.max(v, 0));
      const yBase = y(Math.min(v, 0));
      ctx.fillStyle = s.color;
      ctx.fillRect(barX, yTop, barW, Math.max(1, yBase - yTop));
    });
    ctx.fillStyle = t.text;
    if (rotateLabels) {
      ctx.save();
      ctx.translate(groupX + groupW / 2, padding.top + plotH + 8);
      ctx.rotate((-40 * Math.PI) / 180);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(cat, 0, 0);
      ctx.restore();
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(cat, groupX + groupW / 2, padding.top + plotH + 8);
    }
  });

  // Legende
  let legendX = padding.left;
  const legendY = 4;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  series.forEach(function (s) {
    ctx.fillStyle = s.color;
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = t.text;
    ctx.fillText(s.name, legendX + 14, legendY + 5);
    legendX += 14 + ctx.measureText(s.name).width + 16;
  });
}

export { currencyFormatter, betragFormatter };
