// What this program is called. Everything a person sees, the name the
// desktop knows it by and the token kept out of the user agent come from
// here, so an app built from this source (one site, its own name) changes
// this one file and nothing else. Hard rule 6 applies to whatever is put
// here: no trademarks in a name or an app ID.
export const PRODUCT = {
  /** The name shown on Home, in the menu, in notices and in the window title. */
  name: 'Longboard',
  /** The desktop's name for the program; entries for web apps are named after it, so two programs never write the same file. */
  appId: 'io.github.andrewgbest.Longboard',
  /** package.json's "name": the engine adds "<this>/<version>" to the user agent, and it is taken out again. */
  packageName: 'longboard',
} as const;
