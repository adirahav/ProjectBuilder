# New Project Setup — Master Prompt

This file is a **master prompt template**, not project documentation. Copy this whole file into a new project's `development/` directory (not the repo root), along with every file the processing order below actually touches — `docs/PRD.md`, `.doc/*.md`, `.rule/*.md`, `.claude/skills/*/SKILL.md`, `AGENTS.md`, `agents/*/CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/*.js`, `.mcp.json`, `team-members.json`, `development/*` (except `preserveStaticTxt.js` — see Phase D), and `.plan/000-backlog.md` (emptied of tasks per its own note below) — then run it with an LLM coding agent (e.g. Claude Code) to bootstrap that project's whole configuration/orchestration layer, file by file, through guided Q&A. Do not copy files this prompt never mentions (`README.md`, `DEMO-GUIDE.md`, `HUMAN-TODO.md`, `package.json`/`package-lock.json`, `backend/`, `frontend/`) — those are the source reference project's own content/output, not template scaffolding, and the new project gets its own via the scaffolding tasks in Phase E's backlog.

It was extracted from a finished reference project (a tour/bus seat-booking app) whose config files encode a proven React + Node/Express + Mongoose + Zustand + Tailwind v4 architecture, plus a multi-agent build/QA/security orchestration workflow. Every templatized file still contains that project's working example, wrapped in `{{PLACEHOLDER}}` markers and an HTML comment block listing exactly what to fill in and what to ask the user. This prompt is the driver that walks through them.

---

## Approval mode
Before Part 1, ask: **"After each file is drafted, do you want to stop and approve it before I continue (gated), or should I keep going through all of them and let you review everything at the end (ungated)?"**
- **Gated (default if not asked/answered)** — the per-file approval gate described later in this document applies exactly as written: stop after every file, show it, wait for explicit approval or feedback before moving on.
- **Ungated** — skip the stop-and-wait step for every file. Still ask the section/file's own clarifying questions where the answer genuinely can't be inferred (a question with no reasonable default, e.g. "what's the product name" has no default to fall back on) — this toggle removes the *approval* wait, not the *content* questions. Where a file's own instructions offer a "Recommended" default (mirroring `AUTO_APPROVE_PLANS` in `development/dev-loop.js`, which does the same thing for plan review), take it automatically instead of stopping to ask. Still mark each file `drafted` then `approved` in `.setup-progress.md` as normal — "ungated" changes whether you wait on the human, not whether progress is tracked. At the very end, present a single summary of every file written so the user can review in bulk and flag anything to redo.

Record the answer at the top of `.setup-progress.md` alongside Part 1's answers (e.g. `Approval mode: gated` / `ungated`) so a resumed session in a later conversation doesn't have to ask again.

## Version control is optional
Nothing in this setup process or in `development/dev-loop.js` requires a git repository. `dev-loop.js` checks for `.git` at the repo root itself, once, at startup (`GIT_ENABLED`) — no question to ask here, no config flag to set. If it's missing, every git-specific concept (branch-per-task, auto-commit, merge approval) is skipped outright: agents write files straight to disk and the loop just moves on to the next backlog task. `orchestrator.config.json`'s `createBranchPerTask`/`autoMergeTasks` are simply never consulted in that case — leave them at their normal defaults regardless, don't special-case the worked example for a git-less project. If the user does want version control but hasn't run `git init` yet, that's on them to do before (or after) this setup — not something this process does automatically.

## Conversation language vs. file language
The Q&A itself can happen in whatever language the user writes in — follow their lead, switch naturally, don't force English on the conversation. But every file this process writes or edits — every template, every doc, every code comment, every commit-worthy artifact — is always written in English, regardless of what language the conversation was conducted in. This is independent of Part 1 Q5 (the product's own language/RTL-LTR settings, i.e. what end users of the *new app* will see) — that's a product decision; this is a rule about the setup process's own output.

## Resuming — read this before doing anything else
This process spans many files and is expected to be interrupted (closed mid-session, resumed days later, possibly in a fresh session with no memory of this conversation). Progress is tracked on disk, not in conversation memory — so the very first thing to do, before Part 1 or any file work, is:

1. **Check whether `.setup-progress.md` exists in the repo root.**
   - **If it doesn't exist**, this is a fresh run. Proceed to Part 1.
   - **If it exists**, this is a resume. Read it — it tells you Part 1's answers (recorded at the top) and the status of every file. Do not re-run Part 1's interview or re-open any file marked `approved`. Resume from the first file that is not `approved` (i.e. `pending` or `drafted`) and continue down the list in order. If a `drafted` file's draft is still in the file itself (Part 2's per-file work always writes the draft in place before asking for approval), read it and re-present it for approval rather than re-interviewing from scratch.

