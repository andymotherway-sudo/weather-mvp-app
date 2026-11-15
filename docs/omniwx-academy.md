# OMNIwx Academy: learn your own codebase

This is a repository-aware, read-only coding tutor, not a feature of the consumer weather app. It is designed for GitHub Copilot custom-agent environments that recognize `.github/agents/*.agent.md`.

## Start

1. Open this repository in a Copilot-capable editor or GitHub coding-agent interface that supports custom agents.
2. Select **OMNIwx Academy** from the custom-agent picker (availability and supported tools depend on your Copilot environment).
3. Start with: `/start` or `Explain app/_layout.tsx, then quiz me one question at a time.`

The leading slash phrases are **conversation shortcuts**, not shell commands. If your client does not expose the custom agent, paste `.github/agents/omniwx-academy.agent.md` into an AI chat that can read the repository and ask it to follow the instructions. This fallback may not preserve progress across chats.

## What a typical 15-minute session looks like

- 3 minutes: a grounded explanation of a real file.
- 4 minutes: follow the function calls to the next layer.
- 5 minutes: answer three questions and discuss mistakes.
- 3 minutes: trace an actual bug or predict a safe code change.

## Suggested prompts

- `/trace When I switch my active city, how does Land get updated without showing the previous city's forecast?`
- `/trace When I press Play on radar, how does the next frame get selected and rendered?`
- `/lesson What exactly does a React hook do in OMNIwx?`
- `/quiz Cloudflare Worker caching medium 5`
- `/architecture MRMS vs RainViewer vs IEM, including publishers, R2 and cost safety`
- `/review app/_layout.tsx`
- `/debug Why might map camera or overlays reset on a re-render?`
- `/challenge If I add a new hourly metric to Space, what paths would need reviewing?`

## Progress

At the end of each session, ask `/progress` and copy the small progress note to your next chat. The agent does **not** automatically save grades to GitHub, your device, or another database. Do not store personal progress or answers in the repo without explicitly asking for that change.

## Evidence and guardrails

- Current code beats stale documentation; cite paths and identifiers.
- Keep learning separate from writing or running production code.
- Never expose secrets or access tokens.
- Be especially careful with radar writer operations, Cloud Scheduler, Cloud Run capacity, R2 storage, Play deployment and subscription changes.
- For live operational status, consult `docs/current-status.md` and the relevant runbooks, rather than old lesson notes.
