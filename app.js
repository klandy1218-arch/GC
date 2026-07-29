const TARGET_STATS = ["CHR", "CHD", "SPATK", "ATK", "MP"];
const ALIASES = { CHR_HALF: "CHR_2_5" };
const DEFAULT_WEIGHTS = { CHR: 4, CHD: 3, SPATK: 2, ATK: 1, MP: 0 };
const STAT_LABELS = {
  CHR: "爆擊率",
  CHD: "爆擊傷害",
  SPATK: "必殺攻擊",
  ATK: "攻擊",
  MP: "MP回復",
};
const PART_ICONS = {
  HEAD: "🪖",
  BODY: "🧥",
  PANTS: "👖",
  GLOVES: "🧤",
  SHOES: "👟",
  CAPE: "🧣",
  WEAPON: "⚔",
  HEAD_TOP: "🎩",
  HEAD_BOTTOM: "⛑",
  GARMENT_TOP: "👔",
  GARMENT_BOTTOM: "🩳",
  ACCESSORY: "💍",
};

const seasonClassMap = {
  S5: "season-s5",
  S6: "season-s6",
  S7: "season-s7",
  S8: "season-s8",
  S9: "season-s9",
  S10: "season-s10",
};

const state = {
  data: null,
  statDefs: null,
  equipment: null,
  setBonus: null,
  parts: [],
  seasonsByPart: {},
  selection: {},
  eqContrib: {},
  bonusContrib: {},
  baseStats: {},
  unknownTokens: new Set(),
  optimizing: false,
  paused: false,
  lastSearchStats: { visited: 0, pruned: 0, leaves: 0 },
};