2. **Once Part 1 is confirmed** (fresh run only), create `.setup-progress.md` seeded with every file from Phases 0-E, each marked `pending`, before starting Part 2.

3. **Keep `.setup-progress.md` updated as you go** — every status change (pending → drafted → approved) is written to disk immediately, not just stated in the conversation, since the conversation may not survive to the next session.

`.setup-progress.md` format:
```markdown
# Setup Progress

Approval mode: gated | ungated

## Part 1 answers (confirmed YYYY-MM-DD)
1. App: ...
2. Roles: ...
... (one line per Part 1 question, so a resumed session never re-asks)

## Files
- [ ] .doc/product-definition.md — pending
- [ ] .doc/glossary.md — pending
... one line per file in Phases 0-E, in processing order, status one of: pending / drafted (awaiting approval) / approved
```

---

## Part 1 — Project Description

Before touching any template, collect a plain-language description of the new project from the user. Ask for (or infer from what they've already said, without re-asking what's already answered):

1. **What is the app?** One or two sentences — the product, who uses it, the core workflow.
2. **Who are the users/roles?** e.g. "one admin role + anonymous public users", or "buyer, seller, admin".
3. **What are the main domain entities?** e.g. "Product, Order, Cart" or "Tour, Bus, Seat".
4. **Is there a contested/limited resource** — something two actors could race to claim at the same instant (inventory, seats, slots, coupons, appointment times)? If yes, name it. If no, note that `seat-concurrency-layer` will be deleted rather than filled in.
5. **Language & direction** — primary language(s), RTL or LTR, single-language or translated.
6. **Platform targets** — web only, or also native (Capacitor/Android/iOS)?
7. **Backend shape** — fixed architecture, not a choice: this template always uses microservices with a dedicated `api-gateway` service in front of them, and the gateway is always the **only** service that verifies the JWT (gateway-centralized auth — downstream services trust an internal header the gateway attaches instead of each verifying the token themselves). Never offer a monolith option, never ask per-service-vs-gateway-centralized (both are decided), and never offer a single combined non-gateway service (a "the gateway plus one service that does everything else" shape is still a monolith wearing a gateway as a costume — it defeats the entire point of choosing microservices). Real decomposition means **at least two** non-gateway services split along actual domain boundaries. What's still a real question: **what are the other services (besides `api-gateway`), and what does each one own?** (e.g. "auth-service, content-service, progress-service" — one line per service, its data/domain) — if the user's answer only names one, push back and ask them to split it along real domain lines instead of accepting it.
8. **Icon library / design-system starting point**, if the user already knows. Ask this AFTER Q9 (design source, below) is resolved, not before — the correct fallback owner for "no preference, decide later" depends on that answer: if Q9 is "Designer agent," the fallback is the Designer agent, which owns exactly this decision as part of establishing the visual system (see its own Step 3) — never the Frontend Agent, which only builds against whatever system already exists. Only offer "let the Frontend Agent decide" as the fallback for the other three design-source answers, where there's no Designer agent to own it instead.
9. **Design source of truth.** Ask: "Do you have an AI-Studio export, a Figma file, want a Designer agent to establish one, or no design source yet?"
   - **AI-Studio export** — ask for the folder name (defaults to `raw_from_ai_studio/`, matching this template). `{{DESIGN_SOURCE}}` = that folder path. Delete `agents/designer/CLAUDE.md` (that agent only exists for the Designer-agent branch below).
   - **Figma** — this needs an MCP server, not just a placeholder. Walk the user through adding a `figma` entry to `.mcp.json` (same shape as the existing `linear` entry — see `.mcp.json`'s own instructions) with their Figma API key/file key, gitignored/env-sourced like the Linear key. `{{DESIGN_SOURCE}}` = "Figma (via MCP)"; note the file/frame naming convention if the user has one. Delete `agents/designer/CLAUDE.md` too.
   - **Designer agent** — a build-time agent (this template's multi-agent workflow is always in play — see Q10 below). The project doesn't have any mockups yet — `agents/designer/CLAUDE.md` generates them automatically, once, the first time `development/dev-loop.js` runs (before the first backlog task), producing self-contained HTML mockups under `docs/design/mockups/` exactly the way an AI-Studio export would look. `{{DESIGN_SOURCE}}` = `docs/design/mockups/` (same folder-shaped case as AI-Studio export above — nothing downstream needs to treat it differently). Keep `agents/designer/CLAUDE.md`; every other design-source branch should delete it.
     - If Designer agent was chosen, ask one more thing (as a structured choice, per "How to ask a question" below): **"After the Designer agent produces mockups, should the build stop and wait for you to approve them (or give feedback for a revision) before continuing, or should it accept whatever the Designer agent produces and move straight to building?"** This maps to `orchestrator.config.json`'s `autoApproveDesign` (see Phase D below) — `false` (always stop and ask) unless the user explicitly picks the no-wait option. It is a separate decision from the Approval mode question above (that one governs *this setup process's own* file drafts, not anything `development/dev-loop.js` does at build time) and from `autoApprovePlans`/`autoMergeTasks` (per-task plan/merge gates) — don't conflate the three.
   - **No design source** — the Frontend Agent designs the UI itself, per `.rule/style-rules.md` and the `css-layer`/`ui-component-layer` skills (brand colors, spacing scale, component patterns) rather than matching an external reference. `{{DESIGN_SOURCE}}` should be left unset — every `{{DESIGN_SOURCE}}` reference across templates (`docs/PRD.md`'s Design Source field and "design fidelity" AC, `agents/frontend/CLAUDE.md`'s Allowed Paths/workflow, `.rule/style-rules.md`) must be removed or reworded for this case, not filled with a placeholder value — don't leave a dangling reference to a design source that doesn't exist. Delete `agents/designer/CLAUDE.md` too, same as the other non-Designer-agent branches.
10. **Multi-agent build workflow** — fixed, not a choice: every project uses the Claude Code orchestrator/frontend/backend/QA/security agent split (`agents/*/CLAUDE.md` here), even a small one — there is no single-agent workflow to offer. Every "only if multi-agent (Q10)" instruction elsewhere in this document is therefore always in effect; it stays worded that way only so it's clear *why* that content is being filled in, not because it's ever actually conditional anymore. What's still a real question: what issue tracker (Linear, Jira, GitHub Issues, none) sequences the tickets?
11. **Database connection string** — **only if multi-agent** (Q10), since this is only consumed by `development/dev-loop.js`. Ask, as a choice question (per "How to ask a question" below): "MongoDB connection string — use a local default (`mongodb://localhost:27017/<project-db-name>`), skip for now (asked later during the build loop instead), or provide the real one now?"
    - **DEFAULT** — write `{"MONGODB_URI": "mongodb://localhost:27017/<project-db-name>"}` to `.setup-secrets.json` (create the file if it doesn't exist; merge if it does). Use a lowercased, hyphen-free slug of the project name for `<project-db-name>`.
    - **User provides a real value (the tool's free-text "Other" option)** — write `{"MONGODB_URI": "<the real value>"}` to `.setup-secrets.json` the same way.
    - **SKIP** — write nothing; `development/dev-loop.js`'s `ensureBackendEnv` will ask for it interactively later, during the build loop, exactly as it already does today.
    - **Never write this value into any other file** — not `docs/PRD.md`, not `.setup-progress.md`, not any committed template file. `.setup-secrets.json` is the only place a real secret value is allowed to land during setup, and it's gitignored specifically for this. `development/dev-loop.js` reads and consumes it (deleting the key once adopted into the real local secrets file) the first time it needs `MONGODB_URI` — don't ask the user to do anything further with this file themselves.

Do not interrogate the user with all of this as a single wall of questions if they've already described the project — extract what's already implied, and only ask about what's genuinely missing. **Ask exactly one question at a time — never bundle two or more into a single turn, throughout this entire document, not just here.** See "How to ask a question" below for the required format.

Once you have enough of the picture, summarize it back in 3-5 bullet points and confirm before moving to Part 2.

## How to ask a question — applies everywhere in this document
Every question this process asks — in Part 1, in a Phase 0 interview, in a Phase A/B/C/D/E clarifying round — follows the same two rules, no exceptions:
1. **One question per turn.** Never ask two or more questions in the same message, even if they're related or short. Get an answer, then ask the next one. This applies even where earlier instructions in this document say "ask 2-4 questions at a time" or similar — those are superseded by this rule.
2. **Use a structured choice prompt for questions that genuinely have a small set of reasonable answers** (e.g. "Tailwind or SCSS?", "gated or ungated?", "DEFAULT / SKIP / provide your own"). If the running agent has a dedicated tool for this (e.g. Claude Code's `AskUserQuestion`), use it — note that such tools require real, meaningful options (typically 2-4), with free text as a fallback escape hatch alongside them, not as a mode of their own. **Genuinely open-ended questions with no natural set of options** (e.g. "what is the app?", "what's the product name?") do NOT belong in a choice prompt — forcing one into fake/placeholder options just to use the tool is worse than plain conversational text. Ask those as normal chat text.

This changes *how* every question in this document gets asked, not *what* gets asked or *when* — the question content, order, and phase sequencing described elsewhere are unaffected.

## Part 2 — Filling the Templates

Two different kinds of template live in this repo, and they're filled differently:

- **Fill-in-the-blank templates** (`.rule/*.md`, `.claude/skills/*/SKILL.md`, `agents/*/CLAUDE.md`, `AGENTS.md`): each contains a working example from the source reference project with `{{PLACEHOLDER}}` markers wherever project-specific content belongs, plus an HTML comment block listing those placeholders and 1-2 example clarifying questions. You *adapt* the existing worked example.
- **Question-driven templates** (`docs/PRD.md`, `.doc/architecture.md`, `.doc/glossary.md`, `.doc/product-definition.md`): these hold the product's actual substance, which can't be adapted from the reference project's seat-booking domain — it has to be authored fresh. Each section is an instruction block (interview questions + a note on the reference file's depth/tone) rather than a worked example. You *interview the user and write the section from scratch*, then delete the instruction block.

### Processing order
Fill templates in this order, across five phases. Later files reference earlier ones (`@other-file` links, or the same placeholder/terminology vocabulary), so filling in dependency order avoids re-deriving the same facts twice or introducing inconsistent terms.

**Phase 0 — `docs/PRD.md` + `.doc/*.md` (question-driven; the product's actual content, everything else is scaffolding around it):**
1. `.doc/product-definition.md` — vision, users, scope, constraints (drives everything below)
2. `.doc/glossary.md` — canonical terms for every entity/role/action/status decided in product-definition.md
3. `.doc/architecture.md` — service boundaries, data flow, auth model, using glossary.md's terms throughout
4. `docs/PRD.md` — screens, functional requirements, acceptance criteria; the most concrete/UI-facing of the four, written last so it can lean on the other three rather than re-deciding things

**Phase A — `.rule/*.md` (foundational conventions, no cross-file dependencies on skills/agents):**
5. `naming-rules` — canonical entity/action terms (must match Phase 0's glossary.md exactly)
6. `database-rules` — schema, RBAC, contested-entity status rules
7. `coding-rules`, `error-handling-rules`, `style-rules`, `ui-rules`, `testing-rules`, `versioning-rules`, `planning-rules` — any order, each is largely self-contained

**Phase B — `.claude/skills/*/SKILL.md` (architecture layers — same order as before):**
8. `app-layer` — roles, routes, auth model (drives almost everything else)
9. `api-layer` — backend services, domain services, error codes
10. `backend-service-layer` — service topology, models list
11. `mongoose-models-layer` — schema definitions, soft-delete, indexes
12. `jwt-middleware-layer` — token shape, issuing/validating services, and (if a gateway exists, Q7) which auth model — per-service or gateway-centralized; delete whichever model's section doesn't apply
13. `seat-concurrency-layer` — **only if a contested resource exists** (Part 1, Q4). If not, delete this file (`.claude/skills/seat-concurrency-layer/`) and remove its `@seat-concurrency-layer/SKILL.md` references from `backend-service-layer`, `mongoose-models-layer`, and `.rule/database-rules.md` (Phase A, item 6) — grep for `seat-concurrency-layer` across the repo before finishing this item to catch any reference these three don't cover.
14. `service-layer` — frontend service files per entity
15. `state-management-layer` — Zustand slices per feature
16. `page-layer` — guarded vs. unguarded routes, page patterns
17. `ui-component-layer` — icon library, i18n strategy, complex-component exceptions
18. `css-layer` — RTL/LTR, spatial-component exceptions
19. `accessibility-layer` — language, multi-state entities, key forms
20. `native-navigation-layer` — **only if targeting native (Capacitor/Android/iOS)** (Part 1, Q6). If web-only, delete this file.

**Phase C — agent orchestration (always in scope — Part 1, Q10 — every project is multi-agent):**
21. `AGENTS.md` (root) — near-generic pointer file; confirm directory names match, fill quickly
22. `agents/backend/CLAUDE.md` — service list, model fields, contested-entity action table, gateway proxy setup if applicable
22b. `agents/designer/CLAUDE.md` — **only if the design source (Q9) is "Designer agent"**; delete this file for every other design-source answer. Fill `{{KEY_SCREENS}}` once `docs/PRD.md` exists (or leave it for the agent to choose itself on its first real run — see its own TEMPLATE comment block).
23. `agents/frontend/CLAUDE.md` — design source, stack, native flag, deploy-gateway wiring if applicable
24. `agents/qa/CLAUDE.md` — service list, acceptance criteria from docs/PRD.md, contested-entity concurrency check if applicable
25. `agents/orchestrator/CLAUDE.md` — ticketing system, ticket sequencing, agent launch commands
26. `agents/security/CLAUDE.md` — checklist adapted to the real services/contested entity/gateway

### Adapting, not just filling
The worked example in each template is a starting point, not a contract. If the user's Part 1 answers imply a section, a role, a layer, or a whole file isn't needed — say so, propose removing or restructuring it, and confirm before deleting, the same way conditional deletes (seat-concurrency-layer, native-navigation-layer, agents/) already work. Conversely, if the new project needs something no template covers, add a new section or file in the same style rather than forcing the domain into the template's existing shape. Treat every file this way, not only the ones explicitly marked conditional — run this as an ongoing dialogue (one question at a time, per "How to ask a question" above; confirm before structural changes), not a one-pass mechanical substitution.

**Phase D — tooling (`.claude/hooks/*.js`, `.claude/settings.json`, `.mcp.json`, `development/*`):**
27. `.claude/settings.json` — generic as-is; only touch if hook filenames change.
28. `.claude/hooks/block-secret-file-access.js`, `block-destructive-bash.js` — generic as-is, no project-specific content, don't touch.
29. `.claude/hooks/enforce-agent-boundaries.js` — **only if multi-agent** (Q9); delete otherwise. If kept, `ALLOWED_WRITE_PREFIXES` must match the real agent roles and real backend directory layout (one prefix per microservice if Q7 says multiple services). See its own TEMPLATE comment block.
30. `.mcp.json` — the `linear` server block is **only relevant if Linear is the tracker** (Q9); otherwise delete it. Add a `figma` server block **only if Figma is the design source** (Q9's design-source branch) — same shape as `linear`, with the user's Figma API/file key. Never hardcode either key — they're secrets, not template values; use an env var or a gitignored local copy.
31. `development/dev-loop.js` — **only if multi-agent** (Q9); delete otherwise. This is executable code, not prose, so it's a proportional rewrite, not a placeholder substitution — see its own TEMPLATE comment block for exactly which sections scale with the real service list and tracker choice.
32. `development/hooks-checker.js` — **only if multi-agent** (Q9); delete otherwise. Generic hook-enforcement test harness, no domain-specific content to fill.
33. `development/trace-agent.js`, `development/install-deps.ts` — generic as-is, no project-specific content; `install-deps.ts` encodes its own stack opinions (Vite/react-ts, Zustand, Capacitor+Android, Express+MongoDB driver) independent of this template's own stack choices — leave alone unless the user specifically wants this bootstrap script kept in sync with Part 1's stack answers.
34. `development/preserveStaticTxt.js` — **not a template at all.** It hardcodes paths into an unrelated external project (`../../../NodeProjects/diraleashkaa-backend/...`), not the reference project this template is built from. Flag it to the user and ask whether to delete it before treating this repo as a template source — do not adapt or copy it forward.
35. `team-members.json` — **only if Linear is the tracker** (Q9); otherwise delete it (and its `LINEAR_TEAM_FILE` reference in `.mcp.json`). If kept, every `{{..._LINEAR_USER_ID}}` and `{{OWNER_NAME}}` placeholder must become the new project's real Linear user IDs — ask the user for each, or ask them to fill this file locally themselves since these are their real Linear account identifiers, not values to invent. `dev-loop.js`'s ticket-assignment code treats any non-empty value here as a real ID to assign issues to, so a leftover `{{PLACEHOLDER}}` will fail at Linear API call time, not silently no-op.
36. `backend/.env.shared.example` — **only if multi-agent** (Q9, since `development/dev-loop.js`'s `ensureBackendEnv` is what reads/writes the matching `backend/.env.shared` at runtime). Reference for the values shared identically across every backend service (matching `dev-loop.js`'s `ALWAYS_CONFIRM_KEY_PATTERN` — connection strings, secrets, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`). Per-service cosmetic values (each service's own `PORT`, etc.) belong in that service's own `.env.example` written by the Backend Agent, never here — don't add per-service keys to this file.
37. `orchestrator.config.json` (root) — **only if multi-agent** (Q9, since `development/dev-loop.js` is what reads it); otherwise skip. Unlike every other Phase D file, **this one is generated, not adapted from a worked example** — it doesn't exist in this template repo at all until setup creates it. Write it fresh, after the Approval mode question (near the top of this file) and Part 1 Q9 are both answered:
    ```json
    {
      "autoApprovePlans": false,
      "autoMergeTasks": false,
      "autoApproveDesign": false,
      "createBranchPerTask": true,
      "backendServices": ["api-gateway", "example-service"],
      "linearEnabled": true,
      "designSource": "NONE",
      "expectedLlmProvider": "claude",
      "expectedLlmAccount": "adi@emotionlogic.ai",
      "expectedClaudeAccount": "adi@emotionlogic.ai"
    }
    ```
    - `autoApprovePlans` — `true` if Approval mode was answered "ungated" (see that section), `false` if "gated". `development/dev-loop.js` also self-adopts this from `.setup-progress.md` on its own first run if this key is still `false`/missing, so getting it right here isn't strictly load-bearing — but don't leave it unset if the answer is already known.
    - `autoMergeTasks` — deliberately **separate** from `autoApprovePlans`, not derived from Approval mode. Always defaults to `false` (always ask before merging a finished task branch into the base branch) unless the user explicitly asks for automatic merging during setup — merging into the branch the human is actually sitting on is a distinct, higher-stakes decision than plan/feature approval, so it never inherits "ungated" implicitly.
    - `autoApproveDesign` — **only meaningful if `designSource` is `"DESIGNER_AGENT"`**; otherwise leave it `false`, it's simply never read. Set from the sub-question asked right after "Designer agent" is chosen in Q9 above — `false` (always stop and wait for terminal APPROVED-or-feedback) unless the user explicitly asked for no-wait. Also deliberately separate from `autoApprovePlans`/`autoMergeTasks` — approving a visual system every future screen has to match is its own decision, not implied by either of the other two.
    - `createBranchPerTask` — `true` (per-task branch, merged back only after approval — the safer default) unless the user explicitly wants every task committed straight onto the base branch instead (no per-task branch, no merge-approval step — useful for a batch of small/related tasks where per-task branching is more friction than value). This used to be asked fresh on every single `dev-loop.js` run instead of living here — that turned out to be more annoying in practice (the same question, every run) than useful, so it's now a normal setup-time setting like the others. Only ask about it during setup if the user brings it up; otherwise leave the default.
    - `backendServices` — **only if multi-agent with a backend** (Q9); the exact list of backend service directory names this project will have under `backend/`, matching `agents/backend/CLAUDE.md`'s own `## Services` list exactly (same names, same order doesn't matter). This is the single source of truth `development/dev-loop.js`'s `discoverBackendServices()` reads to know which Backend Agent(s) to launch for a scaffold task **before that service's directory exists on disk yet** — it used to instead scrape service names out of the backlog's own `scope:` fields, which broke for real once that free-text field got corrupted (a garbled line invented a fake service and put a bogus node on the dashboard). Get every service name here right at setup time and this class of bug can't happen — leave `[]` (or omit) for a single-backend or no-backend project, where directory-scanning alone is already unambiguous.
    - `linearEnabled` — `true`/`false` matching whether Linear is the issue tracker (Q9).
    - `designSource` — `"FIGMA"` / `"AISTUDIO"` / `"DESIGNER_AGENT"` / `"NONE"` matching Q9's design-source branch exactly, not left as a placeholder. `"DESIGNER_AGENT"` is what makes `development/dev-loop.js` actually launch `agents/designer/CLAUDE.md` once, automatically, before the first backlog task — get this value right or that step silently never runs.
    - `expectedLlmProvider` / `expectedLlmAccount` — which CLI (`"claude"` or `"cursor"`) and which login email this project's agents should run under. `development/dev-loop.js` re-checks both against whoever is actually logged in on every run (`checkLlmAccount()`) and blocks (with an override prompt) on a mismatch. If both CLIs are logged in and nothing is pinned yet, it asks which to use, then writes these fields. `expectedClaudeAccount` is a legacy alias still read as provider=`claude`; new projects should set the two `expectedLlm*` keys and only keep `expectedClaudeAccount` when the provider is Claude.
    This file is plain, committed JSON — deliberately not an env file, since none of these values are secrets or read by the product's own runtime code, only by the orchestrator script.

### On `docs/api-contract/*.yaml`
These files are not part of the template scaffolding at all — no phase above touches them. They're a normal **build artifact**: per `agents/frontend/CLAUDE.md`, the Frontend Agent writes one `docs/api-contract/api-contract.<service-name>.yaml` per service as a byproduct of implementing each real feature ticket, only for the service(s) that ticket touches. Once `agents/frontend/CLAUDE.md` (Phase C) is correctly filled with the new project's real service names, the existing reference-project contract files under `docs/api-contract/` can simply be deleted — they will be regenerated automatically the first time a ticket reaches the Frontend Agent. Do not attempt to pre-generate them during setup.

**Phase E — `.plan/000-backlog.md` (always in scope — `development/dev-loop.js` is what consumes this file):**
38. Generate this file **last**, after every Phase 0-D file is filled — it depends on real screens (`docs/PRD.md`), real services (Q7), and real agent role keys (`development/dev-loop.js`'s `ALL_AGENT_KEYS`, Phase D item 31).

### How to build `.plan/000-backlog.md`
Each line is one task, in the exact format already used by `development/dev-loop.js`'s parser (`getNextBacklogTask`):
```
- [ ] <Title> | <field>: <value> | scope: <agentKey1,agentKey2,...>
```
- `<Title>` is always the first `|`-separated part, plain text.
- Recognized optional fields: `figma: <url>` (only meaningful if Figma is the design source), `scope: <comma-separated agent keys>` or `scope: none`, and `url: <path>` (e.g. `/signup`) — the route `scripts/dev-loop.js` opens in the human's browser once this task finishes, so they see the result without switching windows. Add `url:` to any task that produces a visitable page/screen; omit it for scaffolding/infra tasks with nothing to look at. No auto-login is attempted — if the route requires auth, the human logs in manually when the browser opens. Omitting `scope:` entirely means "unknown scope — run every agent," which is only appropriate for early groundwork tasks, not real feature tasks.
- Every key in `scope:` must be one of the real agent keys defined in `development/dev-loop.js`'s `ALL_AGENT_KEYS`/`AGENT_IDENTITY` for this project (Phase D item 31) — not the reference project's own keys (`tour-service`, `user-management-service`, ...) unless the new project happens to reuse them.

Build the list in this order, mirroring the worked example already in this file (read it before writing, then replace it):
1. **Scaffolding tasks first** — one line per setup step (create the frontend project, install root/frontend dependencies, create each backend service's `package.json`), scoped to whichever agents actually do that work (or `scope: none` for a step no agent needs to touch, like a plain `npm install`).
2. **One task per screen/component from `docs/PRD.md`'s Screens section** — same granularity as the reference (one line per standalone page/component/modal, not one line per whole screen if it bundles several reusable pieces). If there's a filesystem design source, reference the matching file under it (e.g. `{{DESIGN_SOURCE}}/pages/<Screen>.tsx`); omit that reference entirely if the design source is Figma-via-MCP or doesn't exist. For any task that results in a visitable route, add `url: <path>` matching that screen's actual frontend route (from `app-layer`'s route list) — a modal or sub-component with no route of its own doesn't need one.
3. **`scope:` per task reflects real judgment, not a default list** — a pure-UI task is `frontend,qa`; a task whose screen reads/writes a specific backend service adds that service's key; add `security` only where the screen touches auth, PII, or the contested entity (Part 1 Q4) — mirror the reasoning visible in the worked example (e.g. the passenger-facing seat screen adds the service owning the contested entity plus `security`; a pure admin-management list screen usually doesn't need `security` unless it exposes PII).

This file is deliberately the **last** thing the setup process produces. Present it to the user for review once generated — they're expected to prune, reorder, or add tasks by hand before `development/dev-loop.js` is run, exactly as described at the top of the conversation that produced this file (the human curates the queue; `dev-loop.js` executes it end-to-end, one task at a time, gated by plan approval and QA/security review per task).

### How to fill each one

**Phase 0 (question-driven) files:**
1. **Read the file.** Note which sections still have an instruction block (HTML comment) vs. which are already written.
2. **Interview the user**, one question at a time (see "How to ask a question" above) from the questions listed in that section's instruction block, using the noted reference depth/tone as a target, not a script to imitate word-for-word.
3. **Write the section in prose/tables**, replacing the instruction block entirely.
4. **Approval gate (mandatory, every file — see below).**
5. **Move to the next section**, then the next file, in the order listed above.

**Phase A/B/C/D/E (fill-in-the-blank) files:**
1. **Read the file.** Read its HTML comment block and note which placeholders are still unanswered from Part 1, from Phase 0's docs, or from an earlier file this session.
2. **Ask only what's missing.** Use the file's own suggested clarifying questions as a starting point, but don't re-ask anything already established. Ask one question at a time (see "How to ask a question" above), not a giant form.
3. **Rewrite the file in place**, replacing every `{{PLACEHOLDER}}` with real project content, adapting the worked example(s) to the new domain (rename entities, adjust routes, rewrite code samples to use real field/entity names — don't leave the reference project's example values in place).
4. **Delete the HTML comment block** once the file is filled — it was setup-time-only guidance, not documentation for the finished project.
5. **Approval gate (mandatory, every file — see below).**
6. **Move to the next file.** Briefly state which file you just finished and what's next, so the user can follow progress.

### Approval gate — every file (gated mode) or a single end-of-run summary (ungated mode)
Which of these two applies was decided once, up front, by the **Approval mode** question above — check `.setup-progress.md` before assuming; don't ask again mid-run.

**Gated (default):** Once a file is drafted, mark it `drafted` in `.setup-progress.md` immediately, then stop and ask the user explicitly: **"Here's `<file>` — approve as-is, or any notes/changes?"** Show enough of the actual content (not just a summary) that they can judge it — the whole file if short, the changed sections if long.
- **Do not touch the next file until this one is approved.** If they give feedback, revise the file and ask again — same gate, same file.
- Once approved, mark it `approved` in `.setup-progress.md` on disk before moving on. This is what makes resuming safe: an approved file is never reopened or re-interviewed in a later session, only a `drafted` or `pending` one.
- This gate applies uniformly across all five phases, including Phase E's `.plan/000-backlog.md` — it isn't a special final review, it's the same per-file gate every other file already went through.

**Ungated:** Mark each file `drafted` then immediately `approved` in `.setup-progress.md` (no wait in between) and move straight to the next file — no per-file stop, no per-file question beyond what the section's own instructions genuinely require (no reasonable default). Once every file across all five phases is done, present one consolidated summary (file list + one-line description of what each contains) so the user can review everything in bulk and ask for changes to anything before the final "When finished" checks.

### Cross-file consistency
Keep terminology identical across every file — the same entity name, the same role names, the same status enum, the same service/port list — since these files cross-reference each other and repeat the same facts (e.g. `{{SERVICES_AND_PORTS}}` appears in `coding-rules`, `database-rules`, `testing-rules`, `versioning-rules`, and all four `agents/*/CLAUDE.md` files; the glossary's canonical terms must match `naming-rules.md` exactly). If a placeholder value or a naming decision changes mid-process (the user corrects an earlier answer), go back and update every already-filled file that used it, don't leave a stale value in one place.

### When finished
After all applicable files are filled:
- Confirm every conditionally-deleted file (`seat-concurrency-layer`, `native-navigation-layer`) was either filled in or removed, per Part 1's answers. `agents/`, `.claude/hooks/enforce-agent-boundaries.js`, and `development/dev-loop.js` are never conditionally deleted — every project keeps them (Q10 is fixed, not a choice).
- Confirm `.mcp.json` holds no real API key.
- Confirm no file still contains an unresolved `{{PLACEHOLDER}}` marker (Phases A/B/C/D/E) or an unresolved HTML instruction block (Phase 0).
- Confirm `.plan/000-backlog.md` (Phase E) was generated from the real Screens section and real agent/service keys, and approved per the gate above before the user runs `development/dev-loop.js`.
- Confirm every file in `.setup-progress.md` is marked `approved`.
- Delete `.setup-progress.md` — its job is done and it holds nothing worth keeping once every file is approved. **Do not delete this file** (`development/NEW-PROJECT-SETUP-PROMPT.md`) — keep it in the finished project as a record of how the project was bootstrapped, and in case a later file needs revisiting.
- Suggest the user run `/init` or review `CLAUDE.md` next, since the config now describes a real product and architecture the agent should follow going forward.
