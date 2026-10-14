# AssinaPaciente

Aplicação web inicial para criar contratos e enviar um link individual ao paciente pelo WhatsApp. O paciente abre o link no celular, lê as condições, desenha a assinatura na tela touch e confirma o aceite. A clínica acompanha o status no painel.

## Funcionalidades

- Painel administrativo com login por variáveis de ambiente.
- Cadastro de contrato, paciente, WhatsApp, serviço, valor e cláusulas.
- Token individual aleatório para o link público; o banco guarda apenas o hash do token.
- Atalho para WhatsApp com mensagem pronta.
- Assinatura desenhada com mouse ou tela touch, aceite explícito e registro de data/hora.
- Registro de eventos de auditoria e opção de imprimir/salvar o contrato em PDF pelo navegador.
- Banco SQLite local persistente na pasta `data/`.

## Requisitos

- Node.js 20 ou superior.
- Para uso real com pacientes: hospedagem HTTPS, domínio público e configuração segura do ambiente.

## Executar localmente

1. Descompacte o ZIP.
2. Copie `.env.example` para `.env`.
3. Troque `ADMIN_PASSWORD` por uma senha forte e `SESSION_SECRET` por um segredo aleatório longo.
4. Configure `BASE_URL=http://localhost:3000` para teste local.
5. No terminal, dentro da pasta do projeto, execute:

   ```bash
   npm install
   npm start
   ```

6. Abra `http://localhost:3000` e entre com os dados definidos no `.env`.

## Teste com WhatsApp

No computador, `localhost` só funciona no próprio computador. Para o paciente abrir o link, a aplicação precisa estar publicada em uma URL HTTPS pública. Defina `BASE_URL` com essa URL pública **antes** de criar contratos. Em seguida, abra um contrato recém-criado e clique em “Enviar pelo WhatsApp”.

Por segurança, o token em texto puro é mostrado somente na tela após a criação; o banco guarda apenas seu hash. Se você sair dessa tela sem copiar o link, será necessário criar outro contrato nesta versão. Uma melhoria recomendada é implementar reemissão/revogação de links com trilha de auditoria.

## Publicação

- Publique em uma hospedagem que aceite Node.js e tenha armazenamento persistente para `data/`.
- Configure as variáveis `PORT`, `BASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` e `NODE_ENV=production`.
- Use HTTPS. Em produção, o app recusa iniciar se as credenciais de exemplo não tiverem sido trocadas.
- Restrinja o acesso administrativo, faça backup protegido do banco e defina política de retenção e exclusão de dados.
- Não confie em `X-Forwarded-For` a menos que o proxy reverso seja confiável e esteja configurado corretamente.

## Limitações e cuidados importantes

Este é um projeto inicial funcional, não uma garantia de validade jurídica da assinatura em todos os casos. O registro de nome digitado, aceite, assinatura desenhada, data/hora e dados técnicos pode contribuir para a trilha de evidências, mas não comprova por si só a identidade do signatário. Para contratos relevantes, peça revisão jurídica e avalie serviço de assinatura eletrônica com autenticação e evidências apropriadas.

A aplicação pode armazenar dados pessoais e informações potencialmente sensíveis. Antes de usar com pacientes, revise a conformidade com a LGPD, informe o titular sobre o tratamento, limite os dados coletados, proteja backups e banco, configure retenção e acesso, e evite incluir dados clínicos desnecessários no contrato. A assinatura desenhada é armazenada no banco local como imagem Base64.

O recurso de “Imprimir / salvar PDF” usa a função de impressão do navegador; não gera PDF assinado criptograficamente.
