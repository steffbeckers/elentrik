// Hulp voor IP-adressen en subnetten (IPv4 en IPv6), zonder afhankelijkheden. Een adres is een
// rij bytes (4 voor IPv4, 16 voor IPv6); geen BigInt, want de servercode wordt voor een oudere
// doelomgeving gebouwd.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).

type Adres = { versie: 4 | 6; bytes: number[] };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROEP = /^[0-9a-fA-F]{1,4}$/;

function parseIpv4(tekst: string): number[] | null {
  const m = IPV4.exec(tekst);
  if (!m) return null;
  const bytes: number[] = [];
  for (const deel of m.slice(1)) {
    // Geen voorloopnullen: ze worden soms als octaal gelezen.
    if (deel.length > 1 && deel.startsWith("0")) return null;
    const getal = Number(deel);
    if (getal > 255) return null;
    bytes.push(getal);
  }
  return bytes;
}

/** De bytes van een stuk IPv6 (zonder `::`), twee per groep; de laatste groep mag een IPv4-adres zijn. */
function parseGroepen(stuk: string, laatsteMagIpv4: boolean): number[] | null {
  if (stuk === "") return [];
  const delen = stuk.split(":");
  const bytes: number[] = [];
  for (const [i, deel] of delen.entries()) {
    if (laatsteMagIpv4 && i === delen.length - 1 && deel.includes(".")) {
      const v4 = parseIpv4(deel);
      if (!v4) return null;
      bytes.push(...v4);
    } else if (HEX_GROEP.test(deel)) {
      const groep = parseInt(deel, 16);
      bytes.push(groep >> 8, groep & 0xff);
    } else {
      return null;
    }
  }
  return bytes;
}

function parseIpv6(tekst: string): number[] | null {
  const stukken = tekst.split("::");
  if (stukken.length > 2) return null;
  if (stukken.length === 1) {
    const alle = parseGroepen(tekst, true);
    return alle && alle.length === 16 ? alle : null;
  }
  const voor = parseGroepen(stukken[0]!, false);
  const na = parseGroepen(stukken[1]!, true);
  if (!voor || !na || voor.length + na.length > 14) return null;
  return [...voor, ...new Array<number>(16 - voor.length - na.length).fill(0), ...na];
}

/** Een IPv4-in-IPv6-adres (`::ffff:a.b.c.d`) geldt als het IPv4-adres. */
function parseAdres(tekst: string): Adres | null {
  if (!tekst.includes(":")) {
    const v4 = parseIpv4(tekst);
    return v4 ? { versie: 4, bytes: v4 } : null;
  }
  const v6 = parseIpv6(tekst);
  if (!v6) return null;
  const isMapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return isMapped ? { versie: 4, bytes: v6.slice(12) } : { versie: 6, bytes: v6 };
}

type Subnet = { versie: 4 | 6; bytes: number[]; bits: number };

function parseCidr(cidr: string): Subnet | null {
  const delen = cidr.split("/");
  if (delen.length !== 2 || !/^\d{1,3}$/.test(delen[1]!)) return null;
  // Een net zelf blijft wat het is: een IPv4-in-IPv6-net wordt niet omgezet.
  const tekst = delen[0]!;
  const versie = tekst.includes(":") ? 6 : 4;
  const bytes = versie === 4 ? parseIpv4(tekst) : parseIpv6(tekst);
  const bits = Number(delen[1]);
  if (!bytes || bits > bytes.length * 8) return null;
  return { versie, bytes, bits };
}

/** Is `x` een geldig IPv4- of IPv6-adres (zonder poort of zone)? */
export function isIp(x: string): boolean {
  return parseAdres(x) !== null;
}

/** Is `x` een geldige CIDR, zoals `172.30.70.0/24` of `2001:db8::/64`? */
export function isCidr(x: string): boolean {
  return parseCidr(x) !== null;
}

/** Valt `ip` in het subnet `cidr`? Een ongeldig IP of een ongeldige CIDR geeft false. */
export function inSubnet(ip: string, cidr: string): boolean {
  const adres = parseAdres(ip);
  const net = parseCidr(cidr);
  if (!adres || !net || adres.versie !== net.versie) return false;
  for (let i = 0; i * 8 < net.bits; i++) {
    const open = net.bits - i * 8; // aantal bits van deze byte dat meetelt
    const masker = open >= 8 ? 0xff : (0xff << (8 - open)) & 0xff;
    if ((adres.bytes[i]! & masker) !== (net.bytes[i]! & masker)) return false;
  }
  return true;
}
