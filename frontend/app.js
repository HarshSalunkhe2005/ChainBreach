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
const reportEl = document.getElementById("report");
const chainBtns = document.querySelectorAll(".chain-btn");
const heroSub = document.querySelector(".hero-sub");

const CHAIN_LABELS = { btc: "Bitcoin", eth: "Ethereum" };
const CHAIN_ARTICLE = { btc: "a", eth: "an" };

let graph3d = null;
let lastResult = null;
let lastAddress = null;
let currentChain = "btc";

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
    heroSub.textContent = `Trace ${CHAIN_ARTICLE[currentChain]} suspect ${CHAIN_LABELS[currentChain]} wallet to the exchange it's tied to — with confidence scoring and cited on-chain evidence, not a black-box guess.`;
    resultsEl.hidden = true;
    batchResultsEl.hidden = true;
    statusEl.textContent = "";
    loadSamples();
  });
});

// ---------- stats ----------

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const stats = await res.json();
    const exchangeCount =
      (stats.categories.find(([cat]) => cat === "exchange") || [null, 0])[1];
    const chains = Object.keys(stats.by_currency || {}).join(" + ") || "BTC";
    topbarStatsEl.textContent = `${stats.tagged_addresses.toLocaleString()} tagged addresses · ${exchangeCount} exchanges · ${chains}`;
  } catch (e) {
    topbarStatsEl.textContent = "dataset unavailable";
  }
}

// ---------- samples ----------

async function loadSamples() {
  try {
    const res = await fetch(`${API_BASE}/api/samples?chain=${currentChain}`);
    const samples = await res.json();
    samplesEl.innerHTML = "";
    samples.forEach((s) => {
      const chip = document.createElement("button");
      chip.className = "sample-chip";
      chip.type = "button";
      chip.textContent = `${s.address.slice(0, 10)}… — ${s.description}`;
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

function renderCandidates(candidates) {
  candidateListEl.innerHTML = "";
  if (candidates.length === 0) {
    candidateListEl.innerHTML =
      '<p class="no-results">No known VASP matched this address\'s transaction counterparties.</p>';
    return;
  }

  candidates.forEach((c) => {
    const card = document.createElement("div");
    card.className = "candidate-card";

    const txUrl = (txid) =>
      currentChain === "eth"
        ? `https://eth.blockscout.com/tx/${txid}`
        : `https://blockstream.info/tx/${txid}`;

    const evidenceHtml = c.evidence
      .slice(0, 5)
      .map(
        (e) => `<div class="evidence-item">
          hop ${e.hop} · ${e.kind.replace("_", " ")} —
          <a href="${txUrl(e.txid)}" target="_blank" rel="noopener">${e.txid.slice(0, 12)}…</a>
          ${e.source ? `· <a href="${e.source}" target="_blank" rel="noopener">source</a>` : ""}
        </div>`
      )
      .join("");

    const riskBadge = isRisky(c.category) ? '<span class="badge badge-risk">flagged</span>' : "";

    card.innerHTML = `
      <div class="candidate-header">
        <span class="candidate-name">${c.label}</span>
        <span class="badge-row">
          ${riskBadge}
          <span class="badge ${confidenceClass(c.confidence)}">${c.confidence}</span>
        </span>
      </div>
      <div class="candidate-meta">category: ${c.category} · score: ${c.score} · ${c.evidence.length} linked address(es)</div>
      <div class="evidence-list">${evidenceHtml}</div>
    `;
    candidateListEl.appendChild(card);
  });
}

function nodeColor(n) {
  if (n.role === "target") return "#5b8cff";
  if (n.role === "vasp") return isRisky(n.category) ? "#ef4444" : "#35d0ba";
  return "#6b7684";
}

function nodeSize(n) {
  if (n.role === "target") return 9;
  if (n.role === "vasp") return 7;
  return Math.max(2.5, 5 - (n.hop || 1));
}

function nodeLabel(n) {
  const short = `${n.id.slice(0, 8)}…${n.id.slice(-6)}`;
  if (n.role === "target") return `Target — ${short}`;
  if (n.role === "vasp") return `${n.label} — ${short}`;
  return `${short} (hop ${n.hop})`;
}

function renderGraph(graph) {
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
      .backgroundColor("#0a0e14")
      .nodeLabel(nodeLabel)
      .nodeColor(nodeColor)
      .nodeVal(nodeSize)
      .nodeOpacity(0.95)
      .linkCurvature(0.28)
      .linkWidth((l) => (l.hop === 1 ? 1.1 : 0.6))
      .linkColor((l) => {
        const t = typeof l.target === "object" ? l.target : null;
        if (t && t.role === "vasp") {
          return isRisky(t.category) ? "rgba(239,68,68,0.6)" : "rgba(53,208,186,0.55)";
        }
        return "rgba(91,140,255,0.22)";
      })
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .showNavInfo(false);
  }

  const enableParticles = links.length <= 80;
  graph3d
    .width(graphEl.clientWidth)
    .height(graphEl.clientHeight)
    .linkDirectionalParticles(enableParticles ? 2 : 0)
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(0.006)
    .graphData({ nodes, links });

  graph3d.onEngineStop(() => graph3d.zoomToFit(400, 60));
}

window.addEventListener("resize", () => {
  if (graph3d && !resultsEl.hidden) {
    graph3d.width(graphEl.clientWidth).height(graphEl.clientHeight);
  }
});

async function runAnalysis() {
  const address = input.value.trim();
  if (!address) return;

  analyzeBtn.disabled = true;
  statusEl.textContent = "Analyzing…";
  resultsEl.hidden = true;

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
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
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
        <td class="mono">${r.address}</td>
        <td colspan="4" class="row-error">${r.error}</td>
      `;
      batchTbody.appendChild(tr);
      return;
    }
    const top = r.top_candidate;
    tr.innerHTML = `
      <td class="mono">${r.address.slice(0, 10)}…${r.address.slice(-4)}</td>
      <td>${r.data_source}</td>
      <td>${r.tx_count_analyzed}</td>
      <td>${top ? top.label : "—"}</td>
      <td>${top ? `<span class="badge ${confidenceClass(top.confidence)}">${top.confidence}</span>` : "—"}</td>
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
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
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
                `<div class="report-evidence">hop ${e.hop} · ${e.kind.replace("_", " ")} · tx ${e.txid}${e.source ? " · source: " + e.source : ""}</div>`
            )
            .join("");
          return `
            <div class="report-candidate">
              <div class="report-candidate-head">
                <span>${c.label}${isRisky(c.category) ? " — FLAGGED" : ""}</span>
                <span>${c.confidence.toUpperCase()} &middot; score ${c.score}</span>
              </div>
              <div class="report-candidate-meta">category: ${c.category} &middot; actor: ${c.actor}</div>
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
      <div><span>Target Address</span>${address}</div>
      <div><span>Generated</span>${generated}</div>
      <div><span>Data Source</span>${result.data_source}</div>
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

loadStats();
loadSamples();
