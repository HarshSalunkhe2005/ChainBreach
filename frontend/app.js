const API_BASE = "";
const RISKY_CATEGORIES = new Set([
  "ransomware", "market", "mixing_service", "extremism", "service_hack", "coinjoin",
]);

const input = document.getElementById("address-input");
const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const candidateListEl = document.getElementById("candidate-list");
const samplesEl = document.getElementById("samples");
const graphEl = document.getElementById("graph");
const topbarStatsEl = document.getElementById("topbar-stats");

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const batchTextarea = document.getElementById("batch-textarea");
const batchAnalyzeBtn = document.getElementById("batch-analyze-btn");
const batchResultsEl = document.getElementById("batch-results");
const batchTbody = document.getElementById("batch-tbody");
const exportReportBtn = document.getElementById("export-report-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const reportEl = document.getElementById("report");
const chainBtns = document.querySelectorAll(".chain-btn");
const heroSub = document.querySelector(".hero-sub");
const toastContainer = document.getElementById("toast-container");

const graphCountEl = document.getElementById("graph-count");
const pipelineEl = document.getElementById("pipeline");
const pipelineMatchDesc = document.getElementById("pipeline-match-desc");
const pipelineSteps = pipelineEl.querySelectorAll(".pipeline-step");

const CHAIN_LABELS = { btc: "Bitcoin", eth: "Ethereum" };
const CHAIN_ARTICLE = { btc: "a", eth: "an" };

let graph3d = null;
let lastResult = null;
let lastAddress = null;
let currentChain = "btc";

// ---------- helpers ----------

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The pipeline strip doubles as a progress readout while a request is in flight. The API is a single call, so the
// stages advance on a timer up to "Match" and only complete when the response lands.
let pipelineTimer = null;

function pipelineStart() {
  clearInterval(pipelineTimer);
  let step = 0;
  const paint = () =>
    pipelineSteps.forEach((el, i) => {
      el.classList.toggle("is-done", i < step);
      el.classList.toggle("is-active", i === step);
    });
  paint();
  pipelineTimer = setInterval(() => {
    if (step < 2) step += 1;
    paint();
  }, 900);
}

function pipelineFinish(ok) {
  clearInterval(pipelineTimer);
  pipelineSteps.forEach((el) => {
    el.classList.remove("is-active");
    el.classList.toggle("is-done", ok);
  });
}

// ---------- toasts ----------

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// ---------- keyboard shortcuts ----------

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== input && document.activeElement !== batchTextarea) {
    e.preventDefault();
    if (batchResultsEl && !document.querySelector('.tab[data-tab="single"]').classList.contains("active")) {
      document.querySelector('.tab[data-tab="single"]').click();
    }
    input.focus();
  }
});

// ---------- shareable links ----------

function updateUrlState(address, chain) {
  const url = new URL(window.location.href);
  url.searchParams.set("address", address);
  url.searchParams.set("chain", chain);
  window.history.replaceState({}, "", url);
}

function loadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const address = params.get("address");
  const chain = params.get("chain");
  if (!address) return;
  if (chain && CHAIN_LABELS[chain]) {
    const btn = document.querySelector(`.chain-btn[data-chain="${chain}"]`);
    if (btn && chain !== currentChain) btn.click();
  }
  input.value = address;
  runAnalysis();
}

// ---------- tabs ----------

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    panels.forEach((p) => {
      p.hidden = p.dataset.panel !== target;
    });
  });
});

// ---------- chain toggle ----------

chainBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.chain === currentChain) return;
    currentChain = btn.dataset.chain;
    chainBtns.forEach((b) => b.classList.toggle("active", b === btn));
    input.placeholder = `Enter ${CHAIN_ARTICLE[currentChain]} ${CHAIN_LABELS[currentChain]} address`;
    input.value = "";
    heroSub.textContent = `Trace a suspect ${CHAIN_LABELS[currentChain]} wallet to the exchange it's tied to — with confidence scoring and cited on-chain evidence, not a black-box guess.`;
    resultsEl.hidden = true;
    batchResultsEl.hidden = true;
    statusEl.textContent = "";
    loadSamples();
  });
});

