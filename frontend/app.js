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

let network = null;

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

// ---------- stats ----------

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const stats = await res.json();
    const exchangeCount =
      (stats.categories.find(([cat]) => cat === "exchange") || [null, 0])[1];
    topbarStatsEl.textContent = `${stats.tagged_addresses.toLocaleString()} tagged addresses · ${exchangeCount} exchanges · BTC`;
  } catch (e) {
    topbarStatsEl.textContent = "dataset unavailable";
  }
}

// ---------- samples ----------

async function loadSamples() {
  try {
    const res = await fetch(`${API_BASE}/api/samples`);
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

    const evidenceHtml = c.evidence
      .slice(0, 5)
      .map(
        (e) => `<div class="evidence-item">
          ${e.kind.replace("_", " ")} —
          <a href="https://blockstream.info/tx/${e.txid}" target="_blank" rel="noopener">${e.txid.slice(0, 12)}…</a>
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

function renderGraph(graph) {
  const nodes = graph.nodes.map((n) => {
    let color = "#6b7684";
    let size = 14;
    let label = `${n.id.slice(0, 6)}…${n.id.slice(-4)}`;

    if (n.role === "target") {
      color = "#5b8cff";
      size = 22;
    } else if (n.role === "vasp") {
      color = isRisky(n.category) ? "#ef4444" : "#35d0ba";
      size = 20;
      label = n.label;
    }

    return { id: n.id, label, color, shape: "dot", size, font: { color: "#e7ecf3", face: "IBM Plex Sans" } };
  });

  const edges = graph.edges.map((e) => ({
    from: e.source,
    to: e.target,
    arrows: "to",
    color: { color: "#2b3549" },
    title: e.kind,
  }));

  const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  const options = {
    physics: {
      stabilization: { iterations: 150, fit: true },
      barnesHut: { gravitationalConstant: -4000 },
    },
    interaction: { hover: true },
  };

  if (network) network.destroy();
  network = new vis.Network(graphEl, data, options);
  network.once("stabilizationIterationsDone", () => {
    network.setOptions({ physics: false });
  });
}

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
      body: JSON.stringify({ address }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    const result = await res.json();
    statusEl.textContent = `Data source: ${result.data_source} · ${result.tx_count_analyzed} transaction(s) analyzed`;
    renderCandidates(result.candidates);
    renderGraph(result.graph);
    resultsEl.hidden = false;
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
      body: JSON.stringify({ addresses }),
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

loadStats();
loadSamples();
