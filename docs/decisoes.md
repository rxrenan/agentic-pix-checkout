# Decisões

## 1. Servidor MCP pequeno, sem SDK

O processo em `src/mcp/server.ts` fala o subconjunto que o Claude Desktop precisa: `initialize`, `tools/list`, `tools/call`, linha a linha em JSON no stdout. Log vai para o stderr. A troca é menos cobertura do protocolo completo por um arquivo que dá para ler inteiro. [A CONFIRMAR] se alguma versão do Claude Desktop exigir um método fora desse conjunto.

## 2. Aprovar não é ferramenta do agente

`start_checkout` cria o intent e para em `awaiting_user_approval`. A confirmação é `POST /consents/:id/decision` no ITP simulado, ou `npm run aprovar` apontando para essa API. Um campo `approved: true` na ferramenta seria preenchido pelo próprio modelo.

## 3. Centavos inteiros e chave de idempotência

Preço mora no catálogo, em centavos. A ferramenta de carrinho recusa payload com preço. `start_checkout` exige `idempotency_key`: a segunda chamada com a mesma chave devolve o mesmo intent, inclusive se o carrinho mudou no meio. A primeira cesta é a que vale.

## 4. Um cliente fixo

Não há login. As ferramentas assumem `cust_demo_001` quando o argumento vem vazio. A decisão do ITP simulado ainda exige esse id no corpo, para a chamada bater com o consentimento. Isso é amarra de demo, não autenticação.