// ---------- stats ----------

function animateStatCount(total, exchangeCount, chains) {
  const duration = 800;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(total * eased);
    topbarStatsEl.textContent = `${current.toLocaleString()} tagged addresses · ${exchangeCount} exchanges · ${chains}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const stats = await res.json();
    const exchangeCount =
      (stats.categories.find(([cat]) => cat === "exchange") || [null, 0])[1];
    const chains = Object.keys(stats.by_currency || {}).join(" + ") || "BTC";
    animateStatCount(stats.tagged_addresses, exchangeCount, chains);
    pipelineMatchDesc.textContent = `${stats.tagged_addresses.toLocaleString()} tagged VASP addresses`;
  } catch (e) {
    topbarStatsEl.textContent = "dataset unavailable";
  }
}

// ---------- samples ----------

function sampleTag(description) {
  const d = description.toLowerCase();
  if (d.includes("flagged")) return { label: "flagged", cls: "tag-flagged" };
  if (d.includes("no match")) return { label: "no match", cls: "tag-nomatch" };
  if (d.includes("list of")) return { label: "ranked", cls: "tag-ranked" };
  return { label: "match", cls: "" };
}

// The API describes each sample as "<what it is> — expect <outcome>."; the outcome is shown as the tag, so keep the first half.
function sampleBlurb(description) {
  return description.split(" — ")[0].replace(/\.$/, "");
}

async function loadSamples() {
  try {
    const res = await fetch(`${API_BASE}/api/samples?chain=${currentChain}`);
    const samples = await res.json();
    samplesEl.innerHTML = "";
    samples.forEach((s) => {
      const chip = document.createElement("button");
      chip.className = "sample-chip";
      chip.type = "button";
      const tag = sampleTag(s.description);
      chip.innerHTML = `<span class="sample-tag ${tag.cls}">${tag.label}</span>
        <span class="sample-addr">${esc(s.address.slice(0, 10))}…</span>
        <span class="sample-desc">${esc(sampleBlurb(s.description))}</span>`;
      chip.addEventListener("click", () => {
        input.value = s.address;
        runAnalysis();
      });
      samplesEl.appendChild(chip);
    });
  } catch (e) {
    // samples are a convenience only; ignore failures
  }
}

// ---------- single-address analysis ----------

function confidenceClass(confidence) {
  return `badge-${confidence}`;
}

function isRisky(category) {
  return RISKY_CATEGORIES.has(category);
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 16;

function confidenceRingSvg(score, confidence) {
  const fraction = Math.min(score / 5, 1);
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  return `
    <div class="conf-ring-wrap">
      <svg class="conf-ring" viewBox="0 0 40 40">
        <circle class="conf-ring-bg" cx="20" cy="20" r="16" />
        <circle class="conf-ring-fill ${confidence}" cx="20" cy="20" r="16"
          stroke-dasharray="${RING_CIRCUMFERENCE}" stroke-dashoffset="${offset}" />
      </svg>
      <span class="conf-ring-score">${score}</span>
    </div>
  `;
}

function renderCandidates(candidates) {
  candidateListEl.innerHTML = "";
  if (candidates.length === 0) {
    candidateListEl.innerHTML =
      '<p class="no-results">No known VASP matched this address\'s transaction counterparties.</p>';
    return;
  }

  const txUrl = (txid) =>
    currentChain === "eth"
      ? `https://eth.blockscout.com/tx/${encodeURIComponent(txid)}`
      : `https://blockstream.info/tx/${encodeURIComponent(txid)}`;
  const safeUrl = (url) => (/^https?:\/\//i.test(url || "") ? esc(url) : "");
  const EVIDENCE_PREVIEW = 5;

  candidates.forEach((c) => {
    const card = document.createElement("div");
    const risky = isRisky(c.category);
    card.className = `candidate-card${risky ? " is-flagged" : ""}`;

    const evidenceRow = (e, i) => `<div class="evidence-item"${i >= EVIDENCE_PREVIEW ? " hidden" : ""}>
          hop ${e.hop} · ${esc(e.kind.replace("_", " "))} —
          <a href="${txUrl(e.txid)}" target="_blank" rel="noopener">${esc(e.txid.slice(0, 12))}…</a>
          ${safeUrl(e.source) ? `· <a href="${safeUrl(e.source)}" target="_blank" rel="noopener">source</a>` : ""}
        </div>`;
    const evidenceHtml = c.evidence.map(evidenceRow).join("");
    const showAllLabel = `Show all ${c.evidence.length} evidence items`;

    const riskBadge = risky ? '<span class="badge badge-risk">flagged</span>' : "";

    card.innerHTML = `
      <div class="candidate-header">
        <div class="candidate-title">
          ${confidenceRingSvg(c.score, c.confidence)}
          <span class="candidate-name">${esc(c.label)}</span>
        </div>
        <span class="badge-row">
          ${riskBadge}
          <span class="badge ${confidenceClass(c.confidence)}">${esc(c.confidence)}</span>
        </span>
      </div>
      <div class="candidate-meta">category: ${esc(c.category)} · score: ${esc(c.score)} · ${c.evidence.length} linked address(es)</div>
      <div class="evidence-list">${evidenceHtml}</div>
      ${c.evidence.length > EVIDENCE_PREVIEW ? `<button type="button" class="evidence-more" aria-expanded="false">${showAllLabel}</button>` : ""}
    `;

    const more = card.querySelector(".evidence-more");
    if (more) {
      more.addEventListener("click", () => {
        const expanded = more.getAttribute("aria-expanded") === "true";
        card.querySelectorAll(".evidence-item").forEach((el, i) => {
          if (i >= EVIDENCE_PREVIEW) el.hidden = expanded;
        });
        more.setAttribute("aria-expanded", String(!expanded));
        more.textContent = expanded ? showAllLabel : "Show fewer";
      });
    }
    candidateListEl.appendChild(card);
  });
}

function nodeColor(n) {
  if (n.role === "target") return "#fff1d6";
  if (n.role === "vasp") return isRisky(n.category) ? "#ff3b57" : "#ff5a1f";
  return "#6f655b";
}

function nodeSize(n) {
  if (n.role === "target") return 11;
  if (n.role === "vasp") return 8;
  return Math.max(2.5, 5 - (n.hop || 1));
}

function nodeLabel(n) {
  const short = `${n.id.slice(0, 8)}…${n.id.slice(-6)}`;
  if (n.role === "target") return `Target — ${short}`;
  if (n.role === "vasp") return `${n.label} — ${short}`;
  return `${short} (hop ${n.hop})`;
}

function renderGraph(graph) {
  if (typeof ForceGraph3D === "undefined") {
    // the library loads with defer; if a very fast response beats it, render once it has loaded
    window.addEventListener("load", () => renderGraph(graph), { once: true });
    return;
  }
  graphCountEl.textContent = `${graph.nodes.length} nodes · ${graph.edges.length} links`;
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    role: n.role,
    label: n.label,
    category: n.category,
    hop: n.hop,
  }));

  const links = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
    hop: e.hop,
  }));

  if (!graph3d) {
    graph3d = ForceGraph3D()(graphEl)
      .backgroundColor("#0e0b0a")
      .nodeLabel(nodeLabel)
      .nodeColor(nodeColor)
      .nodeVal(nodeSize)
      .nodeOpacity(1)
      .nodeRelSize(3)
      .warmupTicks(150)
      .cooldownTime(4000)
      .linkCurvature(0.28)
      .linkWidth((l) => (l.hop === 1 ? 1.1 : 0.6))
      .linkColor((l) => {
        const t = typeof l.target === "object" ? l.target : null;
        if (t && t.role === "vasp") {
          return isRisky(t.category) ? "rgba(255,59,87,0.7)" : "rgba(255,90,31,0.7)";
        }
        return "rgba(255,178,61,0.3)";
      })
      .linkDirectionalParticleColor(() => "#ffb23d")
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .showNavInfo(false);

    // spread the layout out so dense graphs stay legible
    graph3d.d3Force("charge").strength(-90);
    graph3d.d3Force("link").distance(42);
  }

  const enableParticles = links.length <= 80;
  graph3d
    .width(graphEl.clientWidth)
    .height(graphEl.clientHeight)
    .linkDirectionalParticles(enableParticles ? 2 : 0)
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(0.006)
    .graphData({ nodes, links });

  // frame the graph once the layout has mostly settled, and again when the engine stops
  graph3d.onEngineStop(() => graph3d.zoomToFit(500, 70));
  setTimeout(() => graph3d && graph3d.zoomToFit(700, 70), 1400);
}

