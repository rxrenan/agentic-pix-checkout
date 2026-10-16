[Português](README.md) | [English](README.en.md)

# Checkout agêntico com Pix

Uma loja fictícia que um agente compra no chat, com Pix simulado só depois da confirmação do usuário.

Um case de produto de IA: a página de pagamento sai do caminho, a conversa monta o pedido, e o dinheiro simulado só anda com o usuário no circuito.

Autor: Renan R. Rosa, Staff Product Manager | Payment Infrastructure | Pix · Open Finance · BaaS · AI, https://www.linkedin.com/in/renanrrosa

Status: protótipo · dados 100% fictícios

![Capa do case: chat com o pedido do café de sempre, catálogo do Café Aurora e aprovação biométrica simulada antes do Pix](docs/assets/preview-1600x900.png)

## 1. Problema

Quem pede "compra o café de sempre" num chat já disse o pedido. O checkout brasileiro, na prática corrente, ainda empurra a pessoa para uma página: escolher o método, conferir o valor, confirmar. Um agente de IA entende a frase. Ele não tem, numa loja comum, um contrato estável para ler o cardápio e parar antes do débito.

- A vitrine em HTML muda de layout e o agente perde o preço, o estoque e a regra de devolução. Não medi quantas lojas publicam um feed legível.
- O Pix já é meio de checkout em escala, e a conversa ainda não fecha a compra sozinha. O número de mercado está em "Por que agora", com a fonte. Abandono de carrinho não entra aqui: eu não medi.
- Se a ferramenta do agente liquidar na mesma chamada, a pessoa perde o instante de conferir valor e destinatário.

Pergunta de produto: uma loja brasileira pequena consegue ser comprada por um agente, via Pix, com a autorização do titular fora do alcance do modelo?

Por que agora:

- A página de Pagamentos Agênticos do Iniciador descreve um servidor MCP em que o agente inicia Pix em nome do usuário, com aprovação biométrica a cada transação. O fluxo publicado tem três passos. O agente envia QR Code, copia-e-cola ou chave, com valor. A pessoa confere valor e recebedor numa interface gerada pelo Iniciador (não pelo agente) e autoriza com Face ID, Touch ID ou equivalente. A cerimônia é FIDO2, no dispositivo. Um payload assinado no padrão JSR segue para o banco pagador, que valida e liquida no Pix. A mesma página lista WhatsApp como canal que recebe essa tela e como caso de cobrança. A pessoa autoriza o dispositivo uma vez e aprova cada Pix. Para Pix agendado, a página fala em liquidação na data combinada, em até 90 dias, sem nova autorização. O anúncio do próprio Iniciador, de 19 de maio de 2026, chama esse MCP de primeiro do Brasil e repete a regra de que o agente não move o dinheiro sozinho. https://iniciador.com.br/produtos/pagamentos-agenticos e https://iniciador.com.br/conteudos/iniciador-anuncia-pagamentos-agenticos-full-stack-ai-toolkit
- O nome Tyxter não aparece no site do Iniciador. A Let's Money (17/07/2026) e a página da Tyxter descrevem uma integração que leva esses pagamentos agênticos para a API da Tyxter, no WhatsApp, com a pessoa conferindo valor e destinatário e autorizando com biometria. https://www.letsmoney.com.br/noticias/iniciador-tyxter-pix-agentico-whatsapp/ e https://tyxter.com/agentic-payments
- O anúncio do Iniciador de 19/05/2026 atribui à EBANX (Beyond Borders 2026) a frase "44% do checkout no país, contra 41% dos cartões". O relatório da EBANX não está linkado nessa página.
- A Instrução Normativa BCB nº 746, de 16 de junho de 2026, está em vigor desde 1º de outubro de 2026. O texto no Diário Oficial da União de 19/06/2026 altera a IN BCB nº 512/2024 nos limites da iniciação por aproximação e da iniciação de pagamento sem redirecionamento, e revoga o inciso VI do § 2º do art. 10 e os arts. 16-A e 16-C. Não há mais limite padrão de R$ 500 para o Pix por aproximação nem para a Jornada sem Redirecionamento. A Agência Brasil (01/10/2026) descreve o efeito: o teto específico de R$ 500 por transação saiu, e o cliente pede ao banco o aumento ou a redução dentro das regras da conta. https://www.in.gov.br/web/dou/-/instrucao-normativa-bcb-n-746-de-16-de-junho-de-2026-713285339 e https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=746&tipo=Instru%C3%A7%C3%A3o%20Normativa%20BCB e https://agenciabrasil.ebc.com.br/economia/noticia/2026-09/pix-por-aproximacao-deixa-de-ter-teto-de-r-500-partir-desta-quinta

A referência pública deste case é essa página do Iniciador. O payload JSR-assinado é o ponto de contato com a Jornada sem Redirecionamento. Este repositório não chama a API deles e não descreve empregador, sistema interno nem jornada real de produção.

![Antes: checkout com página, escolha de método e confirmação manual. Depois: conversa, carrinho montado pelo agente e Pix simulado com aprovação biométrica](docs/assets/antes-depois-1600x900.png)

