document.addEventListener("DOMContentLoaded", () => {
  const Sim = window.NetworkSim;

  const ROUTER = {
    lanIp: "10.0.50.1",
    lanMask: "255.255.255.0",
    lanMac: "00:50:AA:00:00:01",
    wanIp: "203.0.113.10",
    serverIp: "198.51.100.20",
    serverPort: "443",
  };

  const DHCP_POOL = ["10.0.50.100", "10.0.50.101", "10.0.50.102"];

  const BASE_CLIENTS = {
    a: {
      key: "a",
      name: "PC A",
      domId: "pc-a",
      mac: "00:50:AA:00:00:11",
      port: "Fa0/1",
      ip: "0.0.0.0",
      mask: null,
      gateway: null,
      arp: {},
    },
    b: {
      key: "b",
      name: "PC B",
      domId: "pc-b",
      mac: "00:50:AA:00:00:12",
      port: "Fa0/2",
      ip: "0.0.0.0",
      mask: null,
      gateway: null,
      arp: {},
    },
    c: {
      key: "c",
      name: "PC C",
      domId: "pc-c",
      mac: "00:50:AA:00:00:13",
      port: "Fa0/3",
      ip: "0.0.0.0",
      mask: null,
      gateway: null,
      arp: {},
    },
  };

  const elements = {
    dhcpStart: document.getElementById("dhcp-start"),
    webStart: document.getElementById("web-start"),
    nextStep: document.getElementById("dhcp-next-step"),
    autoRun: document.getElementById("dhcp-auto-run"),
    reset: document.getElementById("reset-dhcp"),
    statusText: document.getElementById("dhcp-status-text"),
    statusPill: document.getElementById("dhcp-status-pill"),
    stepLabel: document.getElementById("dhcp-step-label"),
    protocol: document.getElementById("dhcp-current-protocol"),
    inspector: document.getElementById("dhcp-inspector"),
    timeline: document.getElementById("dhcp-timeline"),
    progress: document.getElementById("dhcp-progress"),
    dhcpTable: document.getElementById("table-dhcp-leases"),
    natTable: document.getElementById("table-nat"),
    clientArpTable: document.getElementById("table-client-arp"),
    selector: document.getElementById("client-selector"),
    stage: document.getElementById("dhcp-stage"),
    badge: document.getElementById("packet-badge-dhcp"),
    metaA: document.getElementById("meta-lan-a"),
    metaB: document.getElementById("meta-lan-b"),
    metaC: document.getElementById("meta-lan-c"),
  };

  const nodeEls = {
    a: document.getElementById("node-lan-a"),
    b: document.getElementById("node-lan-b"),
    c: document.getElementById("node-lan-c"),
    switch: document.getElementById("node-lan-switch"),
    router: document.getElementById("node-router"),
    cloud: document.getElementById("node-cloud"),
    server: document.getElementById("node-server"),
  };

  const metaEls = {
    a: elements.metaA,
    b: elements.metaB,
    c: elements.metaC,
  };

  const dhcpColumns = [
    { key: "client", label: "Cliente" },
    { key: "mac", label: "MAC" },
    { key: "ip", label: "IP concedido" },
    { key: "gateway", label: "Gateway" },
  ];

  const natColumns = [
    { key: "protocol", label: "Protocolo" },
    { key: "insideLocal", label: "Inside local" },
    { key: "insideGlobal", label: "Inside global" },
    { key: "destination", label: "Destino externo" },
  ];

  const arpColumns = [
    { key: "ip", label: "IP" },
    { key: "mac", label: "MAC" },
    { key: "source", label: "Aprendido em" },
  ];

  let state;

  function createState() {
    return {
      clients: Sim.clone(BASE_CLIENTS),
      selectedClient: "a",
      leases: {},
      natTable: [],
      history: [],
      steps: [],
      currentStepIndex: 0,
      busy: false,
      auto: false,
      scenario: null,
      currentSnapshot: null,
      natCounter: 0,
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

  function section(title, items) {
    return { title, items };
  }

  function ethernetSection(sourceMac, destinationMac, note) {
    return section("Quadro Ethernet", [
      { label: "MAC de origem", value: sourceMac },
      { label: "MAC de destino", value: destinationMac },
      { label: "Transporte", value: note },
    ]);
  }

  function ipSection(sourceIp, destinationIp, note) {
    return section("Cabeçalho IP", [
      { label: "IP de origem", value: sourceIp },
      { label: "IP de destino", value: destinationIp },
      { label: "Observação", value: note },
    ]);
  }

  function dhcpSection(type, sourcePort, destinationPort, note) {
    return section("DHCP / UDP", [
      { label: "Mensagem", value: type },
      { label: "Portas", value: `${sourcePort} → ${destinationPort}` },
      { label: "Leitura", value: note },
    ]);
  }

  function tcpSection(sourcePort, destinationPort, note) {
    return section("TCP / HTTP(S)", [
      { label: "Porta de origem", value: String(sourcePort) },
      { label: "Porta de destino", value: String(destinationPort) },
      { label: "Aplicação", value: note },
    ]);
  }

  function arpSection(type, senderMac, senderIp, targetMac, targetIp) {
    return section("ARP", [
      { label: "Operation code", value: type },
      { label: "Sender MAC/IP", value: `${senderMac} / ${senderIp}` },
      { label: "Target MAC/IP", value: `${targetMac} / ${targetIp}` },
    ]);
  }

  function selectedClient() {
    return state.clients[state.selectedClient];
  }

  function nextAvailableIp() {
    const leased = new Set(Object.values(state.leases).map((entry) => entry.ip));
    return DHCP_POOL.find((ip) => !leased.has(ip)) || null;
  }

  function renderSelector() {
    Array.from(elements.selector.querySelectorAll("button")).forEach((button) => {
      const key = button.dataset.client.replace("pc-", "");
      const isSelected = key === state.selectedClient;
      button.classList.toggle("is-selected", isSelected);
      button.disabled = state.busy || state.currentStepIndex < state.steps.length;
    });
  }

  function renderClientNodes() {
    Object.entries(state.clients).forEach(([key, client]) => {
      const selected = key === state.selectedClient ? "Selecionado" : "Na LAN";
      const configured = client.ip !== "0.0.0.0";
      metaEls[key].innerHTML = `
        <div>Status: ${selected}</div>
        <div>IP: ${configured ? `${client.ip}/24` : "0.0.0.0"}</div>
        <div>MAC: ${client.mac}</div>
        <div>Gateway: ${client.gateway || "-"}</div>
      `;
      nodeEls[key].style.borderColor = key === state.selectedClient ? "rgba(132, 245, 227, 0.26)" : "";
    });
  }

  function renderTables() {
    const dhcpRows = Object.values(state.leases).map((entry) => ({
      client: entry.client,
      mac: entry.mac,
      ip: entry.ip,
      gateway: entry.gateway,
    }));

    const natRows = state.natTable.map((entry) => ({
      protocol: entry.protocol,
      insideLocal: entry.insideLocal,
      insideGlobal: entry.insideGlobal,
      destination: entry.destination,
    }));

    const arpRows = Object.entries(selectedClient().arp).map(([ip, entry]) => ({
      ip,
      mac: entry.mac,
      source: entry.source,
    }));

    Sim.renderTable(elements.dhcpTable, dhcpColumns, dhcpRows, "Nenhuma concessão emitida ainda.");
    Sim.renderTable(elements.natTable, natColumns, natRows, "Nenhum mapeamento NAT/PAT ativo.");
    Sim.renderTable(
      elements.clientArpTable,
      arpColumns,
      arpRows,
      "O cliente selecionado ainda não descobriu o MAC do gateway.",
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
    Sim.setProgress(elements.progress, state.currentStepIndex, state.steps.length || 1);
  }

  function renderStatus() {
    renderSelector();
    renderClientNodes();
    renderTables();
    renderSnapshot();

    const activeClient = selectedClient();
    const hasPending = state.currentStepIndex < state.steps.length;
    const hasIp = activeClient.ip !== "0.0.0.0";

    elements.stepLabel.textContent = state.steps.length
      ? `${state.currentStepIndex} de ${state.steps.length} passos`
      : "0 passos executados";

    if (!state.scenario) {
      updateStatusPill("Topologia zerada", "");
      elements.statusText.textContent =
        "Selecione um PC, obtenha um IP pelo DHCP e depois execute o acesso externo.";
    } else if (hasPending) {
      updateStatusPill("Simulação em andamento", "warning");
      elements.statusText.textContent =
        state.currentSnapshot?.summary || "Aguardando o próximo passo do protocolo.";
    } else if (state.scenario === "dhcp") {
      updateStatusPill("DHCP concluído", "success");
      elements.statusText.textContent =
        `${activeClient.name} recebeu ${activeClient.ip} com gateway ${activeClient.gateway}. Agora ele já pode sair da LAN.`;
    } else {
      updateStatusPill("Acesso externo concluído", "success");
      elements.statusText.textContent =
        `${activeClient.name} atravessou o roteador com NAT/PAT e recebeu a resposta do servidor externo com sucesso.`;
    }

    elements.dhcpStart.disabled = state.busy || hasPending || hasIp || !nextAvailableIp();
    elements.webStart.disabled = state.busy || hasPending || !hasIp;
    elements.nextStep.disabled = state.busy || !hasPending;
    elements.autoRun.disabled = state.busy || !hasPending;
    elements.reset.disabled = state.busy;
  }

  function buildDhcpSteps(clientKey) {
    const client = state.clients[clientKey];
    const offerIp = nextAvailableIp();

    if (!offerIp) {
      return [];
    }

    return [
      {
        tone: "logic",
        protocolLabel: "Preparação DHCP",
        title: `${client.name} inicia sem IP e precisa descobrir um servidor DHCP`,
        summary:
          "A placa ainda não possui identidade lógica. Por isso o Discover nasce com IP de origem 0.0.0.0 e destino 255.255.255.255.",
        inspector: () => [
          section("Estado inicial", [
            { label: "IP atual", value: client.ip },
            { label: "Gateway", value: client.gateway || "indefinido" },
            { label: "Objetivo", value: "Encontrar um servidor DHCP na LAN" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls[clientKey]], "logic");
          await Sim.wait(860);
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP Discover",
        title: `${client.name} envia o DHCP Discover em broadcast`,
        summary:
          "Como ainda não conhece o servidor, o host envia broadcast na camada 2 e na camada 3 para anunciar que precisa de configuração.",
        inspector: () => [
          ethernetSection(client.mac, Sim.BROADCAST_MAC, "Broadcast na LAN"),
          ipSection("0.0.0.0", "255.255.255.255", "Cliente ainda sem identidade"),
          dhcpSection("Discover", 68, 67, "Procura por servidor DHCP"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls[clientKey],
            to: nodeEls.switch,
            label: "DHCP D",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "Flood do switch",
        title: "O switch replica o Discover pelas portas ativas e o roteador o recebe",
        summary:
          "Os demais PCs escutam o broadcast, mas quem interessa aqui é o roteador, porque ele acumula o papel de servidor DHCP local.",
        inspector: () => [
          ethernetSection(client.mac, Sim.BROADCAST_MAC, "Switch replica o frame pela LAN"),
          dhcpSection("Discover", 68, 67, "Broadcast recebido pelo roteador"),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a, nodeEls.b, nodeEls.c], "dhcp");
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.router,
            label: "DHCP D",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP Offer",
        title: `Roteador reserva ${offerIp} para ${client.name} e monta o DHCPOFFER`,
        summary:
          "O gateway escolhe um endereço livre no escopo 10.0.50.0/24 e oferece a configuração ao cliente.",
        inspector: () => [
          section("Oferta do roteador", [
            { label: "IP oferecido", value: offerIp },
            { label: "Gateway", value: ROUTER.lanIp },
            { label: "Máscara", value: ROUTER.lanMask },
          ]),
          dhcpSection("Offer", 67, 68, "Servidor se dispõe a entregar um lease"),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.router], "dhcp");
          await Sim.wait(860);
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP Offer",
        title: "O DHCPOFFER sai do roteador e volta pela LAN",
        summary:
          "Mesmo conhecendo o MAC do cliente, a oferta segue visualmente como broadcast na LAN para reforçar o momento em que o host ainda está sem IP configurado.",
        inspector: () => [
          ethernetSection(ROUTER.lanMac, Sim.BROADCAST_MAC, "Oferta saindo do gateway"),
          ipSection(ROUTER.lanIp, "255.255.255.255", "Servidor DHCP falando com a LAN"),
          dhcpSection("Offer", 67, 68, `Oferta de ${offerIp}`),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.router,
            to: nodeEls.switch,
            label: "DHCP O",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "Entrega da oferta",
        title: "O switch difunde a oferta e o cliente selecionado a reconhece",
        summary:
          "Os outros hosts enxergam o broadcast, mas somente o cliente que iniciou a conversa continua a negociação.",
        inspector: () => [
          ethernetSection(ROUTER.lanMac, Sim.BROADCAST_MAC, "Broadcast de retorno"),
          dhcpSection("Offer", 67, 68, `${client.name} recebeu a oferta ${offerIp}`),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.a, nodeEls.b, nodeEls.c], "dhcp");
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls[clientKey],
            label: "DHCP O",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP Request",
        title: `${client.name} aceita a oferta e envia o DHCPREQUEST em broadcast`,
        summary:
          "Esse broadcast confirma para toda a rede qual oferta foi escolhida, evitando que outros servidores mantenham concessões em aberto desnecessariamente.",
        inspector: () => [
          ethernetSection(client.mac, Sim.BROADCAST_MAC, "Broadcast de confirmação"),
          ipSection("0.0.0.0", "255.255.255.255", "Ainda sem aplicar o IP recebido"),
          dhcpSection("Request", 68, 67, `Solicitando formalmente ${offerIp}`),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls[clientKey],
            to: nodeEls.switch,
            label: "DHCP R",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP Request",
        title: "O switch replica o DHCPREQUEST e o roteador recebe a aceitação",
        summary:
          "Neste ponto o servidor já sabe que pode consolidar a concessão para o MAC do cliente.",
        inspector: () => [
          dhcpSection("Request", 68, 67, "O roteador confirma que a oferta foi aceita"),
          section("Leitura do servidor", [
            { label: "Cliente", value: client.name },
            { label: "MAC", value: client.mac },
            { label: "Lease solicitado", value: offerIp },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.router,
            label: "DHCP R",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP ACK",
        before: () => {
          state.leases[clientKey] = {
            client: client.name,
            mac: client.mac,
            ip: offerIp,
            gateway: ROUTER.lanIp,
          };
        },
        title: "Roteador grava a concessão e envia o DHCPACK",
        summary:
          "A tabela DHCP do roteador é preenchida antes do ACK sair para a rede, vinculando MAC, IP e gateway do host.",
        inspector: () => [
          section("Tabela DHCP atualizada", [
            { label: "Cliente", value: client.name },
            { label: "MAC", value: client.mac },
            { label: "IP concedido", value: offerIp },
          ]),
          dhcpSection("ACK", 67, 68, "Servidor finaliza o DORA"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.router,
            to: nodeEls.switch,
            label: "DHCP A",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "dhcp",
        protocolLabel: "DHCP ACK",
        title: "O ACK volta pela LAN e chega ao cliente",
        summary:
          "A partir deste quadro o host já pode assumir sua identidade IP e tratar o roteador como gateway padrão.",
        inspector: () => [
          ethernetSection(ROUTER.lanMac, Sim.BROADCAST_MAC, "Confirmação final"),
          ipSection(ROUTER.lanIp, "255.255.255.255", "Servidor encerrando a negociação"),
          dhcpSection("ACK", 67, 68, `${client.name} autorizado a usar ${offerIp}`),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls[clientKey],
            label: "DHCP A",
            tone: "dhcp",
          });
        },
      },
      {
        tone: "logic",
        protocolLabel: "Configuração aplicada",
        before: () => {
          client.ip = offerIp;
          client.mask = ROUTER.lanMask;
          client.gateway = ROUTER.lanIp;
        },
        title: `${client.name} aplica a configuração recebida e deixa de ser 0.0.0.0`,
        summary:
          "O host agora possui IP, máscara e gateway. Só depois disso ele está apto a gerar tráfego para fora da rede local.",
        inspector: () => [
          section("Configuração final", [
            { label: "IP do cliente", value: client.ip },
            { label: "Máscara", value: client.mask },
            { label: "Gateway", value: client.gateway },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls[clientKey]], "logic");
          await Sim.wait(860);
        },
      },
    ];
  }

  function buildWebSteps(clientKey) {
    const client = state.clients[clientKey];
    const gatewayMacKnown = Boolean(client.arp[ROUTER.lanIp]);
    const requestPort = 49152 + state.natCounter * 19 + clientKey.charCodeAt(0);
    const natPort = Sim.makeNatPort(state.natCounter + 1);
    const natEntry = {
      protocol: "TCP",
      insideLocal: `${client.ip}:${requestPort}`,
      insideGlobal: `${ROUTER.wanIp}:${natPort}`,
      destination: `${ROUTER.serverIp}:${ROUTER.serverPort}`,
    };

    const steps = [
      {
        tone: "logic",
        protocolLabel: "Decisão de roteamento",
        title: `${client.name} compara a máscara e conclui que ${ROUTER.serverIp} está fora da LAN`,
        summary:
          "Como o servidor está em outra rede, o destino de camada 3 continua externo, mas o próximo salto de camada 2 passa a ser o gateway 10.0.50.1.",
        inspector: () => [
          section("Verificação de rede", [
            { label: "Cliente", value: `${client.ip}/24` },
            { label: "Servidor", value: ROUTER.serverIp },
            { label: "Próximo salto", value: client.gateway || ROUTER.lanIp },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls[clientKey], nodeEls.router], "logic");
          await Sim.wait(860);
        },
      },
    ];

    if (!gatewayMacKnown) {
      steps.push(
        {
          tone: "arp",
          protocolLabel: "ARP para o gateway",
          title: `${client.name} não conhece o MAC do gateway e envia ARP Request`,
          summary:
            "Antes de sair da LAN, o host precisa descobrir o MAC da interface LAN do roteador para preencher o quadro Ethernet.",
          inspector: () => [
            ethernetSection(client.mac, Sim.BROADCAST_MAC, "Broadcast para localizar o gateway"),
            arpSection("Request", client.mac, client.ip, Sim.UNKNOWN_MAC, ROUTER.lanIp),
          ],
          animate: async () => {
            await Sim.animatePacket({
              stage: elements.stage,
              badge: elements.badge,
              from: nodeEls[clientKey],
              to: nodeEls.switch,
              label: "ARP Req",
              tone: "arp",
            });
          },
        },
        {
          tone: "arp",
          protocolLabel: "Flood do switch",
          title: "O switch difunde o ARP Request até o roteador",
          summary:
            "Os demais PCs recebem o broadcast, mas apenas a interface LAN do roteador reconhece o Target IP como sendo seu.",
          inspector: () => [
            arpSection("Request", client.mac, client.ip, Sim.UNKNOWN_MAC, ROUTER.lanIp),
            section("Comportamento do switch", [
              { label: "Tipo de tráfego", value: "Broadcast" },
              { label: "Destino relevante", value: "Roteador R1" },
              { label: "Efeito colateral", value: "Demais PCs apenas escutam e descartam" },
            ]),
          ],
          animate: async () => {
            Sim.pulseNodes([nodeEls.a, nodeEls.b, nodeEls.c], "arp");
            await Sim.animatePacket({
              stage: elements.stage,
              badge: elements.badge,
              from: nodeEls.switch,
              to: nodeEls.router,
              label: "ARP Req",
              tone: "arp",
            });
          },
        },
        {
          tone: "arp",
          protocolLabel: "ARP Reply",
          title: "Roteador responde em unicast com o MAC da interface LAN",
          summary:
            "Agora a conversa deixa de ser broadcast. O gateway envia o ARP Reply diretamente para o cliente que perguntou.",
          inspector: () => [
            ethernetSection(ROUTER.lanMac, client.mac, "Unicast de resposta"),
            arpSection("Reply", ROUTER.lanMac, ROUTER.lanIp, client.mac, client.ip),
          ],
          animate: async () => {
            await Sim.animatePacket({
              stage: elements.stage,
              badge: elements.badge,
              from: nodeEls.router,
              to: nodeEls.switch,
              label: "ARP Rep",
              tone: "arp",
            });
          },
        },
        {
          tone: "arp",
          protocolLabel: "ARP Reply",
          before: () => {
            client.arp[ROUTER.lanIp] = {
              mac: ROUTER.lanMac,
              source: "ARP Reply do gateway",
            };
          },
          title: "O switch entrega o ARP Reply e o cliente armazena o gateway na tabela ARP",
          summary:
            "A partir daqui a pilha já consegue endereçar os próximos quadros Ethernet ao MAC do roteador.",
          inspector: () => [
            section("Tabela ARP do cliente", [
              { label: "IP", value: ROUTER.lanIp },
              { label: "MAC", value: ROUTER.lanMac },
              { label: "Origem da entrada", value: "Resposta do gateway" },
            ]),
          ],
          animate: async () => {
            await Sim.animatePacket({
              stage: elements.stage,
              badge: elements.badge,
              from: nodeEls.switch,
              to: nodeEls[clientKey],
              label: "ARP Rep",
              tone: "arp",
            });
          },
        },
      );
    } else {
      steps.push({
        tone: "logic",
        protocolLabel: "Cache ARP",
        title: `${client.name} já possui o MAC do gateway em cache`,
        summary:
          "Como a entrada 10.0.50.1 → 00:50:AA:00:00:01 já está armazenada, o acesso web não precisa repetir o ARP.",
        inspector: () => [
          section("Cache reutilizado", [
            { label: "Gateway", value: ROUTER.lanIp },
            { label: "MAC conhecido", value: client.arp[ROUTER.lanIp].mac },
            { label: "Impacto", value: "Saída mais direta para o roteador" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls[clientKey]], "logic");
          await Sim.wait(860);
        },
      });
    }

    steps.push(
      {
        tone: "http",
        protocolLabel: "Requisição web",
        title: `${client.name} envia a requisição HTTPS para o MAC do gateway`,
        summary:
          "O IP de destino é o servidor externo, mas o MAC de destino no quadro Ethernet é o do roteador, porque ele é o próximo salto local.",
        inspector: () => [
          ethernetSection(client.mac, client.arp[ROUTER.lanIp].mac, "Quadro segue para o gateway"),
          ipSection(client.ip, ROUTER.serverIp, "Destino final continua sendo o servidor externo"),
          tcpSection(requestPort, ROUTER.serverPort, "Cliente abre conexão HTTPS"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls[clientKey],
            to: nodeEls.switch,
            label: "HTTPS",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "Encaminhamento LAN",
        title: "O switch entrega a requisição ao roteador",
        summary:
          "Dentro da LAN o quadro já está corretamente endereçado para a interface do gateway, então o switch só faz o encaminhamento local.",
        inspector: () => [
          ethernetSection(client.mac, ROUTER.lanMac, "Encaminhamento LAN → gateway"),
          ipSection(client.ip, ROUTER.serverIp, "Pacote ainda sem NAT"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls.router,
            label: "HTTPS",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "NAT/PAT na saída",
        before: () => {
          state.natCounter += 1;
          state.natTable.push(natEntry);
        },
        title: "Roteador aplica NAT/PAT e substitui o IP privado e a porta de origem",
        summary:
          "Na borda, o roteador troca o IP privado do cliente pelo IP público 203.0.113.10 e escolhe uma nova porta PAT para manter o retorno identificável.",
        inspector: () => [
          section("Antes do NAT", [
            { label: "Origem", value: `${client.ip}:${requestPort}` },
            { label: "Destino", value: `${ROUTER.serverIp}:${ROUTER.serverPort}` },
            { label: "Saída LAN", value: `${client.mac} → ${ROUTER.lanMac}` },
          ]),
          section("Depois do NAT", [
            { label: "Origem", value: `${ROUTER.wanIp}:${natPort}` },
            { label: "Destino", value: `${ROUTER.serverIp}:${ROUTER.serverPort}` },
            { label: "Tabela NAT", value: natEntry.insideGlobal },
          ]),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.router,
            to: nodeEls.cloud,
            label: "NAT/PAT",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "Trânsito WAN",
        title: "A internet encaminha o pacote reescrito até o servidor externo",
        summary:
          "Do ponto de vista da internet, a conexão parece ter saído do IP público do roteador, e não do IP privado do PC.",
        inspector: () => [
          ipSection(ROUTER.wanIp, ROUTER.serverIp, "Pacote já mascarado pelo NAT"),
          tcpSection(natPort, ROUTER.serverPort, "Conexão pública visível na WAN"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.cloud,
            to: nodeEls.server,
            label: "WAN",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "Resposta do servidor",
        title: "O servidor responde para o IP público e a porta pública registrados na conexão",
        summary: () =>
          `A resposta volta para 203.0.113.10:${natPort}, porque esse é o par IP/porta visto do lado de fora da rede.`,
        inspector: () => [
          ipSection(ROUTER.serverIp, ROUTER.wanIp, "Retorno para a borda pública do roteador"),
          tcpSection(ROUTER.serverPort, natPort, "Resposta HTTPS do servidor"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.server,
            to: nodeEls.cloud,
            label: "Resp",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "Retorno WAN",
        title: "A resposta cruza a internet e entra pela interface pública do roteador",
        summary:
          "Nesse momento o pacote ainda aponta para o IP público do roteador; a tradução inversa ainda não aconteceu.",
        inspector: () => [
          ipSection(ROUTER.serverIp, ROUTER.wanIp, "Chegada na WAN do roteador"),
          tcpSection(ROUTER.serverPort, natPort, "Porta pública da sessão"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.cloud,
            to: nodeEls.router,
            label: "Resp",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "NAT inverso",
        title: "Roteador consulta a tabela NAT e reescreve o destino de volta para o cliente privado",
        summary:
          "Usando a porta pública como chave, o roteador encontra a conexão certa e restaura IP e porta internos para entregar o retorno ao host correto.",
        inspector: () => [
          section("Entrada consultada", [
            { label: "Inside global", value: natEntry.insideGlobal },
            { label: "Inside local", value: natEntry.insideLocal },
            { label: "Destino externo", value: natEntry.destination },
          ]),
          section("Pacote após NAT inverso", [
            { label: "Novo destino", value: `${client.ip}:${requestPort}` },
            { label: "Origem preservada", value: `${ROUTER.serverIp}:${ROUTER.serverPort}` },
            { label: "Próximo passo", value: "Entrega na LAN para o cliente" },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls.router], "http");
          await Sim.wait(860);
        },
      },
      {
        tone: "http",
        protocolLabel: "Retorno à LAN",
        title: "Roteador envia a resposta para o switch na LAN",
        summary:
          "Depois da tradução inversa, o pacote volta a apontar para o IP privado do cliente que iniciou a sessão.",
        inspector: () => [
          ethernetSection(ROUTER.lanMac, client.mac, "Entrega do retorno ao host interno"),
          ipSection(ROUTER.serverIp, client.ip, "Destino privado restaurado"),
          tcpSection(ROUTER.serverPort, requestPort, "Resposta já associada ao socket correto"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.router,
            to: nodeEls.switch,
            label: "Return",
            tone: "http",
          });
        },
      },
      {
        tone: "http",
        protocolLabel: "Resposta ao cliente",
        title: "O switch entrega o pacote final ao cliente que abriu a conexão",
        summary:
          "O fluxo se encerra com sucesso: o host recebe a resposta web e a associação NAT permanece registrada no roteador.",
        inspector: () => [
          ethernetSection(ROUTER.lanMac, client.mac, "Último salto local"),
          ipSection(ROUTER.serverIp, client.ip, "Resposta entregue ao PC"),
          tcpSection(ROUTER.serverPort, requestPort, "Sessão finalizada no cliente correto"),
        ],
        animate: async () => {
          await Sim.animatePacket({
            stage: elements.stage,
            badge: elements.badge,
            from: nodeEls.switch,
            to: nodeEls[clientKey],
            label: "Return",
            tone: "http",
          });
        },
      },
      {
        tone: "logic",
        protocolLabel: "Fluxo encerrado",
        title: `${client.name} recebe a resposta e a navegação externa é concluída`,
        summary:
          "O laboratório mostrou os dois lados do NAT: tradução na ida e restauração do destino privado na volta, sempre apoiado pela tabela NAT/PAT.",
        inspector: () => [
          section("Resultado", [
            { label: "Cliente", value: client.name },
            { label: "IP local", value: client.ip },
            { label: "Mapeamento ativo", value: natEntry.insideGlobal },
          ]),
        ],
        animate: async () => {
          Sim.pulseNodes([nodeEls[clientKey], nodeEls.router], "logic");
          await Sim.wait(860);
        },
      },
    );

    return steps;
  }

  async function executeNextStep() {
    if (state.busy || state.currentStepIndex >= state.steps.length) {
      return;
    }

    state.busy = true;
    const step = state.steps[state.currentStepIndex];

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
    state.busy = false;
    renderStatus();

    if (state.auto && state.currentStepIndex < state.steps.length) {
      await Sim.wait(220);
      await executeNextStep();
      return;
    }

    state.auto = false;
    renderStatus();
  }

  function startScenario(kind) {
    state.auto = false;
    state.scenario = kind;
    state.currentStepIndex = 0;
    state.steps =
      kind === "dhcp" ? buildDhcpSteps(state.selectedClient) : buildWebSteps(state.selectedClient);
    state.currentSnapshot = {
      tone: "logic",
      protocolLabel: kind === "dhcp" ? "Pronto para DORA" : "Pronto para saída WAN",
      title: kind === "dhcp" ? "Negociação DHCP preparada" : "Acesso externo preparado",
      summary:
        kind === "dhcp"
          ? "Clique em Próximo passo para acompanhar Discover, Offer, Request e ACK."
          : "Clique em Próximo passo para acompanhar ARP do gateway, NAT na ida e NAT inverso na volta.",
      inspector: [],
    };
    renderStatus();
  }

  elements.selector.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-client]");
    if (!button || state.busy || state.currentStepIndex < state.steps.length) {
      return;
    }
    state.selectedClient = button.dataset.client.replace("pc-", "");
    renderStatus();
  });

  elements.dhcpStart.addEventListener("click", () => {
    startScenario("dhcp");
  });

  elements.webStart.addEventListener("click", () => {
    startScenario("web");
  });

  elements.nextStep.addEventListener("click", async () => {
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

  if (window.location.hash === "#autoplay-dhcp") {
    startScenario("dhcp");
    state.auto = true;
    executeNextStep();
  }

  if (window.location.hash === "#autoplay-web") {
    startScenario("dhcp");
    state.auto = true;
    executeNextStep().then(async () => {
      while (state.busy || state.currentStepIndex < state.steps.length) {
        await Sim.wait(120);
      }
      startScenario("web");
      state.auto = true;
      await executeNextStep();
    });
  }
});
