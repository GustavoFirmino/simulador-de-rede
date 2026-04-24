# Relatório da Entrega

## Identificação

- Disciplina: Redes de Computadores
- Trabalho: Desenvolvimento de Simuladores de Rede Assistido por IA
- IA utilizada: OpenAI Codex (família GPT-5)
- Repositório: `simulador-de-rede`

## Entregáveis produzidos

- `index.html`: página inicial com acesso às duas missões.
- `arp-switching.html`: simulador da camada 2 com switching, ARP e ping passo a passo.
- `dhcp-nat.html`: simulador das camadas 3 e 4 com DHCP, roteamento e NAT/PAT.
- `assets/styles.css`: identidade visual compartilhada.
- `assets/arp.js`: lógica da missão 1.
- `assets/dhcp.js`: lógica da missão 2.
- `assets/shared.js`: utilitários compartilhados.

## Missão 1

### Topologia usada

- Rede privada: `192.168.10.0/24`
- PC A: `192.168.10.10` / MAC `00:1A:2B:3C:4D:0A`
- PC B: `192.168.10.20` / MAC `00:1A:2B:3C:4D:14`
- PC C: `192.168.10.30` / MAC `00:1A:2B:3C:4D:1E`
- Switch: tabela MAC inicial vazia

### Prompt base usado para orientar a implementação

> Crie um simulador web em HTML, CSS e JavaScript puro com 3 PCs conectados a um switch. O cenário deve começar com tabela ARP dos PCs e tabela MAC do switch vazias. Ao iniciar um ping do PC A para o PC C, o host de origem deve primeiro validar a máscara, verificar o cache ARP e manter o ping em espera até descobrir o MAC do destino. O ARP Request precisa sair com destino FF:FF:FF:FF:FF:FF, o switch deve aprender o MAC de origem e fazer flood apenas nas outras portas, o PC correto deve responder em unicast e as tabelas precisam ser atualizadas na tela em tempo real.

### Prompt de refinamento visual e funcional

> Adicione botão “Próximo passo”, histórico de eventos e um inspetor de pacotes estilo Wireshark simplificado. Mostre no quadro Ethernet os MACs de origem e destino, no pacote IP os IPs de origem e destino e, na mensagem ARP, o opcode, sender MAC/IP e target MAC/IP. Use cores diferentes para ARP e ICMP e não pule a pausa inicial do ping enquanto o ARP não termina.

### Prompt de correção conceitual

> Corrija a lógica para que o primeiro ping não envie ICMP antes de terminar a resolução ARP. O PC B deve apenas receber o broadcast e ignorá-lo. O PC C pode aprender o MAC do PC A pelo próprio ARP Request antes de responder. O segundo ping entre os mesmos hosts deve reutilizar cache ARP e tabela MAC, sem disparar novo broadcast.

## Missão 2

### Topologia usada

- LAN: `10.0.50.0/24`
- Gateway/DHCP Server: `10.0.50.1`
- WAN pública do roteador: `203.0.113.10`
- Servidor externo fictício: `198.51.100.20`
- PCs iniciando com `0.0.0.0`

### Prompt base usado para orientar a implementação

> Crie um simulador web em HTML, CSS e JavaScript puro com 3 PCs ligados a um switch e um roteador que atua ao mesmo tempo como servidor DHCP e gateway. Todos os PCs devem iniciar com IP 0.0.0.0. Ao clicar em “Obter IP”, o cliente precisa executar o fluxo DHCP Discover, Offer, Request e ACK em modo passo a passo, com IPs, MACs e portas UDP 67/68 visíveis. A tabela DHCP do roteador deve iniciar vazia e ser preenchida em tempo real.

### Prompt de refinamento visual e funcional

> Depois que o cliente obtiver IP, adicione um fluxo “Acessar uol.com.br”. O simulador deve comparar a máscara, perceber que o destino é externo, resolver o MAC do gateway se necessário e então enviar uma requisição web ao roteador. Mostre o pacote antes do roteador e depois do roteador, evidenciando a troca do IP privado e da porta de origem pelo IP público e por uma nova porta PAT. Exiba a tabela NAT/PAT na tela.

### Prompt de correção conceitual

> Corrija a volta do tráfego para que o servidor externo responda ao IP público e à porta pública criada pelo NAT. O roteador deve consultar a tabela NAT para descobrir qual IP privado e qual porta interna devem receber o retorno. A resposta não pode ir para o host errado nem saltar a etapa de tradução inversa.

## Erro conceitual observado e corrigido

O erro conceitual mais importante que precisou ser evitado foi o atalho em que a IA tende a enviar o `ping` imediatamente, como se o PC já soubesse o MAC do destino. Isso contraria a teoria da camada 2.

### Como o erro foi resolvido

- O `ping` foi modelado como um evento pendente.
- Antes do ICMP, o host de origem verifica o cache ARP.
- Em caso de ausência, a interface exibe o ARP Request em broadcast.
- Só depois do ARP Reply a aplicação libera o envio do quadro Ethernet com ICMP Echo Request.

Na missão 2, a mesma atenção foi aplicada ao NAT: a ida altera IP e porta, e a volta depende obrigatoriamente da tabela NAT para restaurar o destino privado correto.

## O que observar durante a apresentação

### Missão 1

- O primeiro `ping` não começa com ICMP; ele fica aguardando a resolução ARP.
- O ARP Request usa `FF:FF:FF:FF:FF:FF`.
- O switch aprende MACs pela origem do quadro e só faz flood quando necessário.
- O segundo `ping` é mais curto porque o cache ARP já está preenchido.

### Missão 2

- O Discover e o Request usam `0.0.0.0` para origem e `255.255.255.255` para destino.
- A tabela DHCP é preenchida quando o roteador consolida a concessão.
- Antes de sair da LAN, o host precisa conhecer o MAC do gateway.
- Na ida para a internet, o roteador troca IP privado e porta privada por IP público e porta PAT.
- Na volta, a tabela NAT permite restaurar o destino privado correto.

## Instruções rápidas de uso

1. Abrir `index.html`.
2. Entrar na missão desejada.
3. Usar `Iniciar`, `Próximo passo` ou `Executar tudo`.
4. Observar simultaneamente topologia, inspetor e tabelas.

## Observação final

O projeto foi construído para rodar direto no navegador, sem frameworks nem dependências externas, priorizando clareza didática, fidelidade conceitual e uma apresentação visual moderna.
