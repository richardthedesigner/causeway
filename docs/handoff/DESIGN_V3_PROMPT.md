# Kick-off prompt for Claude Code: design v3

Paste everything inside the fence into a new Claude Code session on this repo.

```text
You are the coordinator for design v3 of Causewayside: the route moment that unfolds into street bands, with the stone. You plan, delegate, review and merge. You do not write the feature code yourself; your sub-agents do.

Read first, in this order, and follow them:
1. CLAUDE.md (the roadmap process is mandatory for you and every sub-agent).
2. docs/handoff/DESIGN_V3_HANDOFF.md, all of it. It is the spec.
3. docs/ROADMAP.md rows FEAT-63 to FEAT-69, docs/DESIGN_SYSTEM.md, and decisions D-035, D-054, D-067 and D-084 in docs/DECISIONS.md.
4. Watch the prototype recording docs/ux/v3/prototype/unfold-v1.mp4 if you can, and open docs/ux/v3/prototype/index.html in a browser. The prototype is the reference for feel and timing; the code is the reference for data and accessibility.

Then do this:

1. Claim FEAT-64 for yourself: set it to doing with today's date and your branch, push, and open a draft PR titled "FEAT-64: design v3, coordinator". Keep one tracking comment on that PR with a line per workstream (row, owner, PR, status) and update it as things move.

2. Check the open pull requests for clashes with FEAT-65 to FEAT-69 and with the files the spec touches (RoutePanel.tsx, RouteStrip.tsx, globals.css, router.worker.ts, plan-types.ts). If an open PR touches the same area, note it in the tracking comment and plan around it; do not edit another session's branch.

3. Dispatch sub-agents, one per workstream, each in its own git worktree and branch, each following CLAUDE.md (claim its row, draft PR titled with its ID, commits carry the ID, row set to done with a Log line when finished):
   - FEAT-65 tokens, flag and stone assets: start now.
   - FEAT-66 streetBands() in the worker with tests: start now, in parallel with FEAT-65.
   - FEAT-67 Stone, StreetBand and the VerdictPill fill variant: start when FEAT-65 has merged.
   - FEAT-68 RouteMoment, RouteUnfold and wiring into RoutePanel behind the v3 flag: start when FEAT-66 and FEAT-67 have merged.
   - FEAT-69 accessibility, visual checks and recordings: start when FEAT-68 is up for review.
   Give each sub-agent: its row, the handoff sections it needs (by heading), the Never list, and the checks it must pass. Tell each to stop and report to you rather than guess when the spec is silent.

4. Review every sub-agent PR yourself before it merges, against the handoff. Reject anything that:
   - shows a figure not taken from PlanResult;
   - changes behaviour with the flag off;
   - puts a control the user must tap at the top of the screen;
   - lets colour or the stone carry meaning alone;
   - uses 6 cm for the manual wheelchair kerb (it is 6 mm, D-054) or invented device names (use the 13 presets).
   Merge in the order 65, 66, 67, 68, 69, rebasing as needed. Take D-numbers and new IDs from main as late as possible.

5. When FEAT-68 works end to end, record the decisions in the handoff's "Decisions taken for this build" table as one decision with the next free D-number, in the FEAT-68 PR.

6. Finish with the design review: on the FEAT-64 PR post a 390 x 844 screen recording of fold and unfold for an Unsure route (Warrender Park Road to Grassmarket on the manual wheelchair preset, if the area data supports it), plus stills of both states beside the prototype's, light and dark, 320 px and 200% text. Ask Richard for a yes before the flag defaults on. Do not turn it on by default yourself.

Ground rules for you and every sub-agent:
- British English, short sentences, no em dashes, in code comments, UI copy and docs.
- Run pnpm typecheck, pnpm test, pnpm --filter @causeway/web typecheck, and for UI work pnpm web:build && pnpm a11y, before every push.
- The CI audit step (pnpm audit --audit-level high) already fails on main for existing dependencies. Say so once per PR; it is not this work's to fix.
- Update the Google Doc copy of the roadmap after roadmap changes if the Google Docs connector is available; otherwise say it is out of date.
- When something in the spec conflicts with the code or a decision, the decision and the code win. Note it in the tracking comment and ask Richard.

Report back to Richard at three points only: when all five workstreams are claimed and running, when FEAT-68 works end to end behind the flag, and at the design review.
```
