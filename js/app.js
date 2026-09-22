(function () {
  "use strict";

  var STORAGE_KEY = "budgetprojektion.inputs.v1";

  var form = document.getElementById("calc-form");
  var resultSummary = document.getElementById("result-summary");
  var canvas = document.getElementById("chart");
  var ctx = canvas.getContext("2d");

  var currencyFormatter = new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0
  });

  function readInputs() {
    return {
      startVermoegen: parseFloat(form.startVermoegen.value) || 0,
      monatlicheEinnahmen: parseFloat(form.monatlicheEinnahmen.value) || 0,
      monatlicheAusgaben: parseFloat(form.monatlicheAusgaben.value) || 0,
      renditeProzent: parseFloat(form.rendite.value) || 0,
      inflationProzent: parseFloat(form.inflation.value) || 0,
      horizontJahre: parseInt(form.horizont.value, 10) || 50
    };
  }

  function restoreInputs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(saved).forEach(function (key) {
        if (form[key]) form[key].value = saved[key];
      });
    } catch (e) {
      // localStorage nicht verfügbar oder Daten beschädigt: ignorieren
    }
  }

  function persistInputs(inputs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch (e) {
      // Speichern optional, Berechnung funktioniert auch ohne
    }
  }

  // Simuliert das Vermögen Monat für Monat unter Berücksichtigung von
  // Rendite (auf das Vermögen) und Inflation (auf die Ausgaben).
  function simulate(inputs) {
    var monthlyRate = Math.pow(1 + inputs.renditeProzent / 100, 1 / 12) - 1;
    var monthlyInflation = Math.pow(1 + inputs.inflationProzent / 100, 1 / 12) - 1;
    var maxMonths = inputs.horizontJahre * 12;

    var vermoegen = inputs.startVermoegen;
    var einnahmen = inputs.monatlicheEinnahmen;
    var ausgaben = inputs.monatlicheAusgaben;

    var series = [{ month: 0, vermoegen: vermoegen }];
    var depletedAtMonth = null;

    for (var m = 1; m <= maxMonths; m++) {
      var netCashflow = einnahmen - ausgaben;
      vermoegen = vermoegen * (1 + monthlyRate) + netCashflow;
      ausgaben = ausgaben * (1 + monthlyInflation);
      einnahmen = einnahmen * (1 + monthlyInflation);

      series.push({ month: m, vermoegen: vermoegen });

      if (vermoegen <= 0 && depletedAtMonth === null) {
        depletedAtMonth = m;
        break;
      }
    }

    return { series: series, depletedAtMonth: depletedAtMonth };
  }

  function formatDuration(months) {
    var years = Math.floor(months / 12);
    var rest = months % 12;
    var parts = [];
    if (years > 0) parts.push(years + (years === 1 ? " Jahr" : " Jahre"));
    if (rest > 0) parts.push(rest + (rest === 1 ? " Monat" : " Monate"));
    if (parts.length === 0) return "weniger als 1 Monat";
    return parts.join(" und ");
  }

  function renderSummary(inputs, result) {
    var netCashflow = inputs.monatlicheEinnahmen - inputs.monatlicheAusgaben;
    var html = "";

    if (result.depletedAtMonth !== null) {
      html += '<p class="result-headline negative">Das Vermögen reicht für ' +
        formatDuration(result.depletedAtMonth) + '</p>';
    } else {
      html += '<p class="result-headline positive">Das Vermögen reicht über den gesamten Zeithorizont von ' +
        inputs.horizontJahre + ' Jahren (wächst voraussichtlich weiter)</p>';
    }

    var endValue = result.series[result.series.length - 1].vermoegen;

    html += '<div class="result-details">';
    html += statBlock("Monatlicher Cashflow", currencyFormatter.format(netCashflow));
    html += statBlock("Vermögen am Ende des Horizonts", currencyFormatter.format(Math.max(endValue, 0)));
    html += statBlock("Startvermögen", currencyFormatter.format(inputs.startVermoegen));
    html += '</div>';

    resultSummary.innerHTML = html;
  }

  function statBlock(label, value) {
    return '<div class="stat"><div class="stat-label">' + label +
      '</div><div class="stat-value">' + value + '</div></div>';
  }

  function drawChart(series) {
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || 800;
    var cssHeight = 400;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var width = cssWidth;
    var height = cssHeight;
    var padding = { top: 20, right: 20, bottom: 40, left: 95 };
    var plotWidth = width - padding.left - padding.right;
    var plotHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    var values = series.map(function (p) { return p.vermoegen; });
    var maxValue = Math.max.apply(null, values.concat([0]));
    var minValue = Math.min.apply(null, values.concat([0]));
    var range = maxValue - minValue || 1;

    var isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var axisColor = isDark ? "#334155" : "#e5e7eb";
    var textColor = isDark ? "#94a3b8" : "#6b7280";
    var lineColor = isDark ? "#3b82f6" : "#2563eb";
    var zeroLineColor = isDark ? "#f87171" : "#dc2626";

    function xForMonth(m) {
      var maxMonth = series[series.length - 1].month || 1;
      return padding.left + (m / maxMonth) * plotWidth;
    }

    function yForValue(v) {
      return padding.top + plotHeight - ((v - minValue) / range) * plotHeight;
    }

    // Gitterlinien / Achsen
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.stroke();

    // Nulllinie, falls im sichtbaren Bereich
    if (minValue < 0 && maxValue > 0) {
      var yZero = yForValue(0);
      ctx.strokeStyle = zeroLineColor;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yZero);
      ctx.lineTo(padding.left + plotWidth, yZero);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Y-Achsen-Beschriftung
    ctx.fillStyle = textColor;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var ySteps = 5;
    for (var s = 0; s <= ySteps; s++) {
      var val = minValue + (range * s) / ySteps;
      var y = yForValue(val);
      ctx.fillText(currencyFormatter.format(val), padding.left - 8, y);
    }

    // X-Achsen-Beschriftung (in Jahren)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var maxMonth = series[series.length - 1].month;
    var yearStep = Math.max(1, Math.round(maxMonth / 12 / 8));
    for (var yr = 0; yr <= maxMonth / 12; yr += yearStep) {
      var x = xForMonth(yr * 12);
      ctx.fillText("J" + yr, x, padding.top + plotHeight + 8);
    }

    // Vermögenslinie
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach(function (p, i) {
      var x = xForMonth(p.month);
      var y = yForValue(p.vermoegen);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function handleSubmit(event) {
    event.preventDefault();
    var inputs = readInputs();
    persistInputs(inputs);
    var result = simulate(inputs);
    renderSummary(inputs, result);
    drawChart(result.series);
  }

  form.addEventListener("submit", handleSubmit);
  window.addEventListener("resize", function () {
    if (resultSummary.querySelector(".result-headline")) {
      var inputs = readInputs();
      var result = simulate(inputs);
      drawChart(result.series);
    }
  });

  restoreInputs();
  handleSubmit(new Event("submit"));
})();