## 2. Solução

O Café Aurora, loja fictícia, publica catálogo em JSON e um checkout por MCP. A pessoa diz "compra o café de sempre". O agente lê o pedido habitual, monta o carrinho e abre a iniciação. O Pix simulado só chega a `settled` depois da aprovação explícita.

1. Gatilho: a frase no chat.
2. O agente lê `examples/catalog.json` e `examples/habitual-order.json` pelas ferramentas do servidor MCP.
3. O agente monta o carrinho (café coado 200ml e pão na chapa, R$ 14,50) e chama `start_checkout`. O intent fica em `awaiting_user_approval`.
4. A pessoa aprova ou recusa no ITP simulado. No lugar da biometria, a demo exige a frase `CONFIRMO O PIX` e o método `simulated_biometric`.
5. Com a aprovação, o mock gera um `endToEndId` fictício e grava o `approval_id` no audit log. Sem aprovação, a liquidação é recusada. Se o prazo estoura, o estado vai para `expired`.

![Jornada em cinco passos: chat, leitura do catálogo, carrinho, aprovação biométrica simulada e Pix simulado liquidado](docs/assets/jornada-1600x900.png)

Versão 1080x1350 da mesma jornada, para post: [docs/assets/jornada-1080x1350.png](docs/assets/jornada-1080x1350.png).

## 3. Arquitetura

```mermaid
flowchart LR
  U[Usuario no chat] --> AG[Agente]
  CAT[(Catalogo JSON)] --> AG
  HAB[(Pedido habitual)] --> AG
  AG --> MCP[Servidor MCP]
  MCP --> ITP[ITP simulado]
  ITP --> H{{Aprovacao do usuario}}
  H -->|aprovado| PIX[Pix simulado settled]
  H -->|recusado ou expirado| STOP[Sem pagamento]
  MCP --> LOG[(Audit log JSONL)]
  ITP --> LOG
```

O agente vê seis ferramentas: `list_catalog`, `get_habitual_order`, `upsert_cart`, `get_cart`, `start_checkout`, `get_payment_status`. Aprovação e liquidação ficam no HTTP local do ITP simulado (`127.0.0.1`, porta 8787 por padrão). O contrato da resposta de checkout está em `template/checkout-response.schema.json`. Os estados estão em `docs/estados.md`.

### Princípios

- Permissão mínima. O agente lê catálogo, substitui o carrinho e cria o intent. Liquidar fica de fora da lista de ferramentas. `DEMO_MODE=false` nem sobe o processo.
- Humano no circuito. `approved` só nasce de `POST /consents/:id/decision` com método `simulated_biometric` e a frase certa. Sem isso, `settle` responde `approval_required` e o status não muda.
- Rastreabilidade. O evento `payment_settled` no JSONL carrega o `approval_id` gravado em `user_biometric_approved`. O teste quebra se os dois não baterem.
- Nunca inventar. SKU fora do catálogo, item indisponível e preço mandado pelo agente voltam erro. No prompt, dado ausente sai como `[A CONFIRMAR]`.
- Privacidade por padrão. Fixture sem CPF, e-mail, telefone ou chave real. O log não guarda a frase, só o resultado da conferência. Detalhe em `docs/privacidade.md`.

## 4. Resultados

| Dimensão | Antes | Depois |
| --- | --- | --- |
| Contrato para o agente comprar | Página para um humano preencher | Seis ferramentas MCP com JSON estável e preço vindo do catálogo |
| Liquidação sem aprovação | Uma ferramenta única poderia debitar na mesma chamada | Recusada. O demo e a suíte cobrem a chamada de `settle` em `awaiting_user_approval` |
| Rastro de quem autorizou | [A CONFIRMAR] no checkout de página, fora deste protótipo | Cada `payment_settled` aponta o `approval_id` do usuário |
| Dado pessoal na saída | Risco de CPF e segredo em exemplo mal feito | A suíte varre a saída do demo e os fixtures |
| Conversão, tempo, GMV | não medido | não medido |

### Como medi

- Base de teste: catálogo fictício do Café Aurora, um pedido habitual (café coado e pão na chapa), e os caminhos aprovar, recusar, expirar, frase errada, método que não é biometria, idempotência e SKU inválido.
- Métrica principal: `settled` só ocorre com `approval_id` presente, e esse id é o mesmo do evento `user_biometric_approved`.
- Comparação: a chamada de liquidação antes da aprovação, que o ITP simulado recusa com HTTP 409 e registra `settle_blocked`.
- Limitações: zero pagamento real, zero usuário externo, biometria reduzida a uma frase, sem dispositivo, sem instituição participante do Open Finance, sem medida de tempo de pessoa nem de conversão.

## 5. Lições aprendidas

