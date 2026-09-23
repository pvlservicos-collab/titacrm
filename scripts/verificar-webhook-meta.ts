// Confere a assinatura X-Hub-Signature-256 dos webhooks da Meta.
// Rodar: npm run verificar:meta
import assert from 'node:assert/strict'
import { conferirAssinatura, assinar, segredosDoApp } from '../src/lib/meta-signature'

const SEGREDO = 'segredo-de-teste-do-app'
const corpo = '{"object":"whatsapp_business_account","entry":[{"id":"123","changes":[{"field":"messages","value":{"messages":[{"from":"5511999990000","id":"wamid.X","type":"text","text":{"body":"Olá, tudo bem? ção 🙂"}}]}}]}]}'

const casos: Array<[string, () => unknown]> = [
  ['assinatura correta é aceita', () => assert.equal(conferirAssinatura(corpo, assinar(corpo, SEGREDO), [SEGREDO]), 'valida')],
  ['corpo alterado em 1 byte é recusado', () => assert.equal(conferirAssinatura(corpo.replace('Olá', 'Ola'), assinar(corpo, SEGREDO), [SEGREDO]), 'invalida')],
  ['segredo errado é recusado', () => assert.equal(conferirAssinatura(corpo, assinar(corpo, 'outro'), [SEGREDO]), 'invalida')],
  ['sem cabeçalho é recusado', () => assert.equal(conferirAssinatura(corpo, null, [SEGREDO]), 'invalida')],
  ['cabeçalho sem "sha256=" é recusado', () => assert.equal(conferirAssinatura(corpo, assinar(corpo, SEGREDO).slice(7), [SEGREDO]), 'invalida')],
  ['cabeçalho com lixo/tamanho errado é recusado (sem estourar)', () => assert.equal(conferirAssinatura(corpo, 'sha256=abc', [SEGREDO]), 'invalida')],
  ['JSON reserializado NÃO confere (por isso o corpo é cru)', () => assert.equal(conferirAssinatura(JSON.stringify(JSON.parse(corpo), null, 2), assinar(corpo, SEGREDO), [SEGREDO]), 'invalida')],
  ['vários segredos: basta um bater', () => assert.equal(conferirAssinatura(corpo, assinar(corpo, 'segundo'), ['primeiro', 'segundo']), 'valida')],
  ['sem segredo configurado: avisa, não decide', () => assert.equal(conferirAssinatura(corpo, null, []), 'sem-segredo')],
  ['env com vírgulas e espaços vira lista limpa', () => assert.deepEqual(segredosDoApp(' a , b,, c '), ['a', 'b', 'c'])],
]

let falhas = 0
for (const [nome, fn] of casos) {
  try {
    fn()
    console.log('  ok  ' + nome)
  } catch (err: any) {
    falhas++
    console.log('FALHA ' + nome + '\n      ' + err.message)
  }
}
console.log(falhas === 0 ? `\n${casos.length} de ${casos.length} passaram.` : `\n${falhas} falharam.`)
process.exit(falhas === 0 ? 0 : 1)
