(function () {
  const BROADCAST_MAC = "FF:FF:FF:FF:FF:FF";
  const UNKNOWN_MAC = "00:00:00:00:00:00";

  function ipToInt(ip) {
    return ip
      .split(".")
      .map((part) => Number(part))
      .reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
  }

  function sameSubnet(ipA, ipB, mask) {
    return (ipToInt(ipA) & ipToInt(mask)) === (ipToInt(ipB) & ipToInt(mask));
  }

  function maskToPrefix(mask) {
    return mask
      .split(".")
      .map((part) => Number(part).toString(2))
      .map((chunk) => chunk.padStart(8, "0"))
      .join("")
      .replace(/0/g, "").length;
  }

  function clone(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTable(container, columns, rows, emptyText) {
    if (!container) {
      return;
    }

    if (!rows.length) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const header = columns
      .map((column) => `<th>${escapeHtml(column.label)}</th>`)
      .join("");
    const body = rows
      .map((row) => {
        const cells = columns
          .map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    container.innerHTML = `
      <table>
        <thead>
          <tr>${header}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function renderInspector(container, sections) {
    if (!container) {
      return;
    }

    if (!sections || !sections.length) {
      container.innerHTML = `<div class="empty-state">Clique em iniciar para inspecionar o próximo cabeçalho da simulação.</div>`;
      return;
    }

    container.innerHTML = sections
      .map((section) => {
        const pairs = (section.items || [])
          .map(
            (item) => `
              <div class="pair">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
              </div>
            `,
          )
          .join("");

        return `
          <div class="inspector-section">
            <strong>${escapeHtml(section.title)}</strong>
            <div class="pair-grid">${pairs}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderTimeline(container, entries) {
    if (!container) {
      return;
    }

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state">O histórico vai sendo preenchido conforme cada passo for executado.</div>`;
      return;
    }

    container.innerHTML = entries
      .slice()
      .reverse()
      .map(
        (entry) => `
          <article class="timeline-item">
            <div class="timeline-dot ${escapeHtml(entry.tone)}"></div>
            <div>
              <strong>${escapeHtml(entry.title)}</strong>
              <p>${escapeHtml(entry.summary)}</p>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function setProgress(bar, current, total) {
    if (!bar) {
      return;
    }

    const percent = total ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;
    bar.style.width = `${percent}%`;
  }

  function getNodeCenter(stage, node) {
    const stageRect = stage.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return {
      x: nodeRect.left - stageRect.left + nodeRect.width / 2,
      y: nodeRect.top - stageRect.top + nodeRect.height / 2,
    };
  }

  function wait(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  async function animatePacket(options) {
    const { stage, badge, from, to, label, tone } = options;
    if (!stage || !badge || !from || !to) {
      return;
    }

    const start = getNodeCenter(stage, from);
    const finish = getNodeCenter(stage, to);

    badge.className = `packet-badge packet-${tone}`;
    badge.textContent = label;
    badge.style.left = `${start.x}px`;
    badge.style.top = `${start.y}px`;
    badge.style.transition = "none";
    badge.classList.add("is-visible");

    await wait(24);

    badge.style.transition = "left 0.78s ease, top 0.78s ease, opacity 0.2s ease";
    badge.style.left = `${finish.x}px`;
    badge.style.top = `${finish.y}px`;

    await wait(820);

    badge.classList.remove("is-visible");
  }

  function pulseNodes(nodes, tone) {
    nodes
      .filter(Boolean)
      .forEach((node) => {
        node.classList.add("is-active", `is-${tone}`);
      });

    window.setTimeout(() => {
      nodes
        .filter(Boolean)
        .forEach((node) => {
          node.classList.remove("is-active", `is-${tone}`);
        });
    }, 820);
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function updateProtocolPill(element, tone, label) {
    if (!element) {
      return;
    }

    element.className = `protocol-pill ${tone}`;
    element.textContent = label;
  }

  function makeNatPort(counter) {
    return 62000 + counter;
  }

  window.NetworkSim = {
    BROADCAST_MAC,
    UNKNOWN_MAC,
    clone,
    sameSubnet,
    maskToPrefix,
    renderTable,
    renderInspector,
    renderTimeline,
    setProgress,
    animatePacket,
    pulseNodes,
    setText,
    updateProtocolPill,
    makeNatPort,
    wait,
  };
})();