1. **Intent e liquidação são passos separados.** No primeiro corte deste protótipo o checkout já devolvia pagamento feito. Tirei a liquidação da ferramenta do agente. `start_checkout` para em `awaiting_user_approval`.
2. **A confirmação fica fora do contexto do modelo.** Um argumento `approved: true` seria o próprio modelo preenchendo a barreira. A frase `CONFIRMO O PIX` só existe na API local do ITP simulado.
3. **Consentimento sem prazo fica pendurado.** O estado `expired` existe para uma aprovação tardia encontrar a porta fechada. O prazo padrão da demo é 3 minutos.
4. **Auditoria sem o id da aprovação não prova a autorização.** O teste exige que `payment_settled.approval_id` seja o id gravado na aprovação do usuário.

## 6. Riscos e limites

- Simulação local. Não há chamada ao SPI, ao diretório de participantes nem a certificado de ITP.
- A "biometria" é uma frase fixa. Não há leitura de digital, face ou aparelho.
- Fraude, limite diário, MED, estorno, agendamento e retentativa de produção ficaram de fora. A idempotência cobre o retry da mesma chave, nada além disso.
- O agente pode montar o item errado. A mitigação deste protótipo é o resumo do carrinho na resposta, antes da aprovação. Não há avaliação de acerto do modelo.
- A página de Pagamentos Agênticos do Iniciador descreve biometria FIDO2 no aparelho, payload JSR-assinado e webhook. Este mock usa uma frase no lugar da biometria e não assina payload.
- Qualquer pessoa com acesso à máquina alcança o `127.0.0.1`. A amarra é a porta local, não um controle de acesso.
- O que este case deixa de fora de propósito: produção, várias lojas, mandato recorrente, WhatsApp e um ITP regulado.

## 7. Próximos passos

- O roteiro do vídeo da jornada no chat fica para uma etapa seguinte. O prompt já está em `prompts/agente-checkout.md`.
- Ligar um sandbox de iniciação, se houver instituição e ambiente. [A CONFIRMAR] qual ITP e qual API. O mapa do que falta está em `docs/como-replicar.md`.
- Definir teto por transação e o que seria um mandato recorrente sem pular a confirmação de cada débito.

## Como rodar

Modo demo (sem credenciais):

```bash
npm install
npm test
npm run demo
```

Num clone novo, um comando só: `./scripts/demo.sh`

O demo imprime a conversa e grava o audit log em `examples/output/audit.jsonl`. Sucesso é o status final `settled` com `approval_id`, depois de uma liquidação recusada.

Para falar com o Claude Desktop: `docs/claude-desktop.md`.

Com dados reais: veja `docs/como-replicar.md`. Copie `.env.example` para `.env` e preencha. Neste repositório o arquivo de exemplo só tem `DEMO_MODE=true`. Não há credencial real para colocar.

## Estrutura do repositório

| Caminho | O que é |
| --- | --- |
| `docs/` | Decisões, estados, privacidade, Claude Desktop e o que seria uma réplica real |
| `docs/assets/` | Figuras do case. `capa-repo-1280x640.png` é a imagem para o social preview do GitHub (o upload é manual, nas configurações do repositório) |
| `prompts/` | Prompt versionado do agente |
| `src/` | Servidor MCP, ITP simulado, demo e CLI de aprovação |
| `template/` | Forma fixa da resposta de checkout |
| `examples/` | Catálogo, pedido habitual e cliente fictícios. A saída do demo cai em `examples/output/`, fora do git |
| `tests/` | Estados, checkout, HTTP, MCP, demo e varredura de dado pessoal |

## Fontes

- Iniciador, página de Pagamentos Agênticos (fluxo do MCP, biometria por transação, JSR, WhatsApp como canal): https://iniciador.com.br/produtos/pagamentos-agenticos
- Iniciador, 19/05/2026, anúncio do MCP de pagamentos agênticos via Pix e a citação da EBANX: https://iniciador.com.br/conteudos/iniciador-anuncia-pagamentos-agenticos-full-stack-ai-toolkit
- Tyxter, página da integração com o Iniciador. O site do Iniciador não cita esse nome: https://tyxter.com/agentic-payments
- Let's Money, 17/07/2026, parceria Iniciador e Tyxter no WhatsApp: https://www.letsmoney.com.br/noticias/iniciador-tyxter-pix-agentico-whatsapp/
- IN BCB nº 746, de 16/06/2026, texto no Diário Oficial da União de 19/06/2026, em vigor em 01/10/2026: https://www.in.gov.br/web/dou/-/instrucao-normativa-bcb-n-746-de-16-de-junho-de-2026-713285339
- Página do normativo no Banco Central: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=746&tipo=Instru%C3%A7%C3%A3o%20Normativa%20BCB
- Agência Brasil, 01/10/2026, fim do teto de R$ 500: https://agenciabrasil.ebc.com.br/economia/noticia/2026-09/pix-por-aproximacao-deixa-de-ter-teto-de-r-500-partir-desta-quinta
- Protocolo MCP, subconjunto stdio usado pelo servidor: https://modelcontextprotocol.io/
- Relatório EBANX Beyond Borders 2026:

## Aviso

Projeto pessoal e educativo, sem vínculo com empregadores ou com os fornecedores citados. Todos os dados do repositório são fictícios. Nada aqui é recomendação financeira, de crédito ou de investimento. Licença MIT.
