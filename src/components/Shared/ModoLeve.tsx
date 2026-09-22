'use client'

/**
 * Liga o "modo leve" (classe `modo-leve` no <html>, ver globals.css) em
 * computador que não aguenta os efeitos de vidro.
 *
 * O desfoque de fundo (backdrop-filter) é recalculado pela placa de vídeo a
 * cada quadro em que algo passa por trás dele — rolar a lista, abrir um menu.
 * Em notebook com vídeo integrado isso é o que trava a tela; em computador
 * bom, ninguém percebe. Então o efeito fica pra quem aguenta.
 *
 * Quem decide, em ordem:
 *   1. o endereço: `?leve=1` liga e `?leve=0` desliga, e fica guardado nesse
 *      navegador — é o jeito de forçar num computador específico;
 *   2. o que ficou guardado da última vez;
 *   3. o próprio computador: até 4 núcleos ou até 4 GB de memória liga
 *      direto; senão mede a tela por 2 segundos e liga se ela estiver abaixo
 *      de ~45 quadros por segundo.
 *
 * Nada disso muda o que aparece na tela além do vidro virar fundo opaco.
 */
import { useEffect } from 'react'

const CHAVE = 'modo-leve'

function ler(): string | null {
  try { return localStorage.getItem(CHAVE) } catch { return null }
}
function guardar(valor: '1' | '0') {
  try { localStorage.setItem(CHAVE, valor) } catch { /* navegador sem storage: vale só nesta visita */ }
}
function aplicar(ligado: boolean) {
  document.documentElement.classList.toggle('modo-leve', ligado)
}

export default function ModoLeve() {
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get('leve')
    if (pedido === '1' || pedido === '0') {
      guardar(pedido)
      aplicar(pedido === '1')
      return
    }

    const guardado = ler()
    if (guardado === '1' || guardado === '0') {
      aplicar(guardado === '1')
      return
    }

    const nav = navigator as Navigator & { deviceMemory?: number }
    const fraco =
      (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) ||
      (nav.deviceMemory && nav.deviceMemory <= 4)
    if (fraco) {
      guardar('1')
      aplicar(true)
      return
    }

    // Mede a tela. Espera 1 s pra não contar o carregamento da página.
    let cancelado = false
    let quadros = 0
    let inicio = 0
    let pedidoRaf = 0
    const medir = (agora: number) => {
      if (cancelado) return
      if (!inicio) inicio = agora
      quadros++
      if (agora - inicio < 2000) {
        pedidoRaf = requestAnimationFrame(medir)
        return
      }
      // Aba escondida no meio não mede nada — não decide com isso.
      if (document.visibilityState !== 'visible') return
      const fps = (quadros * 1000) / (agora - inicio)
      const lento = fps < 45
      guardar(lento ? '1' : '0')
      aplicar(lento)
    }
    const espera = setTimeout(() => { pedidoRaf = requestAnimationFrame(medir) }, 1000)
    return () => {
      cancelado = true
      clearTimeout(espera)
      cancelAnimationFrame(pedidoRaf)
    }
  }, [])

  return null
}
