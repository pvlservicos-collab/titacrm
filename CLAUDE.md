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