// keep the canvas matched to its panel through window resizes and layout changes
new ResizeObserver(() => {
  if (graph3d && !resultsEl.hidden && graphEl.clientWidth > 0) {
    graph3d.width(graphEl.clientWidth).height(graphEl.clientHeight);
  }
}).observe(graphEl);

async function runAnalysis() {
  const address = input.value.trim();
  if (!address) return;

  analyzeBtn.disabled = true;
  statusEl.textContent = "Analyzing…";
  resultsEl.hidden = true;
  pipelineStart();

  try {
    const res = await fetch(`${API_BASE}/api/attribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, chain: currentChain }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    const result = await res.json();
    lastResult = result;
    lastAddress = address;
    statusEl.textContent = `Data source: ${result.data_source} · ${result.tx_count_analyzed} transaction(s) on target · traced ${result.addresses_traced} address(es) across ${result.hops} hop(s)`;
    renderCandidates(result.candidates);
    resultsEl.hidden = false;
    renderGraph(result.graph);
    updateUrlState(address, currentChain);
    pipelineFinish(true);
    resultsEl.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
    pipelineFinish(false);
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", runAnalysis);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runAnalysis();
});

// ---------- batch upload ----------

function parseAddresses(text) {
  return text
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
}

browseBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  file.text().then((text) => {
    batchTextarea.value = parseAddresses(text).join("\n");
  });
});

["dragover", "dragenter"].forEach((evt) =>
  uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
  })
);

uploadArea.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  file.text().then((text) => {
    batchTextarea.value = parseAddresses(text).join("\n");
  });
});

function renderBatchResults(results) {
  batchTbody.innerHTML = "";
  results.forEach((r) => {
    const tr = document.createElement("tr");
    if (!r.ok) {
      tr.innerHTML = `
        <td class="mono">${esc(r.address)}</td>
        <td colspan="4" class="row-error">${esc(r.error)}</td>
      `;
      batchTbody.appendChild(tr);
      return;
    }
    const top = r.top_candidate;
    tr.innerHTML = `
      <td class="mono">${esc(r.address.slice(0, 10))}…${esc(r.address.slice(-4))}</td>
      <td>${esc(r.data_source)}</td>
      <td>${esc(r.tx_count_analyzed)}</td>
      <td>${top ? esc(top.label) : "—"}</td>
      <td>${top ? `${isRisky(top.category) ? '<span class="badge badge-risk">flagged</span>' : ""}<span class="badge ${confidenceClass(top.confidence)}">${esc(top.confidence)}</span>` : "—"}</td>
    `;
    batchTbody.appendChild(tr);
  });
  batchResultsEl.hidden = false;
}

batchAnalyzeBtn.addEventListener("click", async () => {
  const addresses = parseAddresses(batchTextarea.value);
  if (addresses.length === 0) {
    statusEl.textContent = "Enter at least one address to run a batch.";
    return;
  }

  batchAnalyzeBtn.disabled = true;
  statusEl.textContent = `Analyzing ${addresses.length} address(es)…`;
  pipelineStart();

  try {
    const res = await fetch(`${API_BASE}/api/attribute/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses, chain: currentChain }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    const { results } = await res.json();
    statusEl.textContent = `Batch complete — ${results.length} address(es) processed.`;
    renderBatchResults(results);
    pipelineFinish(true);
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
    pipelineFinish(false);
  } finally {
    batchAnalyzeBtn.disabled = false;
  }
});

