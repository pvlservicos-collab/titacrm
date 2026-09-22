/**
 * Os nomes das etapas que o CRM move sozinho — e nada além disso.
 *
 * Arquivo separado de `etapas.ts` de propósito: aquele fala com o banco, e
 * qualquer componente de tela que importasse uma constante de lá arrastava o
 * driver do Postgres pro navegador (o build quebrava com "Can't resolve 'tls'").
 * Aqui só tem texto, então serve aos dois lados.
 */

export const ETAPA_CONTACTADO_IA = 'Contactado por IA'
export const ETAPA_LEAD_RESPONDEU = 'Lead respondeu IA'
export const ETAPA_ATENDIMENTO_HUMANO = 'Atendimento por humano'

/** Ordem da jornada: mover só avança, nunca puxa o lead pra trás. */
export const ORDEM_DA_JORNADA = [
  ETAPA_CONTACTADO_IA,
  ETAPA_LEAD_RESPONDEU,
  ETAPA_ATENDIMENTO_HUMANO,
]
