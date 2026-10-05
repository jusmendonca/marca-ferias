type Filho = Node | string | null | undefined | false;
type Valor = string | number | boolean | null | undefined | ((ev: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Valor> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'value' || k === 'checked') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

export function aviso(tipo: 'erro' | 'ok' | 'info', texto: string): HTMLParagraphElement {
  return h('p', { class: `aviso aviso-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, texto);
}
