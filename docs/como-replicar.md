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

## Dados reais

Não há modo real neste repositório. `DEMO_MODE=false` encerra o processo de propósito.

Para uma iniciação de verdade, o buraco é de instituição, não de prompt. Fica de fora, e cada item abaixo é [A CONFIRMAR]:

- Qual instituição participaria como ITP e em qual ambiente (sandbox ou produção).
- Qual versão da API de iniciação de pagamento do Open Finance.
- Como seria o mTLS, o cadastro no diretório e a guarda do certificado.
- Como a biometria real voltaria (app da detentora, jornada sem redirecionamento, outro canal).
- Qual identificador da loja recebedora entraria no lugar da chave Pix fictícia.

Até isso existir, o código não tem ramo escondido esperando segredo.
