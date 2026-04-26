Roadmap  
Current state  
M0 — Foundation. No code. Drafting canonical docs.  
Current sprint

 concept-brief.md v0  
 roadmap.md v0  
 gdd.md v0  
 balance-bible.md v0  
 tech-architecture.md v0 — resolves Phaser vs PixiJS, monorepo layout, sim contract  
 visual-direction.md v0 — 3 directions, pick 1  
 content-schemas.ts v0 — Item, Class, Recipe, Contract, Run, GhostBuild  
 telemetry-plan.md v0  
 decision-log.md initialized

M0 exits when all nine canonical files are approved.  
Milestones  
M0 — Foundation  
Goal: Approved docs. Zero code.  
Effort: 5–8 working days at peer-review pace.  
Exit criteria: All nine canonical files locked. Visual direction picked. Sim contract decided.  
M1 — Graybox prototype (4–6 weeks)  
Goal: One playable run end-to-end, deterministic, internal-only.  
In scope:

Drag/drop bag, shop, sell, reroll  
Deterministic combat package (shared sim)  
2 classes, \~45 items, 12 recipes, 3 status effects, 1 boss  
Replay log  
1 daily contract pipeline  
Telemetry hooks per telemetry-plan.md  
Placeholder art only

Exit criteria: Trey \+ 3 internal testers each complete 5+ runs without crashes. Item pick-rate spread visible in dashboard. Median run length 12–20 min.  
M2 — Public web demo (10–12 weeks)  
Goal: Public browser build, portal-ready.  
In scope:

Refined art in approved direction  
Ranked trophies (cosmetic-only economy)  
Ghost battle queue (async)  
Account persistence (auth, save, ghost build storage)  
Mobile vertical layout (390-wide)  
Portal build (CrazyGames or Itch first)

Exit criteria: Success metrics in concept-brief.md § Success metrics hit over 200+ sessions.  
M3 — Feature-complete alpha (18–24 weeks)  
Goal: Live-ops-ready product.  
In scope:

Seasonal relics  
Alt bag shapes  
Limited-time mutators  
Friend ghosts / clan rosters  
Cosmetic store  
Live-ops calendar

Exit criteria: 4 weeks of live content cadence shipped without regressions. D30 ≥ 6%.  
Kill lists  
M1 — do NOT build

Auth or account system (local save only)  
Ranked ladder UI  
Multiple bag shapes  
More than 2 classes  
Final art, custom VFX, music  
Mobile-specific layout  
Friend systems, chat, social  
Cosmetic store, monetization surfaces  
Native wrappers, Electron, mobile apps  
Real-time anything

M2 — do NOT build

Seasonal content beyond launch set  
Mutators or alt rules  
Clans, friends, chat  
Native ports  
Editor / UGC tools  
More than 1 daily contract type

M3 — do NOT build

Real-time PvP  
3D  
Native wrappers (still web-first)  
Heavy narrative content  
New genres bolted on (no card-battler mode, no MMO layer, no city builder side-quest)

Open risks  
RiskSeverityOwner docStatusRenderer choice (Phaser vs PixiJS) shapes sim boundaryMediumtech-architecture.mdOpen — decide in M0Determinism across client/server (RNG, float drift)Hightech-architecture.md § Simulation contractOpen — decide in M0Mobile bag readability at 390-wideHighgdd.md § UI flow \+ visual-direction.mdOpen — test in M1Time-to-first-fun \> 4 min sinks D1Highgdd.md § OnboardingTracked in telemetry from M1Async match quality with small early player baseMediumSeed ghost pool: internal builds \+ bot variantsOpen — design in M2 planItem meta collapses to one dominant buildMediumbalance-bible.md § Pick-rate guardrailsContinuous — telemetry-drivenBrowser perf on mid-tier mobileMediumtech-architecture.md § Performance budgetOpen — measure in M1  
Open decisions (block dependent work)

Renderer: Phaser vs PixiJS. Blocks tech-architecture.md and all rendering code.  
Monorepo tool: pnpm workspaces vs Turbo vs Nx. Blocks repo scaffold.  
Visual direction: whimsical / dark-roguelite / clean-esports. Blocks all UI mockups.  
Sim package boundary: pure TS lib vs worker-isolated execution. Blocks combat code.

Replanning triggers  
Replan the active milestone if any of:

Two consecutive playtest cohorts miss the milestone's success metric.  
A pillar is violated to ship a feature.  
Effort on a single deliverable slips \> 50%.  