// ---------- report export ----------

function captureGraphImage() {
  try {
    if (!graph3d) return null;
    // Force a fresh paint immediately before reading the canvas - without
    // preserveDrawingBuffer, the buffer can be cleared before we get to it.
    graph3d.renderer().render(graph3d.scene(), graph3d.camera());
    const dataUrl = graph3d.renderer().domElement.toDataURL("image/png");
    return dataUrl.length > 100 ? dataUrl : null;
  } catch (e) {
    return null;
  }
}

function buildReportHtml(address, result, graphImgDataUrl) {
  const generated = new Date().toLocaleString();

  const candidatesHtml = result.candidates.length
    ? result.candidates
        .map((c) => {
          const evidenceHtml = c.evidence
            .map(
              (e) =>
                `<div class="report-evidence">hop ${e.hop} · ${esc(e.kind.replace("_", " "))} · tx ${esc(e.txid)}${e.source ? " · source: " + esc(e.source) : ""}</div>`
            )
            .join("");
          return `
            <div class="report-candidate">
              <div class="report-candidate-head">
                <span>${esc(c.label)}${isRisky(c.category) ? " — FLAGGED" : ""}</span>
                <span>${esc(c.confidence.toUpperCase())} &middot; score ${esc(c.score)}</span>
              </div>
              <div class="report-candidate-meta">category: ${esc(c.category)} &middot; actor: ${esc(c.actor)}</div>
              ${evidenceHtml}
            </div>`;
        })
        .join("")
    : "<p>No known VASP matched this address's transaction counterparties.</p>";

  const graphHtml = graphImgDataUrl
    ? `<h3>Transaction Graph</h3><img class="report-graph-img" src="${graphImgDataUrl}" />`
    : "";

  return `
    <div class="report-title">ChainBreach — Wallet Attribution Report</div>
    <div class="report-sub">SIH26182 &middot; Automated Attribution of Unknown Cryptocurrency Wallets to VASPs</div>
    <div class="report-meta">
      <div><span>Target Address</span>${esc(address)}</div>
      <div><span>Generated</span>${generated}</div>
      <div><span>Data Source</span>${esc(result.data_source)}</div>
      <div><span>Transactions Analyzed</span>${result.tx_count_analyzed}</div>
      <div><span>Addresses Traced</span>${result.addresses_traced}</div>
      <div><span>Hops</span>${result.hops}</div>
    </div>
    <h3>Attribution Candidates</h3>
    ${candidatesHtml}
    ${graphHtml}
    <div class="report-footer">
      Generated by ChainBreach — an automated wallet-to-VASP attribution tool. All evidence is sourced from public blockchain data and citable VASP tag sources (GraphSense TagPacks). This report surfaces an investigative lead; verify independently before acting on it.
    </div>
  `;
}

exportReportBtn.addEventListener("click", () => {
  if (!lastResult || !lastAddress) return;
  const graphImg = captureGraphImage();
  reportEl.innerHTML = buildReportHtml(lastAddress, lastResult, graphImg);
  window.print();
});

copyLinkBtn.addEventListener("click", async () => {
  if (!lastAddress) return;
  updateUrlState(lastAddress, currentChain);
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Link copied to clipboard", "success");
  } catch (e) {
    showToast("Couldn't copy link", "error");
  }
});

loadStats();
loadSamples();
loadFromUrl();
