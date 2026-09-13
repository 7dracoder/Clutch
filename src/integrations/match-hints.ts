export function inferMatchHints(input: {
  query?: string;
  sourceUrl?: string;
  licenseNote?: string;
}) {
  const haystack = [input.query, input.sourceUrl, input.licenseNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const competitions: Array<[RegExp, string]> = [
    [/\blaliga\b|\bla liga\b/, "LaLiga"],
    [/\bpremier league\b|\bepl\b/, "Premier League"],
    [/\bchampions league\b|\bucl\b/, "UEFA Champions League"],
    [/\bserie a\b/, "Serie A"],
    [/\bbundesliga\b/, "Bundesliga"],
    [/\bligue 1\b/, "Ligue 1"],
    [/\bmls\b/, "MLS"],
    [/\bworld cup\b/, "FIFA World Cup"],
  ];

  const teams: Array<[RegExp, string]> = [
    [/\breal madrid\b/, "Real Madrid"],
    [/\bbarcelona\b|\bfc barcelona\b/, "FC Barcelona"],
    [/\batletico madrid\b|\batlético madrid\b/, "Atletico Madrid"],
    [/\bmanchester city\b|\bman city\b/, "Manchester City"],
    [/\bmanchester united\b|\bman united\b/, "Manchester United"],
    [/\bliverpool\b/, "Liverpool"],
    [/\bchelsea\b/, "Chelsea"],
    [/\barsenal\b/, "Arsenal"],
    [/\bbayern\b/, "Bayern Munich"],
    [/\bpsg\b|\bparis saint[- ]germain\b/, "Paris Saint-Germain"],
  ];

  return {
    competition: competitions.find(([pattern]) => pattern.test(haystack))?.[1],
    team: teams.find(([pattern]) => pattern.test(haystack))?.[1],
  };
}