const els = {
  statusLine: document.getElementById("statusLine"),
  equipmentRows: document.getElementById("equipmentRows"),
  weightRows: document.getElementById("weightRows"),
  weightSum: document.getElementById("weightSum"),
  resultContent: document.getElementById("resultContent"),
  overviewSeason: document.getElementById("overviewSeason"),
  overviewContent: document.getElementById("overviewContent"),
  optimizeBtn: document.getElementById("optimizeBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  recalcBtn: document.getElementById("recalcBtn"),
  applyDefaultBtn: document.getElementById("applyDefaultBtn"),
  overviewRefreshBtn: document.getElementById("overviewRefreshBtn"),
};

const weightInputs = {};

function seasonSortKey(s) {
  if (/^S\d+$/.test(s)) return [Number(s.slice(1)), s];
  return [10000, s];
}

function sortSeasons(list) {
  return [...list].sort((a, b) => {
    const ka = seasonSortKey(a);
    const kb = seasonSortKey(b);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
  });
}

function bonusSortKey(st) {
  if (/^ST\d+$/.test(st)) return Number(st.slice(2));
  return 10000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seasonClass(season) {
  return seasonClassMap[season] || "";
}

function displayStat(stat) {
  return `${stat} (${STAT_LABELS[stat] || stat})`;
}

function tokenToStatDelta(token) {
  const normalized = ALIASES[token] || token;
  if (TARGET_STATS.includes(normalized)) {
    const value = Number(state.statDefs?.[normalized]?.value || 0);
    return { stat: normalized, value, unknown: null };
  }

  if (state.statDefs?.[normalized]) {
    const statName = normalized.split("_", 1)[0];
    if (TARGET_STATS.includes(statName)) {
      const value = Number(state.statDefs[normalized].value || 0);
      return { stat: statName, value, unknown: null };
    }
  }

  return { stat: null, value: 0, unknown: normalized };
}

function emptyTotals() {
  const out = {};
  TARGET_STATS.forEach((s) => (out[s] = 0));
  return out;
}

function tokensToTotals(tokens) {
  const totals = emptyTotals();
  const unknown = [];

  (tokens || []).forEach((token) => {
    const d = tokenToStatDelta(token);
    if (d.stat) {
      totals[d.stat] += d.value;
    } else if (d.unknown) {
      unknown.push(d.unknown);
    }
  });

  return { totals, unknown };
}

function addTotals(a, b) {
  TARGET_STATS.forEach((s) => {
    a[s] += b[s] || 0;
  });
}

function cloneTotals(src) {
  const out = {};
  TARGET_STATS.forEach((s) => (out[s] = src[s] || 0));
  return out;
}

function weightedFromStats(stats, weights) {
  let score = 0;
  TARGET_STATS.forEach((s) => {
    score += ((stats[s] || 0) / (state.baseStats[s] || 1)) * (weights[s] || 0);
  });
  return score;
}

function buildPrecompute() {
  state.eqContrib = {};
  state.bonusContrib = {};
  state.unknownTokens.clear();

  state.parts.forEach((part) => {
    state.eqContrib[part] = {};
    Object.entries(state.equipment[part]).forEach(([season, tokens]) => {
      const { totals, unknown } = tokensToTotals(tokens);
      state.eqContrib[part][season] = totals;
      unknown.forEach((u) => state.unknownTokens.add(u));
    });
  });

  const maxCount = state.parts.length;
  Object.entries(state.setBonus).forEach(([season, bonusMap]) => {
    const thresholds = [];
    Object.entries(bonusMap).forEach(([st, tokens]) => {
      const n = bonusSortKey(st);
      if (n < 10000) {
        const { totals, unknown } = tokensToTotals(tokens);
        unknown.forEach((u) => state.unknownTokens.add(u));
        thresholds.push({ n, totals });
      }
    });

    thresholds.sort((a, b) => a.n - b.n);
    state.bonusContrib[season] = {};

    for (let c = 0; c <= maxCount; c += 1) {
      const totals = emptyTotals();
      thresholds.forEach((t) => {
        if (c >= t.n) addTotals(totals, t.totals);
      });
      state.bonusContrib[season][c] = totals;
    }
  });

  state.baseStats = {};
  TARGET_STATS.forEach((s) => {
    const v = Number(state.statDefs?.[s]?.value || 1);
    state.baseStats[s] = v || 1;
  });
}

function getWeights() {
  const out = {};
  TARGET_STATS.forEach((s) => {
    const n = Number(weightInputs[s]?.value || 0);
    out[s] = Number.isFinite(n) ? n : 0;
  });
  return out;
}

function refreshWeightSum() {
  const w = getWeights();
  const sum = TARGET_STATS.reduce((acc, s) => acc + (w[s] || 0), 0);
  els.weightSum.textContent = `Weight Sum: ${sum.toFixed(2)}/10`;
  return sum;
}

function setStatus(msg) {
  els.statusLine.textContent = msg;
}

function calcFromSelection(selection) {
  const totals = emptyTotals();
  const seasonCounter = {};

  state.parts.forEach((part) => {
    const season = selection[part];
    seasonCounter[season] = (seasonCounter[season] || 0) + 1;
    addTotals(totals, state.eqContrib[part][season]);
  });

  const activeBonusLines = [];
  Object.entries(seasonCounter).forEach(([season, count]) => {
    const bonus = state.bonusContrib?.[season]?.[count];
    if (bonus) addTotals(totals, bonus);

    if (state.setBonus?.[season]) {
      const enabled = Object.keys(state.setBonus[season])
        .sort((a, b) => bonusSortKey(a) - bonusSortKey(b))
        .filter((st) => bonusSortKey(st) <= count);
      if (enabled.length) {
        activeBonusLines.push(`${season} x${count}: ${enabled.join(" + ")}`);
      }
    }
  });

  return { totals, activeBonusLines, seasonCounter };
}

function formatNonZeroStats(stats) {
  const chunks = [];
  TARGET_STATS.forEach((s) => {
    if (Math.abs(stats[s] || 0) > 1e-9) {
      chunks.push(`${displayStat(s)}+${(stats[s] || 0).toFixed(2)}`);
    }
  });
  return chunks.length ? chunks.join(", ") : "(none)";
}

function recalculate() {
  const { totals, activeBonusLines, seasonCounter } = calcFromSelection(state.selection);

  const totalHtml = TARGET_STATS.map(
    (s) => `<li class="result-line"><strong>${displayStat(s)}</strong>: ${totals[s].toFixed(2)}</li>`
  ).join("");

  const partHtml = state.parts
    .map((part) => {
      const season = state.selection[part];
      const icon = PART_ICONS[part] || "◼";
      const detail = formatNonZeroStats(state.eqContrib[part][season]);
      return `<li class="result-line ${seasonClass(season)}">${icon} ${part} [${season}] -> ${detail}</li>`;
    })
    .join("");

  const seasonCountHtml = sortSeasons(Object.keys(seasonCounter))
    .map((s) => `<li class="result-line ${seasonClass(s)}">${s}: ${seasonCounter[s]}</li>`)
    .join("");

  const bonusHtml = activeBonusLines.length
    ? activeBonusLines
        .map((line) => {
          const season = line.split(" ", 1)[0];
          return `<li class="result-line ${seasonClass(season)}">${line}</li>`;
        })
        .join("")
    : "<li class=\"result-line\">(None)</li>";

  const unknown = [...state.unknownTokens].sort();
  const unknownHtml = unknown.length
    ? `<div class="result-block"><strong>Warning</strong><div>Unknown tokens: ${unknown.join(", ")}</div></div>`
    : "";

  els.resultContent.innerHTML = `
    <div class="result-block">
      <h3 class="section-title">Total Stats</h3>
      <ul class="result-list">${totalHtml}</ul>
    </div>
    <div class="result-block">
      <h3 class="section-title">Details by Part</h3>
      <ul class="result-list">${partHtml}</ul>
    </div>
    <div class="result-block">
      <h3 class="section-title">Season Count</h3>
      <ul class="result-list">${seasonCountHtml}</ul>
    </div>
    <div class="result-block">
      <h3 class="section-title">Active Set Bonus</h3>
      <ul class="result-list">${bonusHtml}</ul>
    </div>
    ${unknownHtml}
  `;

  setStatus("Recalculated. Change season or click Find Best Combo.");
}

function refreshSeasonOverview() {
  const season = els.overviewSeason.value;
  const seasonCss = seasonClass(season);

  const partCards = state.parts
    .map((part) => {
      const icon = PART_ICONS[part] || "◼";
      const tokens = state.equipment?.[part]?.[season] || [];
      const stats = tokensToTotals(tokens).totals;
      const tokenText = tokens.length ? tokens.join(", ") : "(none)";
      return `
        <div class="overview-card ${seasonCss}">
          <h4>${icon} ${part}</h4>
          <div>Tokens: ${tokenText}</div>
          <div>Stats: ${formatNonZeroStats(stats)}</div>
        </div>
      `;
    })
    .join("");

  const bonusCards = Object.keys(state.setBonus?.[season] || {})
    .sort((a, b) => bonusSortKey(a) - bonusSortKey(b))
    .map((st) => {
      const tokens = state.setBonus[season][st] || [];
      const stats = tokensToTotals(tokens).totals;
      const tokenText = tokens.length ? tokens.join(", ") : "(none)";
      return `
        <div class="overview-card ${seasonCss}">
          <h4>${st}</h4>
          <div>Tokens: ${tokenText}</div>
          <div>Stats: ${formatNonZeroStats(stats)}</div>
        </div>
      `;
    })
    .join("");

  els.overviewContent.innerHTML = `
    <h3 class="section-title ${seasonCss}">${season} Equipment Overview</h3>
    <div class="result-block">
      <h4>By Equipment Order</h4>
      ${partCards}
    </div>
    <div class="result-block">
      <h4>Set Bonus</h4>
      ${bonusCards}
    </div>
  `;
}

function updateBadge(row, season) {
  const badge = row.querySelector(".badge");
  badge.textContent = season;
  badge.className = `badge ${seasonClass(season)}`;
  const colors = {
    S5: "var(--s5)", S6: "var(--s6)", S7: "var(--s7)",
    S8: "var(--s8)", S9: "var(--s9)", S10: "var(--s10)",
  };
  badge.style.background = colors[season] || "#3a5469";
}

function renderEquipmentRows() {
  els.equipmentRows.innerHTML = "";
  state.parts.forEach((part) => {
    const row = document.createElement("div");
    row.className = "equipment-row";

    const seasonList = state.seasonsByPart[part];
    const name = document.createElement("div");
    name.className = "equipment-name";
    name.textContent = `${PART_ICONS[part] || "◼"} ${part}`;

    const sel = document.createElement("select");
    seasonList.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    sel.value = state.selection[part];

    const badge = document.createElement("div");
    badge.className = "badge";

    row.appendChild(name);
    row.appendChild(sel);
    row.appendChild(badge);
    els.equipmentRows.appendChild(row);

    updateBadge(row, state.selection[part]);

    sel.addEventListener("change", () => {
      state.selection[part] = sel.value;
      updateBadge(row, sel.value);
      recalculate();
    });
  });
}

function renderWeightRows() {
  els.weightRows.innerHTML = "";
  TARGET_STATS.forEach((stat) => {
    const row = document.createElement("div");
    row.className = "weight-row";

    const label = document.createElement("label");
    label.textContent = `${displayStat(stat)}`;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = DEFAULT_WEIGHTS[stat];
    input.addEventListener("input", refreshWeightSum);

    weightInputs[stat] = input;
    row.appendChild(label);
    row.appendChild(input);
    els.weightRows.appendChild(row);
  });

  refreshWeightSum();
}

function applyDefaultWeights() {
  TARGET_STATS.forEach((s) => {
    weightInputs[s].value = DEFAULT_WEIGHTS[s];
  });
  refreshWeightSum();
  setStatus("Weights set: CHR > CHD > SPATK > ATK > MP (sum=10)");
}

function seasonEffectiveCount(part, season) {
  const tokens = state.equipment?.[part]?.[season] || [];
  const seen = new Set();
  tokens.forEach((t) => {
    const d = tokenToStatDelta(t);
    if (d.stat && Math.abs(d.value) > 1e-9) seen.add(d.stat);
  });
  return seen.size;
}

function bonusScoreFromCounts(counts, bonusScore) {
  let score = 0;
  Object.entries(counts).forEach(([season, count]) => {
    if (bonusScore[season] && bonusScore[season][count] != null) {
      score += bonusScore[season][count];
    }
  });
  return score;
}

function bonusUpperBound(counts, remainingSlots, maxCount, bonusScore) {
  let bound = 0;
  Object.entries(bonusScore).forEach(([season, table]) => {
    const cur = counts[season] || 0;
    const hi = Math.min(cur + remainingSlots, maxCount);
    let best = -Infinity;
    for (let c = cur; c <= hi; c += 1) {
      const v = table[c] || 0;
      if (v > best) best = v;
    }
    bound += best;
  });
  return bound;
}

function buildOptimizationCache(weights) {
  const partSeasonScore = {};
  const partMeta = [];

  state.parts.forEach((part) => {
    let dualCount = 0;
    const vals = [];

    state.seasonsByPart[part].forEach((season) => {
      const score = weightedFromStats(state.eqContrib[part][season], weights);
      partSeasonScore[`${part}|${season}`] = score;
      vals.push(score);
      if (seasonEffectiveCount(part, season) >= 2) dualCount += 1;
    });

    const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    partMeta.push({ part, spread, dualCount });
  });

  const orderedParts = [...partMeta]
    .sort((a, b) => (b.spread - a.spread) || (b.dualCount - a.dualCount))
    .map((x) => x.part);

  const orderedSeasonsByPart = {};
  const maxSeasonScoreByPart = {};

  orderedParts.forEach((part) => {
    const ranked = [...state.seasonsByPart[part]].sort((a, b) => {
      const sa = partSeasonScore[`${part}|${a}`];
      const sb = partSeasonScore[`${part}|${b}`];
      if (sb !== sa) return sb - sa;
      return seasonEffectiveCount(part, b) - seasonEffectiveCount(part, a);
    });
    orderedSeasonsByPart[part] = ranked;
    maxSeasonScoreByPart[part] = partSeasonScore[`${part}|${ranked[0]}`];
  });

  const remainingEqUpper = new Array(orderedParts.length + 1).fill(0);
  for (let i = orderedParts.length - 1; i >= 0; i -= 1) {
    remainingEqUpper[i] = remainingEqUpper[i + 1] + maxSeasonScoreByPart[orderedParts[i]];
  }

  const bonusScore = {};
  Object.keys(state.bonusContrib).forEach((season) => {
    bonusScore[season] = {};
    Object.keys(state.bonusContrib[season]).forEach((c) => {
      bonusScore[season][Number(c)] = weightedFromStats(state.bonusContrib[season][c], weights);
    });
  });

  return {
    orderedParts,
    orderedSeasonsByPart,
    partSeasonScore,
    remainingEqUpper,
    bonusScore,
  };
}

async function runOptimize() {
  if (state.optimizing) return;

  const weightSum = refreshWeightSum();
  if (Math.abs(weightSum - 10) > 1e-9) {
    setStatus(`Weight sum invalid: ${weightSum.toFixed(2)}/10`);
    return;
  }

  state.optimizing = true;
  state.paused = false;
  els.pauseBtn.disabled = false;
  els.pauseBtn.textContent = "Pause";
  els.optimizeBtn.disabled = true;
  setStatus("Optimizing... Please wait");

  const weights = getWeights();
  const cache = buildOptimizationCache(weights);
  const { orderedParts, orderedSeasonsByPart, partSeasonScore, remainingEqUpper, bonusScore } = cache;

  let totalCombos = 1;
  orderedParts.forEach((p) => {
    totalCombos *= orderedSeasonsByPart[p].length;
  });

  let bestSelection = null;
  let bestScore = -Infinity;
  const currentSelection = {};
  const currentCounts = {};

  let visited = 0;
  let pruned = 0;
  let leaves = 0;

  async function dfs(idx, eqScore) {
    while (state.paused) {
      await sleep(60);
    }

    visited += 1;
    if (visited % 1400 === 0) {
      setStatus(`Optimizing... checked ${leaves}/${totalCombos}, visited ${visited}, pruned ${pruned}`);
      await sleep(0);
    }

    const remainingSlots = orderedParts.length - idx;
    const optimistic =
      eqScore +
      remainingEqUpper[idx] +
      bonusUpperBound(currentCounts, remainingSlots, state.parts.length, bonusScore);

    if (optimistic <= bestScore) {
      pruned += 1;
      return;
    }

    if (idx === orderedParts.length) {
      leaves += 1;
      const finalScore = eqScore + bonusScoreFromCounts(currentCounts, bonusScore);
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestSelection = { ...currentSelection };
      }
      return;
    }

    const part = orderedParts[idx];
    const seasonList = orderedSeasonsByPart[part];

    for (let i = 0; i < seasonList.length; i += 1) {
      const season = seasonList[i];
      currentSelection[part] = season;
      currentCounts[season] = (currentCounts[season] || 0) + 1;

      await dfs(idx + 1, eqScore + partSeasonScore[`${part}|${season}`]);

      currentCounts[season] -= 1;
      if (!currentCounts[season]) delete currentCounts[season];
      delete currentSelection[part];
    }
  }

  try {
    await dfs(0, 0);
  } catch (err) {
    console.error(err);
  }

  state.lastSearchStats = { visited, pruned, leaves };
  state.optimizing = false;
  els.pauseBtn.disabled = true;
  els.optimizeBtn.disabled = false;

  if (bestSelection) {
    state.selection = { ...state.selection, ...bestSelection };
    renderEquipmentRows();
    recalculate();

    const bestHtml = `
      <div class="result-block">
        <h3 class="section-title">Best Combo (Weighted)</h3>
        <div>Score: ${bestScore.toFixed(3)}</div>
        <ul class="result-list">
          ${state.parts.map((p) => `<li>${p}: ${state.selection[p]}</li>`).join("")}
        </ul>
      </div>
      <div class="result-block">
        <h3 class="section-title">Search Stats</h3>
        <div>visited nodes: ${visited}</div>
        <div>pruned nodes: ${pruned}</div>
        <div>checked leaves: ${leaves}</div>
      </div>
    `;
    els.resultContent.insertAdjacentHTML("beforeend", bestHtml);
    setStatus("Optimization done. Best combo applied.");
  } else {
    setStatus("Optimization failed: no result");
  }
}

function togglePause() {
  if (!state.optimizing) return;
  state.paused = !state.paused;
  els.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  setStatus(state.paused ? "Optimization paused" : "Optimization resumed");
}

function bindMainTabs() {
  const root = document.getElementById("mainTabs");
  const panels = [document.getElementById("fashionTab"), document.getElementById("damageTab")];
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    root.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-tab");
    panels.forEach((p) => p.classList.toggle("active", p.id === target));
  });
}

