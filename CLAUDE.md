# Instruções para IA neste projeto

## Pacotes com binário nativo (ffmpeg-static, sharp, canvas, etc.)

Se um pacote resolve o path do seu binário via `path.join(__dirname, ...)` (é o caso do
`ffmpeg-static`, usado em `src/lib/audioConvert.ts` pra converter áudio pro formato que a
Meta aceita), ele **precisa** estar em `serverExternalPackages` no `next.config.ts`.

Sem isso, o webpack do Next empacota o código do pacote dentro do chunk da rota, e
`__dirname` em runtime passa a apontar pra `.next/server/chunks` em vez de
`node_modules/<pacote>` — o binário existe no deploy, mas o spawn falha com ENOENT
num path errado. Foi exatamente isso que quebrou o envio de áudio pela API Oficial e
pelo Instagram Direct em produção (falhava só em prod, "funcionava" localmente).

`outputFileTracingIncludes` sozinho **não resolve isso** — ele garante que o arquivo
binário seja copiado pro bundle, mas não corrige o `__dirname` errado. As duas coisas
são necessárias juntas: `outputFileTracingIncludes` (copia o binário) +
`serverExternalPackages` (mantém o `require()` nativo, sem bundlar o JS do pacote).

Antes de considerar uma mudança nessa área concluída, rode `npm run build` e confira
se o pacote aparece como `require("nome-do-pacote")` no `.js` compilado da rota (externo,
correto) e não com o código-fonte dele inlined (bundlado, quebrado):

```
grep -o 'require("nome-do-pacote")' .next/server/app/api/.../route.js
```

## Diagnosticar "não está enviando X"

Falhas de envio (WhatsApp/Instagram) ficam em `lead_activities.metadata` (`send_status`,
`send_error`), **não aparecem em `vercel logs`** só de olhar por cima — o catch em
`src/app/api/leads/[id]/messages/route.ts` já loga com `console.error`, mas se essa rota
for reescrita, mantenha esse log. Pra investigar um caso específico, é mais rápido
consultar o Neon direto (banco local = produção, ver memória do projeto) do que confiar
só nos logs da Vercel.

## Conversa aberta no chat (`?leadId=` x clique na lista)

Quem manda na conversa aberta é **o clique**, e só ele. O endereço é entrada:
serve pra chegar no chat por um link (aviso do grupo, "Ver conversa" do
Pipeline, busca global, notificação) e nada mais — `handleSelectLead` **não**
escreve no endereço, de propósito.

Esse acoplamento já produziu três bugs diferentes (abrir a conversa errada,
congelar na anterior, não abrir nada), todos pela mesma corrida: `useSearchParams`
chega uma renderização depois da navegação, e às vezes não chega. Enquanto os
dois lados escreviam, sempre existia um quadro em que seleção e endereço
discordavam.

Regras que sustentam isso:

- o efeito do endereço só age quando chega um **pedido novo** (`leadId` + a marca
  `abrir=` de `src/lib/links.ts`), nunca com valor repetido;
- todo link interno pro chat sai de `linkDaConversa()` / `linkDaConversaNaLinha()`
  (abre já na aba de uma linha da Evolution ou do número antigo) / `comMarcaDeAbertura()`,
  senão abrir duas vezes o mesmo link não reabre a conversa;
- a última conversa aberta fica no `localStorage`, não no endereço.

Antes de subir qualquer mudança nesse efeito ou em `handleSelectLead`:

```
npm run verificar:chat
```

Ele roda os cenários que quebraram na prática (com e sem link, endereço
acompanhando ou não, link repetido). Nada disso aparece em `tsc` nem no build.

## Números da Evolution (Michele, Augusto, Cau): NUNCA disparar

As linhas da Evolution (integrações `whatsapp_evolution`, uma por pessoa) existem
**só para observar e responder à mão pelo CRM**. Nada automático sai por elas:
funil, disparo, IA, n8n, token de API, nada. Isso vale até o dono do projeto
liberar explicitamente.

O que sustenta a regra (não desfazer sem pedido explícito):

- `getAutomationAdapter()` (src/lib/channels/registry.ts) nunca devolve o adapter da
  Evolution;
- `POST /api/leads/[id]/messages` recusa envio por Evolution sem pessoa logada
  (`auth.memberId`) — token de API não passa;
- a mensagem que ENTRA por uma linha (src/lib/evolutionInbound.ts) não vai pro webhook
  de saída, não entra em funil e não cria lead no Kanban;
- quem responde por elas é sempre uma pessoa digitando no chat.

Risco a lembrar: a Evolution é API não oficial (Baileys) e vai contra os termos do
WhatsApp — banimento é possível mesmo sem automação. Por isso: nada de primeiro
contato em massa, só resposta humana.
