# Simulador de Rede

Entrega prática da disciplina de Redes de Computadores com dois simuladores web:

- `arp-switching.html`: missão 1, cobrindo switching, ARP e o fluxo completo do primeiro `ping`.
- `dhcp-nat.html`: missão 2, cobrindo DHCP DORA, roteamento, ARP do gateway e NAT/PAT.
- `index.html`: landing page para navegação entre as missões.
- `docs/relatorio-entrega.md`: versão em Markdown do relatório da entrega.
- `docs/relatorio-entrega.html`: versão navegável do relatório.
- `docs/relatorio-entrega.pdf`: PDF pronto para envio.

## Como abrir

1. Abra `index.html` no navegador.
2. Entre na missão desejada.
3. Use `Iniciar`, `Próximo passo` ou `Executar tudo` para percorrer a simulação.

Se preferir usar um servidor local:

```bash
python3 -m http.server 4173
```

Depois abra `http://localhost:4173`.

## Endereçamento usado

### Missão 1

- Rede: `192.168.10.0/24`
- PC A: `192.168.10.10`
- PC B: `192.168.10.20`
- PC C: `192.168.10.30`

### Missão 2

- Rede LAN: `10.0.50.0/24`
- Gateway / DHCP Server: `10.0.50.1`
- WAN do roteador: `203.0.113.10`
- Servidor externo: `198.51.100.20`

## Características da interface

- Inspetor visual de cabeçalhos Ethernet, ARP, IP, UDP, TCP e NAT.
- Tabelas dinâmicas visíveis na tela.
- Modo passo a passo para não pular lógica.
- Layout responsivo sem dependências externas.
