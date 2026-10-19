// Reading a search ("aircon pasig", "tubero", "leaking faucet", "Ben") into
// the services it's about and the words left to match technicians by (name,
// city, description). People describe the problem more often than they name
// the category, in English or Tagalog, so each service has words for it; any
// service is also found by the words of its name (one added in the database too).

const SERVICE_WORDS: Record<string, string[]> = {
  plumbing: [
    "plumbing", "plumber", "tubero", "faucet", "gripo", "leak", "leaking", "tagas", "tumutulo", "pipe", "tubo",
    "toilet", "inidoro", "bowl", "drain", "barado", "clog", "sink", "lababo", "shower", "water heater", "pump",
    "poso", "water",
  ],
  repairing: [
    "repairing", "repair", "aircon", "air conditioner", "ac", "aircon cleaning", "ref", "refrigerator", "fridge",
    "washing machine", "washer", "laundry", "tv", "television", "electric fan", "fan", "microwave", "oven",
    "stove", "kalan", "rice cooker", "appliance", "appliances", "sira",
  ],
  electrical: [
    "electrical", "electric", "electrician", "kuryente", "wiring", "wire", "outlet", "saksakan", "breaker",
    "circuit", "short circuit", "switch", "light", "lights", "ilaw", "socket", "bulb",
  ],
  carpentry: [
    "carpentry", "carpenter", "karpintero", "wood", "kahoy", "cabinet", "door", "pinto", "pintuan", "window",
    "bintana", "furniture", "table", "mesa", "chair", "upuan", "shelf", "cabinets", "roof", "bubong",
  ],
  cleaning: [
    "cleaning", "cleaner", "clean", "linis", "maglinis", "deep clean", "sofa", "upholstery", "carpet",
    "mattress", "kutson", "house cleaning",
  ],
  painting: ["painting", "painter", "paint", "pintura", "pintor", "wall", "pader", "repaint"],
  handyman: ["handyman", "install", "installation", "mount", "assemble", "assembly", "odd jobs", "kabit", "ikabit"],
};

// Words that only join a search together ("electrician in Makati", "ayos ng gripo").
const FILLER = new Set([
  "a", "an", "the", "in", "at", "near", "around", "for", "my", "of", "and", "to", "with", "needed", "need",
  "fix", "fixing", "broken", "sa", "ng", "ang", "mga", "na", "ayos", "ayusin", "pa", "po",
]);

/** The words of a search, lower-case, without punctuation (max 8). */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "Parañaque" -> "paranaque", as people type it either way
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 8);

// A word stands for a service's word if they're the same, or one starts the
// other and both are at least 4 letters ("plumb" ~ "plumber", "leaks" ~ "leak").
const sameWord = (word: string, key: string) =>
  word === key || (word.length >= 4 && key.length >= 4 && (key.startsWith(word) || word.startsWith(key)));

export type ParsedSearch = {
  /** Service slugs the search is about, in the services' order. */
  services: string[];
  /** Words left to match technicians by. */
  terms: string[];
};

/** Reads a search for the services that can be booked. */
export function parseSearch(query: string, categories: { slug: string; name: string }[]): ParsedSearch {
  const words = wordsOf(query);
  const joined = ` ${words.join(" ")} `;
  const used = new Set<number>();
  const services = new Set<string>();

  for (const { slug, name } of categories) {
    const keys = [...(SERVICE_WORDS[slug] ?? []), ...wordsOf(name).filter((word) => !FILLER.has(word))];
    for (const key of keys) {
      const keyWords = wordsOf(key);
      if (keyWords.length > 1) {
        // A phrase ("washing machine") counts only as a whole.
        if (!joined.includes(` ${keyWords.join(" ")} `)) continue;
        services.add(slug);
        const start = words.findIndex((_, i) => keyWords.every((k, j) => words[i + j] === k));
        keyWords.forEach((_, j) => used.add(start + j));
        continue;
      }
      words.forEach((word, i) => {
        if (sameWord(word, key)) {
          services.add(slug);
          used.add(i);
        }
      });
    }
  }

  return {
    services: categories.map((c) => c.slug).filter((slug) => services.has(slug)),
    terms: words.filter((word, i) => !used.has(i) && !FILLER.has(word)),
  };
}

// Searches to try, on an empty search.
export const SEARCH_IDEAS = ["Aircon cleaning", "Leaking faucet", "Electrician", "Carpenter", "Deep cleaning", "Painter"];
