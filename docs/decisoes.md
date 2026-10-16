# Decisões

## 1. Servidor MCP pequeno, sem SDK

O processo em `src/mcp/server.ts` fala o subconjunto que o Claude Desktop precisa: `initialize`, `tools/list`, `tools/call`, linha a linha em JSON no stdout. Log vai para o stderr. A troca é menos cobertura do protocolo completo por um arquivo que dá para ler inteiro. [A CONFIRMAR] se alguma versão do Claude Desktop exigir um método fora desse conjunto.

## 2. Aprovar não é ferramenta do agente

`start_checkout` cria o intent e para em `awaiting_user_approval`. A confirmação é `POST /consents/:id/decision` no ITP simulado, ou `npm run aprovar` apontando para essa API. Um campo `approved: true` na ferramenta seria preenchido pelo próprio modelo.

## 3. Centavos inteiros e chave de idempotência

Preço mora no catálogo, em centavos. A ferramenta de carrinho recusa payload com preço. `start_checkout` exige `idempotency_key`: a segunda chamada com a mesma chave devolve o mesmo intent, inclusive se o carrinho mudou no meio. A primeira cesta é a que vale.

## 4. A referência pública é a página do Iniciador

O fluxo deste protótipo segue o que o Iniciador publica em https://iniciador.com.br/produtos/pagamentos-agenticos : o agente propõe, a pessoa confere valor e recebedor fora do texto do agente, e a liquidação só anda depois dessa aprovação. Lá a biometria é FIDO2 no dispositivo, o banco recebe um payload JSR-assinado e o cliente recebe webhook. Aqui a biometria é a frase `CONFIRMO O PIX`, não há assinatura JSR e não há webhook.

O anúncio de 19/05/2026, em que eles chamam o MCP de primeiro do Brasil, está em https://iniciador.com.br/conteudos/iniciador-anuncia-pagamentos-agenticos-full-stack-ai-toolkit . O site do Iniciador descreve WhatsApp como canal. Não cita a Tyxter. Essa parceria fica na página da Tyxter (https://tyxter.com/agentic-payments) e na Let's Money de 17/07/2026 (https://www.letsmoney.com.br/noticias/iniciador-tyxter-pix-agentico-whatsapp/).

A IN BCB nº 746, de 16/06/2026, em vigor desde 01/10/2026, acabou com o limite padrão de R$ 500 na iniciação por aproximação e na iniciação sem redirecionamento. Texto: https://www.in.gov.br/web/dou/-/instrucao-normativa-bcb-n-746-de-16-de-junho-de-2026-713285339 . Efeito descrito pela Agência Brasil: https://agenciabrasil.ebc.com.br/economia/noticia/2026-09/pix-por-aproximacao-deixa-de-ter-teto-de-r-500-partir-desta-quinta .

## 5. Um cliente fixo

Não há login. As ferramentas assumem `cust_demo_001` quando o argumento vem vazio. A decisão do ITP simulado ainda exige esse id no corpo, para a chamada bater com o consentimento. Isso é amarra de demo, não autenticação.
