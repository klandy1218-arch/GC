const TARGET_STATS = ["CHR", "CHD", "SPATK", "ATK", "MP"];
const OVERVIEW_SEASONS = ["S5", "S6", "S7", "S8", "S9", "S10", "S11"];
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
  S11: "season-s11",
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
  excludedSeasons: new Set(),
};

const els = {
  statusLine: document.getElementById("statusLine"),
  weightRows: document.getElementById("weightRows"),
  weightSum: document.getElementById("weightSum"),
  totalStats: document.getElementById("totalStats"),
  overviewContent: document.getElementById("overviewContent"),
  optimizeBtn: document.getElementById("optimizeBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  applyDefaultBtn: document.getElementById("applyDefaultBtn"),
  quickSeasonButtons: document.getElementById("quickSeasonButtons"),
  excludedSeasonButtons: document.getElementById("excludedSeasonButtons"),
  optimizationProgress: document.getElementById("optimizationProgress"),
  progressText: document.getElementById("progressText"),
  progressBar: document.getElementById("progressBar"),
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

function yieldForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function formatProgressPercent(percent) {
  if (percent > 0 && percent < 1) return `${percent.toFixed(2)}%`;
  return `${percent.toFixed(1)}%`;
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

function calculateSelectionSummary() {
  const totals = emptyTotals();
  const seasonCounts = {};

  state.parts.forEach((part) => {
    const season = state.selection[part];
    if (!season) return;
    seasonCounts[season] = (seasonCounts[season] || 0) + 1;
    addTotals(totals, state.eqContrib?.[part]?.[season] || emptyTotals());
  });

  Object.entries(seasonCounts).forEach(([season, count]) => {
    addTotals(totals, state.bonusContrib?.[season]?.[count] || emptyTotals());
  });

  return { totals, seasonCounts };
}

function renderTotalStats(totals) {
  els.totalStats.innerHTML = TARGET_STATS.map(
    (stat) => `
      <div class="total-stat-item">
        <span>${displayStat(stat)}</span>
        <strong>${totals[stat].toFixed(2)}</strong>
      </div>
    `
  ).join("");
}

function updateOptimizationProgress(percent, label) {
  const safePercent = Math.max(0, Math.min(100, percent));
  els.progressBar.style.width = `${safePercent.toFixed(2)}%`;
  els.progressText.textContent = label;
  els.optimizationProgress
    .querySelector('[role="progressbar"]')
    .setAttribute("aria-valuenow", safePercent.toFixed(2));
}

function recalculate(message = "表格已更新，可直接點選賽季或執行 Find Best Combo。") {
  refreshSeasonOverview();
  setStatus(message);
}

function refreshSeasonOverview() {
  const { totals, seasonCounts } = calculateSelectionSummary();
  renderTotalStats(totals);

  const statsCell = (stats, unavailable = false) => {
    if (unavailable) return '<span class="empty-stat">尚無資料</span>';
    const entries = TARGET_STATS.filter((stat) => Math.abs(stats[stat] || 0) > 1e-9);
    if (!entries.length) return '<span class="empty-stat">(none)</span>';
    const chips = entries
      .map(
        (stat) =>
          `<span class="stat-chip stat-${stat.toLowerCase()}"><strong>${displayStat(stat)}</strong> +${stats[stat].toFixed(2)}</span>`
      )
      .join("");
    return `${entries.length >= 2 ? '<span class="dual-badge">雙屬性</span>' : ""}${chips}`;
  };

  const partRows = state.parts
    .map((part) => {
      const icon = PART_ICONS[part] || "◼";
      const seasonCells = OVERVIEW_SEASONS.map((season) => {
        const tokens = state.equipment?.[part]?.[season];
        const unavailable = !Array.isArray(tokens);
        const stats = tokensToTotals(tokens || []).totals;
        const statCount = TARGET_STATS.filter((stat) => Math.abs(stats[stat] || 0) > 1e-9).length;
        const cellClass = statCount >= 2 ? "multi-stat-cell" : seasonClass(season);
        const selected = state.selection[part] === season;
        if (unavailable) {
          return `<td class="stats-cell overview-stat-cell unavailable-season-cell ${cellClass}">${statsCell(stats, true)}</td>`;
        }
        return `
          <td class="stats-cell overview-stat-cell ${cellClass} ${selected ? "selected-season-cell" : ""}">
            <button class="overview-season-choice" type="button" data-part="${part}" data-season="${season}" aria-pressed="${selected}">
              ${selected ? '<span class="selected-badge">已選擇</span>' : ""}
              ${statsCell(stats)}
            </button>
          </td>
        `;
      }).join("");
      return `<tr><th scope="row">${icon} ${part}</th>${seasonCells}</tr>`;
    })
    .join("");

  const bonusThresholds = [...new Set(
    Object.values(state.setBonus || {}).flatMap((bonusMap) => Object.keys(bonusMap))
  )]
    .sort((a, b) => bonusSortKey(a) - bonusSortKey(b))
  const bonusRows = bonusThresholds
    .map((st) => {
      const threshold = bonusSortKey(st);
      const seasonCells = OVERVIEW_SEASONS.map((season) => {
        const tokens = state.setBonus?.[season]?.[st];
        const unavailable = !Array.isArray(tokens);
        const stats = tokensToTotals(tokens || []).totals;
        const statCount = TARGET_STATS.filter((stat) => Math.abs(stats[stat] || 0) > 1e-9).length;
        const cellClass = statCount >= 2 ? "multi-stat-cell" : seasonClass(season);
        const selectedCount = seasonCounts[season] || 0;
        const active = !unavailable && selectedCount >= threshold;
        const tracking = !unavailable && selectedCount > 0 && !active;
        const stateClass = active ? "active-set-cell" : tracking ? "set-progress-cell" : "";
        const stateBadge = active
          ? `<span class="set-state-badge active">已啟用 · ${selectedCount}件</span>`
          : tracking
            ? `<span class="set-state-badge tracking">${selectedCount}/${threshold} 件</span>`
            : "";
        return `<td class="stats-cell overview-stat-cell set-bonus-cell ${cellClass} ${stateClass}">${stateBadge}${statsCell(stats, unavailable)}</td>`;
      }).join("");
      return `<tr><th scope="row">${st}</th>${seasonCells}</tr>`;
    })
    .join("");

  const seasonHeaders = OVERVIEW_SEASONS.map(
    (season) => `<th class="${seasonClass(season)}">${season}</th>`
  ).join("");

  els.overviewContent.innerHTML = `
    <h3 class="section-title">All Season Equipment Overview</h3>
    <div class="result-block">
      <h4>By Equipment Order</h4>
      <div class="table-scroll">
        <table class="overview-table season-comparison-table">
          <thead><tr><th>部位</th>${seasonHeaders}</tr></thead>
          <tbody>${partRows}</tbody>
        </table>
      </div>
    </div>
    <div class="result-block">
      <h4>Set Bonus</h4>
      <div class="table-scroll">
        <table class="overview-table season-comparison-table">
          <thead><tr><th>套裝門檻</th>${seasonHeaders}</tr></thead>
          <tbody>${bonusRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSeasonControls() {
  const seasons = sortSeasons([...new Set(state.parts.flatMap((part) => state.seasonsByPart[part]))]);

  els.quickSeasonButtons.innerHTML = "";
  els.excludedSeasonButtons.innerHTML = "";

  seasons.forEach((season) => {
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = `season-action ${seasonClass(season)}`;
    applyBtn.textContent = season;
    applyBtn.addEventListener("click", () => {
      state.parts.forEach((part) => {
        if (state.seasonsByPart[part].includes(season)) state.selection[part] = season;
      });
      recalculate(`已將所有部位套用 ${season}。`);
    });
    els.quickSeasonButtons.appendChild(applyBtn);

    const excludeBtn = document.createElement("button");
    excludeBtn.type = "button";
    excludeBtn.className = `season-action exclude-season ${seasonClass(season)}`;
    excludeBtn.textContent = season;
    excludeBtn.setAttribute("aria-pressed", "false");
    excludeBtn.addEventListener("click", () => {
      if (state.excludedSeasons.has(season)) {
        state.excludedSeasons.delete(season);
      } else {
        state.excludedSeasons.add(season);
      }
      const excluded = state.excludedSeasons.has(season);
      excludeBtn.classList.toggle("selected", excluded);
      excludeBtn.setAttribute("aria-pressed", String(excluded));
      const list = sortSeasons([...state.excludedSeasons]);
      setStatus(list.length ? `最佳組合將排除：${list.join(", ")}` : "已清除賽季排除條件。");
    });
    els.excludedSeasonButtons.appendChild(excludeBtn);
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
    const eligibleSeasons = state.seasonsByPart[part].filter(
      (season) => !state.excludedSeasons.has(season)
    );

    eligibleSeasons.forEach((season) => {
      const score = weightedFromStats(state.eqContrib[part][season], weights);
      partSeasonScore[`${part}|${season}`] = score;
      vals.push(score);
      if (seasonEffectiveCount(part, season) >= 2) dualCount += 1;
    });

    const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    partMeta.push({ part, spread, dualCount, eligibleSeasons });
  });

  const orderedParts = [...partMeta]
    .sort((a, b) => (b.spread - a.spread) || (b.dualCount - a.dualCount))
    .map((x) => x.part);

  const orderedSeasonsByPart = {};
  const maxSeasonScoreByPart = {};

  orderedParts.forEach((part) => {
    const eligibleSeasons = partMeta.find((meta) => meta.part === part).eligibleSeasons;
    const ranked = [...eligibleSeasons].sort((a, b) => {
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
    updateOptimizationProgress(0, "權重設定錯誤");
    return;
  }

  const unavailablePart = state.parts.find((part) =>
    state.seasonsByPart[part].every((season) => state.excludedSeasons.has(season))
  );
  if (unavailablePart) {
    setStatus(`無法搜尋：${unavailablePart} 的所有賽季都被排除了。`);
    updateOptimizationProgress(0, "無法開始搜尋");
    return;
  }

  state.optimizing = true;
  state.paused = false;
  els.pauseBtn.disabled = false;
  els.pauseBtn.textContent = "Pause";
  els.optimizeBtn.disabled = true;
  const excludedLabel = sortSeasons([...state.excludedSeasons]).join(", ");
  setStatus(excludedLabel ? `Optimizing... 已排除 ${excludedLabel}` : "Optimizing... Please wait");
  els.optimizationProgress.classList.remove("paused");
  els.optimizationProgress.classList.add("running");
  updateOptimizationProgress(0, "0.0%");
  await yieldForPaint();

  const weights = getWeights();
  const cache = buildOptimizationCache(weights);
  const { orderedParts, orderedSeasonsByPart, partSeasonScore, remainingEqUpper, bonusScore } = cache;

  const remainingComboCounts = new Array(orderedParts.length + 1).fill(1);
  for (let i = orderedParts.length - 1; i >= 0; i -= 1) {
    remainingComboCounts[i] =
      remainingComboCounts[i + 1] * orderedSeasonsByPart[orderedParts[i]].length;
  }
  const totalCombos = remainingComboCounts[0];
  let processedCombos = 0;

  let bestSelection = null;
  let bestScore = -Infinity;
  const currentSelection = {};
  const currentCounts = {};

  let visited = 0;

  async function dfs(idx, eqScore) {
    while (state.paused) {
      await sleep(60);
    }

    visited += 1;
    if (visited % 500 === 0) {
      const percent = (processedCombos / totalCombos) * 100;
      updateOptimizationProgress(percent, formatProgressPercent(percent));
      await yieldForPaint();
    }

    const remainingSlots = orderedParts.length - idx;
    const optimistic =
      eqScore +
      remainingEqUpper[idx] +
      bonusUpperBound(currentCounts, remainingSlots, state.parts.length, bonusScore);

    if (optimistic <= bestScore) {
      processedCombos += remainingComboCounts[idx];
      return;
    }

    if (idx === orderedParts.length) {
      processedCombos += 1;
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

  state.optimizing = false;
  els.optimizationProgress.classList.remove("running", "paused");
  els.pauseBtn.disabled = true;
  els.optimizeBtn.disabled = false;

  if (bestSelection) {
    state.selection = { ...state.selection, ...bestSelection };
    updateOptimizationProgress(100, "完成 100%");
    await yieldForPaint();
    recalculate("最佳組合已套用，結果以表格選取框標示。");
  } else {
    updateOptimizationProgress(0, "搜尋失敗");
    setStatus("Optimization failed: no result");
  }
}

function togglePause() {
  if (!state.optimizing) return;
  state.paused = !state.paused;
  els.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  els.optimizationProgress.classList.toggle("paused", state.paused);
  const currentPercent = Number(
    els.optimizationProgress.querySelector('[role="progressbar"]').getAttribute("aria-valuenow") || 0
  );
  updateOptimizationProgress(
    currentPercent,
    state.paused ? `已暫停 ${currentPercent.toFixed(1)}%` : `${currentPercent.toFixed(1)}%`
  );
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

async function init() {
  bindMainTabs();

  els.optimizeBtn.addEventListener("click", runOptimize);
  els.pauseBtn.addEventListener("click", togglePause);
  els.applyDefaultBtn.addEventListener("click", applyDefaultWeights);
  els.overviewContent.addEventListener("click", (event) => {
    const choice = event.target.closest(".overview-season-choice");
    if (!choice) return;
    const part = choice.dataset.part;
    const season = choice.dataset.season;
    if (!state.equipment?.[part]?.[season]) return;
    state.selection[part] = season;
    recalculate(`${part} 已選擇 ${season}。`);
  });

  if (window.location.protocol === "file:" && window.GC_DATA) {
    state.data = window.GC_DATA;
  } else {
    try {
      const res = await fetch("./list.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      if (window.GC_DATA) {
        state.data = window.GC_DATA;
        console.warn("list.json could not be loaded; using bundled data instead.", err);
      } else {
        setStatus("無法載入 list.json，請確認資料檔與 index.html 位於相同資料夾。");
        console.error(err);
        return;
      }
    }
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
  renderSeasonControls();

  recalculate();
}

init();
