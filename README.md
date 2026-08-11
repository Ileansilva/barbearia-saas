# Sistema SaaS Multiempresa para Barbearias

Esta versão é separada do projeto white-label por instalação. Ela foi desenhada para você comercializar o software **por assinatura** para várias barbearias usando um único sistema.

## Arquitetura

Cada barbearia é um `tenant`.

Os dados são separados por `tenant_id`:
- serviços;
- barbeiros;
- agendamentos;
- identidade visual;
- horário de funcionamento;
- plano/assinatura.

O Supabase usa RLS (Row Level Security) para impedir que uma barbearia leia ou altere dados de outra.

## Páginas

- `index.html` — apresentação da plataforma.
- `cadastro.html` — cadastro de uma nova barbearia.
- `entrar.html` — login.
- `painel.html` — painel da barbearia.
- `superadmin.html` — painel do dono da plataforma.
- `barbearia.html?slug=nome-da-barbearia` — site público.
- `agendar.html?slug=nome-da-barbearia` — agendamento público.

## Recursos entregues

### Para a barbearia
- cadastro/login;
- identidade visual própria;
- link público próprio por slug;
- serviços;
- barbeiros;
- agenda por barbeiro;
- disponibilidade considerando duração do serviço;
- agendamentos;
- status de atendimento;
- horários e dias de funcionamento;
- datas bloqueadas;
- visualização do plano atual.

### Para o dono da plataforma
- painel Superadmin;
- total de barbearias;
- clientes ativos, em teste e suspensos;
- planos Starter, Pro e Premium;
- alteração manual de plano;
- ativação/suspensão de clientes.

## Antes de publicar

### 1. Crie um NOVO projeto Supabase
Não use o banco da versão white-label atual para esta versão SaaS.

### 2. Execute o SQL
No Supabase:
SQL Editor → New query → cole `supabase/schema.sql` → Run.

### 3. Configure Auth
Authentication → Providers → Email.

Para testes mais simples, você pode desativar temporariamente a confirmação obrigatória por e-mail. Em produção, mantenha confirmação e políticas de senha adequadas.

### 4. Configure o frontend
Abra `js/config.js` e informe:

```js
SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
SUPABASE_ANON_KEY: "sb_publishable_..."
```

`PRODUCT_NAME` é o nome comercial da SUA plataforma.

### 5. Crie sua conta
Abra `cadastro.html`, crie uma barbearia de teste e faça login.

### 6. Transforme sua conta em Superadmin
Abra `supabase/MAKE_ME_SUPERADMIN.sql`, troque `SEU_EMAIL_AQUI` pelo seu e-mail e execute no SQL Editor.

Depois entre em:
`superadmin.html`

## Links públicos

Em GitHub Pages os links ficam assim:

`barbearia.html?slug=barbearia-central`

e:

`agendar.html?slug=barbearia-central`

Quando o sistema for migrado para Vercel/Cloudflare/servidor próprio, pode evoluir para URLs amigáveis como:

`seudominio.com/b/barbearia-central`

## Cobrança

O banco já possui:
- `plans`
- `subscriptions`

A cobrança real ainda está em modo de gestão manual.

Para cobrança automática, a próxima etapa é integrar um gateway como Mercado Pago, Stripe ou Asaas usando backend/Edge Functions e webhooks.

## Segurança de produção

Antes de vender em escala:
- habilite proteção contra senhas vazadas no Supabase;
- adicione rate limit / CAPTCHA no agendamento público;
- valide upload de arquivos;
- implemente logs de auditoria;
- restrinja criação excessiva de tenants;
- integre cobrança por webhook;
- revise os Advisors de segurança e performance do Supabase.

## Planos iniciais

- Starter: R$ 79/mês — até 3 barbeiros
- Pro: R$ 119/mês — até 8 barbeiros
- Premium: R$ 169/mês — até 30 barbeiros

Os valores são exemplos e podem ser alterados na tabela `plans`.

## Observação importante

O limite `max_barbers` está armazenado no plano, mas nesta primeira versão não é aplicado no frontend/banco. A aplicação do limite automático por plano pode ser adicionada na próxima evolução junto com a cobrança.


## Projeto Supabase desta versão

Esta cópia já está conectada ao projeto criado para o SaaS:

- Projeto: `Barbearia SaaS Multiempresa`
- Região: `sa-east-1` (São Paulo)
- Project Ref: `ozgfaxmnctenwojginza`
- URL: `https://ozgfaxmnctenwojginza.supabase.co`

A chave usada no frontend é somente a **Publishable Key**, apropriada para aplicações públicas com RLS. Nenhuma `service_role` foi colocada no código.

## Estado atual do Superadmin

A troca de plano está preparada no painel. A alteração automática do status/suspensão da empresa foi deixada como etapa posterior de backend/billing, em vez de permitir que usuários autenticados alterem diretamente esse campo sensível.

Quando a cobrança for integrada via Mercado Pago, Asaas ou Stripe, o ideal é o status ser atualizado por uma Edge Function/webhook autenticado.
