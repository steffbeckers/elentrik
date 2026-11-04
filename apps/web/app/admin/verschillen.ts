/** Begrensde vergelijking voor de UI; de volledige revisie blijft apart downloadbaar. */
export function adminVerschillen(voor: unknown, na: unknown) {
  const items: Array<{ pad: string; voor: string; na: string }> = [];
  let bekeken = 0; let beperkt = false;
  const tekst = (waarde: unknown): string => {
    if (waarde === undefined || waarde === null) return '—';
    const s = String(waarde);
    if (s.length > 500) beperkt = true;
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  };
  function loop(a: unknown, b: unknown, pad: string, diepte: number) {
    if (a === b) return;
    if (++bekeken > 2000 || items.length >= 200 || diepte > 20) { beperkt = true; return; }
    if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) {
      const x = a && typeof a === 'object' ? a as Record<string, unknown> : {};
      const y = b && typeof b === 'object' ? b as Record<string, unknown> : {};
      const keys = new Set<string>();
      for (const k in x) { if (keys.size >= 100) { beperkt = true; break; } if (Object.hasOwn(x, k)) keys.add(k); }
      for (const k in y) { if (keys.size >= 100) { beperkt = true; break; } if (Object.hasOwn(y, k)) keys.add(k); }
      for (const k of keys) loop(x[k], y[k], pad ? `${pad}.${k}` : k, diepte + 1);
      if (Array.isArray(a) || Array.isArray(b)) loop(Array.isArray(a) ? a.length : undefined, Array.isArray(b) ? b.length : undefined, `${pad}.length`, diepte + 1);
      return;
    }
    items.push({ pad, voor: tekst(a), na: tekst(b) });
  }
  loop(voor, na, '', 0);
  return { items, beperkt };
}