function bindResultTabs() {
  const root = document.getElementById("resultTabs");
  const panels = [document.getElementById("resultView"), document.getElementById("overviewView")];
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    root.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-tab");
    panels.forEach((p) => p.classList.toggle("active", p.id === target));
  });
}

async function init() {
  bindMainTabs();
  bindResultTabs();

  els.recalcBtn.addEventListener("click", recalculate);
  els.optimizeBtn.addEventListener("click", runOptimize);
  els.pauseBtn.addEventListener("click", togglePause);
  els.applyDefaultBtn.addEventListener("click", applyDefaultWeights);
  els.overviewRefreshBtn.addEventListener("click", refreshSeasonOverview);

  try {
    const res = await fetch("./list.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    setStatus("Failed to load list.json. Please run via GitHub Pages or local web server.");
    console.error(err);
    return;
  }

  state.statDefs = state.data.StatDefinitions;
  state.equipment = state.data.Equipment;
  state.setBonus = state.data.SetBonus;
  state.parts = Object.keys(state.equipment);

  state.parts.forEach((part) => {
    state.seasonsByPart[part] = sortSeasons(Object.keys(state.equipment[part]));
    state.selection[part] = state.seasonsByPart[part][0];
  });

  buildPrecompute();
  renderWeightRows();
  renderEquipmentRows();

  const seasonOptions = sortSeasons(Object.keys(state.setBonus));
  els.overviewSeason.innerHTML = seasonOptions.map((s) => `<option value="${s}">${s}</option>`).join("");
  els.overviewSeason.value = seasonOptions[0] || "";
  els.overviewSeason.addEventListener("change", refreshSeasonOverview);

  recalculate();
  refreshSeasonOverview();
}

init();
