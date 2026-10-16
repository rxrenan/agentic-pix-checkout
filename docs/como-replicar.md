# Como replicar

## Demo

Não precisa de `.env`.

```bash
npm install
npm test
npm run demo
```

Num clone novo, `./scripts/demo.sh` instala a dependência de desenvolvimento (`tsx`) se faltar e roda o demo.

O demo sobe o servidor MCP, faz a conversa "compra o café de sempre", mostra a liquidação recusada antes da aprovação, confirma no ITP simulado e grava `examples/output/transcript.txt`, `examples/output/audit.jsonl` e `examples/output/payment.json`. Essa pasta está no `.gitignore`.

Copiar `.env.example` para `.env` só fixa `DEMO_MODE=true`. Não há chave para preencher.

## Referência pública

O fluxo que este demo imita está descrito pelo Iniciador, não por um recorte de imprensa:

- Página do produto: https://iniciador.com.br/produtos/pagamentos-agenticos
- Anúncio de 19/05/2026: https://iniciador.com.br/conteudos/iniciador-anuncia-pagamentos-agenticos-full-stack-ai-toolkit

Lá o agente propõe o Pix, a pessoa aprova com biometria a cada transação, e o banco pagador recebe um payload JSR-assinado. WhatsApp entra como canal nessa página. A Tyxter não entra. A integração com a Tyxter está em https://tyxter.com/agentic-payments e na Let's Money de 17/07/2026: https://www.letsmoney.com.br/noticias/iniciador-tyxter-pix-agentico-whatsapp/ .

A IN BCB nº 746/2026 está em vigor desde 01/10/2026 e encerrou o limite padrão de R$ 500 para Pix por aproximação e para a Jornada sem Redirecionamento. Texto oficial: https://www.in.gov.br/web/dou/-/instrucao-normativa-bcb-n-746-de-16-de-junho-de-2026-713285339

## Dados reais

Não há modo real neste repositório. `DEMO_MODE=false` encerra o processo de propósito.

Para uma iniciação de verdade, o buraco é de instituição, não de prompt. Fica de fora, e cada item abaixo é [A CONFIRMAR]:

- Qual instituição participaria como ITP e em qual ambiente (sandbox ou produção).
- Qual versão da API de iniciação de pagamento do Open Finance.
- Como seria o mTLS, o cadastro no diretório e a guarda do certificado.
- Como a biometria real voltaria neste protótipo. A referência pública do Iniciador é FIDO2 no dispositivo, com payload JSR-assinado até o banco pagador. Qual instituição e qual canal entrariam aqui segue em aberto.
- Qual identificador da loja recebedora entraria no lugar da chave Pix fictícia.

Até isso existir, o código não tem ramo escondido esperando segredo.
