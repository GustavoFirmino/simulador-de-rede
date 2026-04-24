document.addEventListener("DOMContentLoaded", () => {
  const Sim = window.NetworkSim;

  const BASE_DEVICES = {
    a: {
      id: "pc-a",
      name: "PC A",
      ip: "192.168.10.10",
      mask: "255.255.255.0",
      mac: "00:1A:2B:3C:4D:0A",
      port: "Fa0/1",
      arp: {},
    },
    b: {
      id: "pc-b",
      name: "PC B",
      ip: "192.168.10.20",
      mask: "255.255.255.0",
      mac: "00:1A:2B:3C:4D:14",
      port: "Fa0/2",
      arp: {},
    },
    c: {
      id: "pc-c",
      name: "PC C",
      ip: "192.168.10.30",
      mask: "255.255.255.0",
      mac: "00:1A:2B:3C:4D:1E",
      port: "Fa0/3",
      arp: {},
    },
  };

  const elements = {
    startCold: document.getElementById("start-cold"),
    startWarm: document.getElementById("start-warm"),
    nextStep: document.getElementById("next-step"),
    autoRun: document.getElementById("auto-run"),
    reset: document.getElementById("reset-arp"),
    inspector: document.getElementById("arp-inspector"),
    timeline: document.getElementById("arp-timeline"),
    progress: document.getElementById("arp-progress"),
    statusText: document.getElementById("arp-status-text"),
    statusPill: document.getElementById("arp-status-pill"),
    stepLabel: document.getElementById("arp-step-label"),
    protocol: document.getElementById("current-protocol"),
    switchTable: document.getElementById("table-switch-mac"),
    arpA: document.getElementById("table-arp-a"),
    arpB: document.getElementById("table-arp-b"),
    arpC: document.getElementById("table-arp-c"),
    stage: document.getElementById("arp-stage"),
    badge: document.getElementById("packet-badge-arp"),
  };

  const nodeEls = {
    a: document.getElementById("node-pc-a"),
    b: document.getElementById("node-pc-b"),
    c: document.getElementById("node-pc-c"),
    switch: document.getElementById("node-switch"),
  };

  const arpColumns = [
    { key: "ip", label: "IP" },
    { key: "mac", label: "MAC" },
    { key: "source", label: "Aprendido em" },
  ];

  const switchColumns = [
    { key: "mac", label: "MAC" },
    { key: "port", label: "Porta" },
    { key: "device", label: "Origem" },
  ];

  let state;

  function createState() {
    return {
      devices: Sim.clone(BASE_DEVICES),
      switchTable: {},
      history: [],
      steps: [],
      currentStepIndex: 0,
      busy: false,
      queuedStep: false,
      auto: false,
      scenario: null,
      currentSnapshot: null,
      coldComplete: false,
    };
  }

  function makeSnapshot(step) {
    return {
      tone: typeof step.tone === "function" ? step.tone() : step.tone,
      protocolLabel:
        typeof step.protocolLabel === "function" ? step.protocolLabel() : step.protocolLabel,
      title: typeof step.title === "function" ? step.title() : step.title,
      summary: typeof step.summary === "function" ? step.summary() : step.summary,
      inspector: typeof step.inspector === "function" ? step.inspector() : step.inspector,
    };
  }

  function updateStatusPill(label, tone) {
    elements.statusPill.className = "status-pill";
    if (tone) {
      elements.statusPill.classList.add(tone);
    }
    elements.statusPill.textContent = label;
  }

  function setStepLabel() {
    const total = state.steps.length;
    const done = state.history.length;
    elements.stepLabel.textContent = total ? `${done} de ${total} passos` : "0 passos executados";
  }

  function renderArpTables() {
    const rowsFor = (device) =>
      Object.entries(device.arp).map(([ip, entry]) => ({
        ip,
        mac: entry.mac,
        source: entry.source,
      }));

    Sim.renderTable(elements.arpA, arpColumns, rowsFor(state.devices.a), "Tabela ARP vazia.");
    Sim.renderTable(elements.arpB, arpColumns, rowsFor(state.devices.b), "Tabela ARP vazia.");
    Sim.renderTable(elements.arpC, arpColumns, rowsFor(state.devices.c), "Tabela ARP vazia.");
  }

  function renderSwitchTable() {
    const rows = Object.entries(state.switchTable).map(([mac, entry]) => ({
      mac,
      port: entry.port,
      device: entry.device,
    }));
    Sim.renderTable(
      elements.switchTable,
      switchColumns,
      rows,
      "Nenhum MAC aprendido ainda pelo switch.",
    );
  }

  function renderSnapshot() {
    Sim.renderInspector(elements.inspector, state.currentSnapshot?.inspector || []);
    Sim.renderTimeline(elements.timeline, state.history);
    Sim.updateProtocolPill(
      elements.protocol,
      state.currentSnapshot?.tone || "logic",
      state.currentSnapshot?.protocolLabel || "Aguardando",
    );
    Sim.setProgress(elements.progress, state.history.length, state.steps.length || 1);
  }

  function renderStatus() {
    renderArpTables();
    renderSwitchTable();
    renderSnapshot();
    setStepLabel();

    if (!state.scenario) {
      updateStatusPill("Estado zerado", "");
      Sim.setText(
        elements.statusText,
        "Pronto para iniciar o comando `ping` do PC A para o PC C.",
      );
    } else if (state.currentStepIndex < state.steps.length) {
      updateStatusPill("Simulação em andamento", "warning");
      Sim.setText(
        elements.statusText,
        state.currentSnapshot?.summary || "Aguardando o próximo passo da pilha.",
      );
    } else if (state.scenario === "cold") {
      updateStatusPill("Ping concluído", "success");
      Sim.setText(
        elements.statusText,
        "O primeiro ping terminou com ARP completo, ARP cache preenchido e switch já aprendendo as portas.",
      );
    } else {
      updateStatusPill("Segundo ping concluído", "success");
      Sim.setText(
        elements.statusText,
        "O novo ping usou cache ARP e seguiu somente por unicast, sem repetir a descoberta.",
      );
    }

    const hasPending = state.currentStepIndex < state.steps.length;
    elements.startCold.disabled = state.busy;
    elements.reset.disabled = state.busy;
    elements.startWarm.disabled = state.busy || !state.coldComplete || hasPending;
    elements.nextStep.disabled = !hasPending;
    elements.autoRun.disabled = state.busy || !hasPending;
    elements.nextStep.textContent = state.busy
      ? state.queuedStep
        ? "Próximo na fila"
        : "Executando..."
      : "Próximo passo";
  }

  function ethernetSection(sourceMac, destinationMac, note) {
    return {
      title: "Quadro Ethernet",
      items: [
        { label: "MAC de origem", value: sourceMac },
        { label: "MAC de destino", value: destinationMac },
        { label: "Encapsulamento", value: note },
      ],
    };
  }

  function ipSection(sourceIp, destinationIp, note) {
    return {
      title: "Pacote IP",
      items: [
        { label: "IP de origem", value: sourceIp },
        { label: "IP de destino", value: destinationIp },
        { label: "Observação", value: note },
      ],
    };
  }

  function arpSection(type, senderMac, senderIp, targetMac, targetIp) {
    return {
      title: "Mensagem ARP",
      items: [
        { label: "Operation code", value: type },
        { label: "Sender MAC/IP", value: `${senderMac} / ${senderIp}` },
        { label: "Target MAC/IP", value: `${targetMac} / ${targetIp}` },
      ],
    };
  }

  function icmpSection(kind, note) {
    return {
      title: "Conteúdo ICMP",
      items: [
        { label: "Tipo", value: kind },
        { label: "Status", value: note },
      ],
    };
  }

  function decisionSection(items) {
    return {
      title: "Decisão lógica",
      items,
    };
  }

  function addArpEntry(deviceKey, ip, mac, source) {
    state.devices[deviceKey].arp[ip] = { mac, source };
  }

  function learnSwitch(mac, port, device) {
    state.switchTable[mac] = { port, device };
  }

  function buildColdSteps() {
    const a = state.devices.a;
    const b = state.devices.b;
    const c = state.devices.c;

    return [
      {
        tone: "logic",
        protocolLabel: "Decisão de camada 3",
        title: "PC A valida a máscara e conclui que o PC C está na mesma rede",
        summary: () =>
          `${a.ip}/${Sim.maskToPrefix(a.mask)} e ${c.ip}/${Sim.maskToPrefix(a.mask)} pertencem à LAN 192.168.10.0/24, então o próximo passo é descobrir o MAC do destino.`,
        inspector: () => [
          decisionSection([
            { label: "Origem", value: `${a.ip}/${Sim.maskToPrefix(a.mask)}` },
            { label: "Destino", value: `${c.ip}/${Sim.maskToPrefix(a.mask)}` },
            { label: "Conclusão", value: "Mesmo domínio de broadcast; não há gateway envolvido." },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a, nodeEls.c], "logic");
          await Sim.wait(420);
        },
      },
      {
        tone: "logic",
        protocolLabel: "Checagem de cache",
        title: "Tabela ARP de A está vazia e o ping fica aguardando",
        summary:
          "O sistema operacional ainda não consegue preencher o MAC de destino do quadro Ethernet. O ICMP Echo Request fica em espera até a resolução ARP terminar.",
        inspector: () => [
          decisionSection([
            { label: "Cache ARP de A", value: "Sem entrada para 192.168.10.30" },
            { label: "Quadro Ethernet", value: "Ainda não pode ser montado" },
            { label: "Comando ping", value: "Em espera até descobrir o MAC de C" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a], "logic");
          await Sim.wait(420);
        },
      },
      {
        tone: "arp",
        protocolLabel: "ARP Request",
        title: "PC A envia um ARP Request em broadcast para o switch",
        summary:
          "O quadro sai com MAC de destino FF:FF:FF:FF:FF:FF e pergunta quem possui o IP 192.168.10.30.",
        inspector: () => [
          ethernetSection(a.mac, Sim.BROADCAST_MAC, "Broadcast em camada 2"),
          arpSection("Request", a.mac, a.ip, Sim.UNKNOWN_MAC, c.ip),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.a,
            to: nodeEls.switch,
            label: "ARP Request",
            tone: "arp",
          });
        },
      },
      {
        tone: "arp",
        protocolLabel: "Flood do switch",
        before: () => {
          learnSwitch(a.mac, a.port, a.name);
        },
        title: "Switch aprende o MAC de A na Fa0/1 e faz flood pelas demais portas",
        summary:
          "Como o destino do quadro é broadcast, o switch replica o ARP Request para todas as portas ativas, exceto a porta de entrada.",
        inspector: () => [
          ethernetSection(a.mac, Sim.BROADCAST_MAC, "Replicado para Fa0/2 e Fa0/3"),
          decisionSection([
            { label: "MAC aprendido", value: `${a.mac} → ${a.port}` },
            { label: "Ação do switch", value: "Flood nas outras portas ativas" },
            { label: "Porta preservada", value: "Fa0/1 não recebe cópia de volta" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.switch], "arp");
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.b,
            label: "Flood",
            tone: "arp",
          });
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.c,
            label: "Flood",
            tone: "arp",
          });
        },
      },
      {
        tone: "arp",
        protocolLabel: "Processamento do broadcast",
        title: "PC B recebe a cópia, compara o Target IP e descarta a mensagem",
        summary:
          "PC B participa do domínio de broadcast, mas não responde porque o endereço procurado não é o seu.",
        inspector: () => [
          arpSection("Request", a.mac, a.ip, Sim.UNKNOWN_MAC, c.ip),
          decisionSection([
            { label: "IP local de B", value: b.ip },
            { label: "Target IP recebido", value: c.ip },
            { label: "Ação", value: "Descartar sem responder" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.b], "arp");
          await Sim.wait(420);
        },
      },
      {
        tone: "arp",
        protocolLabel: "Processamento do broadcast",
        before: () => {
          addArpEntry("c", a.ip, a.mac, "ARP Request recebido");
        },
        title: "PC C reconhece o próprio IP e já aprende o MAC do remetente",
        summary:
          "O próprio ARP Request traz Sender MAC/IP. Por isso o PC C já consegue registrar quem perguntou antes de responder.",
        inspector: () => [
          arpSection("Request", a.mac, a.ip, Sim.UNKNOWN_MAC, c.ip),
          decisionSection([
            { label: "IP local de C", value: c.ip },
            { label: "Coincidência", value: "Target IP combina com o host" },
            { label: "Tabela ARP de C", value: `${a.ip} → ${a.mac}` },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.c], "arp");
          await Sim.wait(420);
        },
      },
      {
        tone: "arp",
        protocolLabel: "ARP Reply",
        title: "PC C monta um ARP Reply unicast endereçado diretamente para A",
        summary:
          "A resposta deixa de ser broadcast. Agora o quadro tem destino específico no MAC do PC A.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Unicast em camada 2"),
          arpSection("Reply", c.mac, c.ip, a.mac, a.ip),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.c,
            to: nodeEls.switch,
            label: "ARP Reply",
            tone: "arp",
          });
        },
      },
      {
        tone: "arp",
        protocolLabel: "Encaminhamento unicast",
        before: () => {
          learnSwitch(c.mac, c.port, c.name);
        },
        title: "Switch aprende o MAC de C na Fa0/3 e envia o reply só para o PC A",
        summary:
          "Com o destino unicast e a tabela MAC já conhecendo A na Fa0/1, o switch não precisa mais fazer flood.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Encaminhado para Fa0/1"),
          decisionSection([
            { label: "Novo MAC aprendido", value: `${c.mac} → ${c.port}` },
            { label: "Consulta da tabela", value: `${a.mac} já associado à Fa0/1` },
            { label: "Ação do switch", value: "Unicast direto para A" },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.a,
            label: "Unicast",
            tone: "arp",
          });
        },
      },
      {
        tone: "arp",
        protocolLabel: "ARP cache preenchido",
        before: () => {
          addArpEntry("a", c.ip, c.mac, "ARP Reply recebido");
        },
        title: "PC A grava a entrada ARP de C e libera o ping que estava parado",
        summary:
          "Agora A conhece o MAC de C e consegue finalizar o cabeçalho Ethernet para transmitir o ICMP.",
        inspector: () => [
          arpSection("Reply", c.mac, c.ip, a.mac, a.ip),
          decisionSection([
            { label: "Nova entrada em A", value: `${c.ip} → ${c.mac}` },
            { label: "Estado do ping", value: "Sai da fila de espera" },
            { label: "Próximo passo", value: "Enviar ICMP Echo Request em unicast" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a], "arp");
          await Sim.wait(420);
        },
      },
      {
        tone: "icmp",
        protocolLabel: "ICMP Echo Request",
        title: "PC A envia o quadro Ethernet com ICMP Echo Request para o MAC de C",
        summary:
          "O pacote IP mantém A → C, mas o quadro Ethernet agora usa unicast entre os MACs corretos.",
        inspector: () => [
          ethernetSection(a.mac, c.mac, "Unicast com MAC resolvido via ARP"),
          ipSection(a.ip, c.ip, "Destino continua sendo o PC C"),
          icmpSection("Echo Request", "O ping finalmente entra na rede"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.a,
            to: nodeEls.switch,
            label: "ICMP Req",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "Encaminhamento unicast",
        title: "Switch consulta a tabela MAC e entrega o Echo Request ao PC C",
        summary:
          "Como o MAC de C já está cadastrado na Fa0/3, o quadro segue direto sem flood.",
        inspector: () => [
          ethernetSection(a.mac, c.mac, "Saída exclusiva pela Fa0/3"),
          decisionSection([
            { label: "Destino consultado", value: `${c.mac} → ${c.port}` },
            { label: "Ação do switch", value: "Unicast para C" },
            { label: "Benefício", value: "Nenhum outro host recebe o ping" },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.c,
            label: "ICMP Req",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "ICMP Echo Reply",
        title: "PC C responde com ICMP Echo Reply usando o MAC já aprendido de A",
        summary:
          "Como C aprendeu A durante o ARP Request, o retorno do ping já pode sair em unicast direto.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Retorno unicast"),
          ipSection(c.ip, a.ip, "Resposta do ping"),
          icmpSection("Echo Reply", "Host de destino confirmou o recebimento"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.c,
            to: nodeEls.switch,
            label: "ICMP Rep",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "Comando concluído",
        title: "Switch entrega o Echo Reply ao PC A e o primeiro ping termina com sucesso",
        summary:
          "O fluxo termina com tabela MAC aprendida nos dois sentidos e ARP caches úteis para os próximos pacotes.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Saída pela Fa0/1"),
          ipSection(c.ip, a.ip, "Último pacote do comando"),
          decisionSection([
            { label: "Tabela MAC do switch", value: "Entradas de A e C preservadas" },
            { label: "ARP cache de A", value: `${c.ip} → ${c.mac}` },
            { label: "Resultado", value: "Ping concluído" },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.a,
            label: "ICMP Rep",
            tone: "icmp",
          });
        },
      },
    ];
  }

  function buildWarmSteps() {
    const a = state.devices.a;
    const c = state.devices.c;

    return [
      {
        tone: "logic",
        protocolLabel: "Checagem de cache",
        title: "PC A consulta o cache ARP e encontra imediatamente o MAC do PC C",
        summary:
          "Como a entrada 192.168.10.30 → 00:1A:2B:3C:4D:1E já existe, o segundo ping não dispara novo ARP Request.",
        inspector: () => [
          decisionSection([
            { label: "Entrada encontrada", value: `${c.ip} → ${c.mac}` },
            { label: "Switch MAC table", value: `${c.mac} → ${c.port}` },
            { label: "Consequência", value: "Fluxo direto em unicast" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a], "logic");
          await Sim.wait(420);
        },
      },
      {
        tone: "icmp",
        protocolLabel: "ICMP Echo Request",
        title: "PC A já envia o Echo Request sem pausa para descoberta",
        summary:
          "O quadro Ethernet é montado imediatamente com o MAC de C porque a resolução ARP foi reaproveitada do primeiro teste.",
        inspector: () => [
          ethernetSection(a.mac, c.mac, "Unicast com cache já populado"),
          ipSection(a.ip, c.ip, "Segundo ping"),
          icmpSection("Echo Request", "Sem broadcast ARP desta vez"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.a,
            to: nodeEls.switch,
            label: "ICMP Req",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "Encaminhamento unicast",
        title: "Switch usa a tabela MAC já pronta e encaminha direto para C",
        summary:
          "Nada é inundado na rede. O switch consulta o destino e manda o quadro apenas para a porta correta.",
        inspector: () => [
          decisionSection([
            { label: "Destino MAC", value: `${c.mac}` },
            { label: "Porta de saída", value: c.port },
            { label: "Tipo de encaminhamento", value: "Unicast" },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.c,
            label: "ICMP Req",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "ICMP Echo Reply",
        title: "PC C retorna o Echo Reply usando o MAC de A já conhecido",
        summary:
          "O retorno também não depende de novo broadcast, porque C armazenou o remetente durante o ARP Request original.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Retorno direto"),
          ipSection(c.ip, a.ip, "Resposta do segundo ping"),
          icmpSection("Echo Reply", "Cache ARP ajudando nos dois sentidos"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.c,
            to: nodeEls.switch,
            label: "ICMP Rep",
            tone: "icmp",
          });
        },
      },
      {
        tone: "icmp",
        protocolLabel: "Comando concluído",
        title: "Switch entrega a resposta ao PC A sem repetir a descoberta ARP",
        summary:
          "Esse segundo fluxo evidencia o efeito prático do cache ARP: menos etapas, menos broadcasts e resposta mais rápida.",
        inspector: () => [
          ethernetSection(c.mac, a.mac, "Último unicast do teste"),
          decisionSection([
            { label: "ARP Request nesta rodada", value: "Não ocorreu" },
            { label: "Tabelas utilizadas", value: "ARP cache e MAC table persistentes" },
            { label: "Resultado", value: "Ping concluído com caminho curto" },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.a,
            label: "ICMP Rep",
            tone: "icmp",
          });
        },
      },
    ];
  }

  async function executeNextStep() {
    if (state.busy || state.currentStepIndex >= state.steps.length) {
      return;
    }

    state.busy = true;
    state.queuedStep = false;
    const step = state.steps[state.currentStepIndex];

    try {
      if (step.before) {
        step.before();
      }

      state.currentSnapshot = makeSnapshot(step);
      renderStatus();

      if (step.animate) {
        await step.animate();
      }

      state.history.push(state.currentSnapshot);
      state.currentStepIndex += 1;

      if (state.currentStepIndex >= state.steps.length && state.scenario === "cold") {
        state.coldComplete = true;
      }
    } catch (error) {
      console.error(error);
      state.auto = false;
      state.queuedStep = false;
      state.currentSnapshot = {
        tone: "logic",
        protocolLabel: "Erro no passo",
        title: "A simulação encontrou um erro ao executar este passo",
        summary: error instanceof Error ? error.message : "Erro inesperado na execução.",
        inspector: [],
      };
    } finally {
      state.busy = false;
      renderStatus();
    }

    if ((state.auto || state.queuedStep) && state.currentStepIndex < state.steps.length) {
      const shouldContinueAuto = state.auto;
      state.queuedStep = false;
      await Sim.wait(120);
      if (shouldContinueAuto) {
        state.auto = true;
      }
      await executeNextStep();
      return;
    }

    state.auto = false;
    state.queuedStep = false;
    renderStatus();
  }

  function startScenario(kind) {
    state.auto = false;
    if (kind === "cold") {
      state = createState();
      state.scenario = "cold";
      state.steps = buildColdSteps();
      state.currentStepIndex = 0;
      state.currentSnapshot = {
        tone: "logic",
        protocolLabel: "Preparação",
        title: "Cenário pronto",
        summary: "Clique em Próximo passo para acompanhar todo o ARP e o ping inicial.",
        inspector: [],
      };
    } else {
      state.scenario = "warm";
      state.steps = buildWarmSteps();
      state.currentStepIndex = 0;
      state.history = [];
      state.currentSnapshot = {
        tone: "logic",
        protocolLabel: "Reuso de estado",
        title: "Cache preservado",
        summary: "As tabelas continuam preenchidas para demonstrar o segundo ping sem ARP.",
        inspector: [],
      };
    }
    renderStatus();
  }

  elements.startCold.addEventListener("click", () => {
    startScenario("cold");
  });

  elements.startWarm.addEventListener("click", () => {
    startScenario("warm");
  });

  elements.nextStep.addEventListener("click", async () => {
    if (state.busy) {
      state.queuedStep = true;
      renderStatus();
      return;
    }
    await executeNextStep();
  });

  elements.autoRun.addEventListener("click", async () => {
    if (state.busy) {
      return;
    }
    state.auto = true;
    renderStatus();
    await executeNextStep();
  });

  elements.reset.addEventListener("click", () => {
    state = createState();
    renderStatus();
  });

  state = createState();
  renderStatus();

  if (window.location.hash === "#autoplay-cold") {
    startScenario("cold");
    state.auto = true;
    executeNextStep();
  }
});
