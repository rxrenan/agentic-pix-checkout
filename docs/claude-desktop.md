# Ligar o MCP no Claude Desktop

O servidor é local, em modo demo, sem credencial. Pelo terminal do repositório:

```bash
npm install
npm run mcp
```

Ele fala MCP no stdin/stdout e abre o ITP simulado em `127.0.0.1:8787`. A porta vai no stderr como `itp_ready port=8787`.

No Claude Desktop, o comando precisa ser o `node`, com o diretório do repositório no `cwd`. `npm run` às vezes escreve no stdout e quebra o protocolo.

```json
{
  "mcpServers": {
    "cafe-aurora": {
      "command": "node",
      "args": ["--import", "tsx", "src/mcp/server.ts"],
      "cwd": "/CAMINHO/ABSOLUTO/do/repositorio",
      "env": {
        "DEMO_MODE": "true",
        "PORT": "8787"
      }
    }
  }
}
```

Arquivo de configuração:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: [A CONFIRMAR]. Um caminho usado por aí é `~/.config/Claude/claude_desktop_config.json`.

Reinicie o Claude Desktop depois de salvar. O servidor `cafe-aurora` deve listar seis ferramentas: `list_catalog`, `get_habitual_order`, `upsert_cart`, `get_cart`, `start_checkout`, `get_payment_status`.

Prompt de sistema sugerido: `prompts/agente-checkout.md`.

Frase para testar no chat: `compra o café de sempre`.

O modelo deve mostrar o carrinho (café coado e pão na chapa, R$ 14,50) e parar em `awaiting_user_approval`. Aí, noutro terminal:

```bash
npm run aprovar -- --consent COLE_O_CONSENT_ID --decision approve
```

A frase simulada da biometria já vai na CLI: `CONFIRMO O PIX`. Volte ao chat e peça o status. A resposta esperada é `settled`, com um `approval_id`.

Para recusar:

```bash
npm run aprovar -- --consent COLE_O_CONSENT_ID --decision reject
```

Se a porta 8787 estiver ocupada, mude `PORT` nos dois lados (config do Claude e a variável ao rodar `aprovar`).
