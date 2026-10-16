# Privacidade

Este repositório é um demo local com dados fictícios.

O que existe:

- Um cliente, `cust_demo_001`, com o nome de tela `Cliente Demo`.
- Uma loja, Café Aurora, na Rua das Letras, 100, Cidade Demo.
- Uma chave Pix marcada como fictícia: `demo-chave-pix-nao-real-cafe-aurora`.
- Ids aleatórios de carrinho, intent, consentimento, aprovação e um `endToEndId` de mentira.

O que não existe, e não deve ser acrescentado em fixture, log ou README:

- CPF, CNPJ, e-mail, telefone, endereço real.
- Chave Pix de pessoa ou de empresa real.
- Senha, token, certificado, client secret, chave privada.
- Nome de empregador ou dado de família.

O audit log guarda a trilha do pagamento simulado (quem pediu, quem aprovou, qual `approval_id` autorizou a liquidação). Ele não guarda a frase digitada, só o fato de ela ter conferido ou não (`confirmation_mismatch`).

O servidor HTTP do ITP simulado escuta só em `127.0.0.1`. Isso limita o demo à máquina local. Não é controle de acesso de produção: quem usa a máquina consegue chamar a porta.

`DEMO_MODE=false` faz o processo sair com erro. Não há modo silencioso que passe a usar credencial real.
