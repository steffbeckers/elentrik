// Gedeeld tussen de scan en de tabeltest in geen-io.test.ts.
// Vangt: imports van node:-modules (statisch, bare en dynamisch), fs en
// fs/promises, vue en nuxt, require( en fetch(.
export const VERBODEN =
  /\b(?:from|import)\s*\(?\s*["'](?:node:|fs["'/]|vue["'/]|nuxt["'/]|@nuxt\/)|\brequire\(|\bfetch\(/;
