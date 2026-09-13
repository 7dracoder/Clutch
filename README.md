# Clutch

**AI money desk for sportsbooks.**

Clutch watches live games for moments that could get expensive, checks how much cash you have in **Rho**, and helps the desk decide what to do next.

It is **not** a fan app. It is **not** an auto-betting bot.  
People still make the calls. Clutch just warns earlier.

**Demo:** [https://youtu.be/9EOp63tJMFo](https://youtu.be/9EOp63tJMFo)

---

## What is Clutch?

Think of a sportsbook as a shop that sells bets.

1. People place bets.
2. A dangerous play starts building (shot, late score, and so on).
3. If that play hits, the shop may owe a lot of money.
4. Clutch notices while the chance is still building — often **a few seconds to about 10–20 seconds** before a finish would show on the scoreboard.
5. It checks **safe cash** in Rho.
6. It tells you: risk is rising, here’s why, here’s your cash.

Early warning is cheaper than finding out after the goal.

---

## Two modes

| Mode | Who it’s for | What you get |
|------|----------------|--------------|
| **Treasury** | Sportsbook money desk | Exposure, Rho ledger, desk approvals, Treasury voice analyst |
| **Personal** | Someone following system leads for their own bets | Personal lead, sizing help, Personal voice analyst on the **same** Rho sandbox accounts |

Toggle **Treasury / Personal** in the top bar.

---

## Main screens

| Screen | What it is |
|--------|------------|
| **Watch Slate** (`/slate`) | Live + upcoming games. Tap one to open the desk. |
| **Command Center** (`/`) | Live desk for one game: stream, pitch twin, risk, Rho book, voice. |

Click **CLUTCH** in the header to go back to all games.

---

## The money math (simple)

```
Safe cash        = checking − money already leaving − payout reserve
Worst-case payout = stake × odds
Buffer           = safe cash − worst-case payout
```

| Status | Meaning |
|--------|---------|
| **Safe** | Worst-case payout is ≤ 50% of safe cash |
| **Watch** | Above 50%, but you can still cover it |
| **At risk** | Worst-case payout is bigger than safe cash |

News and commentary can change **how likely** something looks.  
They **never** change the payout formula (stake × odds).

---

## How the pieces fit

```
Live video (AirServer / allowed stream)
        ↓
Vision worker (tracks ball + players)
        ↓
“Shot / goal looking likely?”
        ↓
Match news + live commentary (Tavily)
        ↓
Compare payout risk to Rho cash
        ↓
Desk alerts + voice briefing
```

### Tools we use

| Tool | Role |
|------|------|
| **Rho** | Bank book — balances, pending cash, safe cash |
| **ElevenLabs** | Voice agents (Treasury + Personal) |
| **Tavily** | Injuries, previews, live commentary |
| **ESPN** | Fixture slate / scores |
| **API-Football** | Optional live soccer score + minute (when the key works) |
| **Vision** | OpenCV by default; optional research RF-DETR soccer model |
| **Baseten** | Optional extra help on tough video frames |

### Voice agents

Run once after you add an ElevenLabs key:

```powershell
npm.cmd run analyst:provision
```

That writes `ELEVENLABS_AGENT_ID` and `ELEVENLABS_PERSONAL_AGENT_ID` into `.env.local`.

- **Treasury Analyst** — risk, cash, desk approvals  
- **Personal Betting Analyst** — leads and sizing talk against the same Rho sandbox  

Both advise only. They do **not** place bets or wire money.

---

## Quick start

**Need:** Node.js 20.9+  
**Also need for live vision:** Python 3.12  

On Windows, use `npm.cmd` in PowerShell.

### 1. Install

```powershell
cd Clutch
npm.cmd install
Copy-Item .env.example .env.local
```

### 2. Fill `.env.local`

| Key | What it unlocks |
|-----|-----------------|
| `RHO_API_TOKEN=sandbox` | Demo cash ledger (works out of the box) |
| `TAVILY_API_KEY` | Match research + live commentary |
| `ELEVENLABS_API_KEY` | Voice (then run `analyst:provision`) |
| `API_FOOTBALL_KEY` | Optional live soccer score |
| `BASETEN_API_KEY` | Optional frame helper |

Never commit `.env.local`.

### 3. Run the web app

```powershell
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Watch Slate**.

### 4. Optional: live pitch twin

```powershell
npm.cmd run vision:install
npm.cmd run dev:all
```

Then:

1. Open a game from Watch Slate  
2. Mirror it into AirServer (or similar)  
3. Tap **Tap to capture AirServer** and share that window  
4. Watch risk + Rho update live  

Only use video you are allowed to analyze. Clutch does not keep a recording of the stream.

---

## Handy commands

```powershell
npm.cmd run dev                 # web only
npm.cmd run vision              # vision worker only
npm.cmd run dev:all             # web + vision
npm.cmd run analyst:provision   # create / update ElevenLabs agents
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

---

## Repo layout (high level)

```
src/                 Next.js app (slate, desk, APIs, voice UI)
services/vision/     Local Python vision worker
scripts/             ElevenLabs agent provisioning
tests/               Vitest tests
```

---

## Important notes

- Clutch is **decision support** — not auto-payout, not auto-betting.
- Do not analyze DRM / unauthorized streams.
- Optional SoccerNet RF-DETR weights are research-only unless you have the right to use them commercially.

---


