import cities from "./Cities.json";

export const cityOptions = cities.cities.data.map(({ names }) => ({
  value: names.fr,
  ar: names.ar.normalize("NFKC"),
  en: names.en,
}));

const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().trim();

export function filterCities(query) {
  const term = normalize(query);
  return cityOptions.filter((city) => [city.value, city.ar, city.en].some((name) => normalize(name).includes(term)));
}

export function cityLabel(value, language) {
  const match = cityOptions.find((city) => [city.value, city.ar, city.en].some((name) => normalize(name) === normalize(value)));
  return match ? (language.startsWith("ar") ? match.ar : match.en || match.value) : value || "";
}
