import type { SlateEvent, SlateSport } from "@/domain/slate";

const soccerClubs = [
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester city",
  "man city",
  "manchester united",
  "man united",
  "tottenham",
  "newcastle",
  "aston villa",
  "west ham",
  "brighton",
  "bournemouth",
  "fulham",
  "wolves",
  "everton",
  "brentford",
  "crystal palace",
  "nottingham forest",
  "sunderland",
  "real madrid",
  "barcelona",
  "atletico",
  "atlético",
  "bayern",
  "dortmund",
  "psg",
  "paris saint",
  "juventus",
  "inter milan",
  "ac milan",
  "napoli",
  "roma",
  "lazio",
  "ajax",
  "benfica",
  "porto",
  "celtic",
  "sevilla",
  "villarreal",
  "leverkusen",
  "leipzig",
  "monaco",
  "marseille",
  "lyon",
  "inter miami",
  "lafc",
];

const nflTeams = [
  "chiefs",
  "bills",
  "eagles",
  "49ers",
  "cowboys",
  "packers",
  "ravens",
  "lions",
  "texans",
  "bengals",
  "dolphins",
  "jets",
  "patriots",
  "steelers",
  "browns",
  "raiders",
  "chargers",
  "broncos",
  "vikings",
  "bears",
  "commanders",
  "giants",
  "falcons",
  "saints",
  "buccaneers",
  "panthers",
  "seahawks",
  "rams",
  "cardinals",
  "jaguars",
  "colts",
  "titans",
  "bears",
];

const nbaTeams = [
  "lakers",
  "celtics",
  "nuggets",
  "thunder",
  "knicks",
  "76ers",
  "sixers",
  "bucks",
  "heat",
  "warriors",
  "suns",
  "mavericks",
  "timberwolves",
  "cavaliers",
  "pacers",
  "clippers",
  "rockets",
  "grizzlies",
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesClub(name: string, clubs: string[]) {
  const normalized = normalizeName(name);
  return clubs.some(
    (club) => normalized === club || normalized.includes(club),
  );
}

export function namesReferToSameTeam(left: string, right: string) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function sameSlateTeams(left: SlateEvent, right: SlateEvent) {
  const leftNames = [left.home.name, left.away.name];
  const rightNames = [right.home.name, right.away.name];
  return (
    (namesReferToSameTeam(leftNames[0], rightNames[0]) &&
      namesReferToSameTeam(leftNames[1], rightNames[1])) ||
    (namesReferToSameTeam(leftNames[0], rightNames[1]) &&
      namesReferToSameTeam(leftNames[1], rightNames[0]))
  );
}

export function sportFromTeamNames(home: string, away: string): SlateSport | null {
  const soccerHits =
    Number(includesClub(home, soccerClubs)) +
    Number(includesClub(away, soccerClubs));
  const nflHits =
    Number(includesClub(home, nflTeams)) + Number(includesClub(away, nflTeams));
  const nbaHits =
    Number(includesClub(home, nbaTeams)) + Number(includesClub(away, nbaTeams));

  if (soccerHits > 0 && nflHits === 0 && nbaHits === 0) return "soccer";
  if (nflHits > 0 && soccerHits === 0) return "american_football";
  if (nbaHits > 0 && soccerHits === 0 && nflHits === 0) return "basketball";
  return null;
}

export function classifySlateSport(text: string): SlateSport | null {
  const lower = text.toLowerCase();
  if (/\bnba\b|\bwnba\b|\bbasketball\b/.test(lower)) return "basketball";
  if (/\bnfl\b|\bcollege football\b|\bncaaf\b|\bsuper bowl\b/.test(lower)) {
    return "american_football";
  }
  if (/\bufc\b|\bmma\b|\bfight card\b/.test(lower)) return "mma";
  if (/\bformula 1\b|\bf1\b|\bqualifying\b/.test(lower)) return "motorsport";
  if (/\bmlb\b|\bbaseball\b/.test(lower)) return "baseball";
  if (/\bnhl\b|\bhockey\b/.test(lower)) return "hockey";
  if (/\batp\b|\bwta\b|\btennis\b/.test(lower)) return "tennis";
  if (
    /\bpremier league\b|\bepl\b|\blaliga\b|\bla liga\b|\bsoccer\b|\bfootball club\b|\bchampions league\b|\bmls\b|\bserie a\b|\bbundesliga\b|\bligue 1\b/.test(
      lower,
    )
  ) {
    return "soccer";
  }
  return null;
}

export function inferEventSport(input: {
  home: string;
  away: string;
  line: string;
  chunk?: string;
}): SlateSport | null {
  const fromTeams = sportFromTeamNames(input.home, input.away);
  const fromLine = classifySlateSport(input.line);
  if (fromTeams && fromLine && fromTeams !== fromLine) return fromTeams;
  if (fromTeams) return fromTeams;
  if (fromLine) return fromLine;
  if (input.chunk && input.chunk !== input.line) {
    const fromChunk = classifySlateSport(input.chunk);
    if (fromChunk && (!fromTeams || fromChunk === fromTeams)) {
      const chunkSports = [
        classifySlateSport(input.chunk),
      ].filter(Boolean);
      if (chunkSports.length === 1) return fromChunk;
    }
  }
  return null;
}

export function eventFitsSport(event: SlateEvent) {
  const inferred = sportFromTeamNames(event.home.name, event.away.name);
  return !inferred || inferred === event.sport;
}
