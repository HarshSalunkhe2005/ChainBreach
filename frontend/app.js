const API_BASE = "";

const input = document.getElementById("address-input");
const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const candidateListEl = document.getElementById("candidate-list");
const samplesEl = document.getElementById("samples");
const graphEl = document.getElementById("graph");

let network = null;

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

function confidenceClass(confidence) {
  return `confidence-${confidence}`;
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
          <strong>${e.kind.replace("_", " ")}</strong> —
          <a href="https://blockstream.info/tx/${e.txid}" target="_blank" rel="noopener">${e.txid.slice(0, 12)}…</a>
          ${e.source ? `· <a href="${e.source}" target="_blank" rel="noopener">source</a>` : ""}
        </div>`
      )
      .join("");

    card.innerHTML = `
      <div class="candidate-header">
        <span class="candidate-name">${c.label}</span>
        <span class="confidence-badge ${confidenceClass(c.confidence)}">${c.confidence}</span>
      </div>
      <div class="candidate-meta">category: ${c.category} · score: ${c.score} · ${c.evidence.length} linked address(es)</div>
      <div class="evidence-list">${evidenceHtml}</div>
    `;
    candidateListEl.appendChild(card);
  });
}

function renderGraph(graph, targetAddress) {
  const nodes = graph.nodes.map((n) => {
    let color = "#6b7684";
    let shape = "dot";
    let size = 14;
    let label = `${n.id.slice(0, 6)}…${n.id.slice(-4)}`;

    if (n.role === "target") {
      color = "#4f8cff";
      size = 22;
    } else if (n.role === "vasp") {
      color = "#ef5350";
      size = 20;
      label = n.label;
    }

    return { id: n.id, label, color, shape, size, font: { color: "#e6edf3" } };
  });

  const edges = graph.edges.map((e) => ({
    from: e.source,
    to: e.target,
    arrows: "to",
    color: { color: "#39465a" },
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
    renderGraph(result.graph, address);
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

loadSamples();
