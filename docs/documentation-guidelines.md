# Documentation Guidelines

This is the OMNIwx documentation rule set.

The goal is simple:

- keep important product and release docs in git
- keep private learning notes out of git by default

## What Belongs In Git

These docs should stay tracked:

- release notes
- release process docs
- architecture docs
- user-facing feature guides
- publishable policy/support docs
- builder docs that are useful across sessions or devices

Examples in this repo:

- [google-play-closed-testing-release-notes.md](C:/Users/andym_au640pp/weather-app/docs/google-play-closed-testing-release-notes.md)
- [full-release-path.md](C:/Users/andym_au640pp/weather-app/docs/full-release-path.md)
- [how-omniwx-works.md](C:/Users/andym_au640pp/weather-app/docs/how-omniwx-works.md)
- [omniwx-feature-guide.md](C:/Users/andym_au640pp/weather-app/docs/omniwx-feature-guide.md)

## What Should Stay Out Of Git

Private or temporary docs should not be committed by default.

Use these ignored folders for that work:

- `docs/private/`
- `docs/local/`
- `docs/drafts/private/`

Good examples:

- personal learning notes
- rough scratch writeups
- prompts to yourself
- temporary research dumps
- half-formed drafts not ready for the repo

## Best Practices

- If a doc is only useful to you personally, put it in an ignored docs folder first.
- If a doc explains the product, release flow, architecture, or tester expectations, keep it tracked.
- If a private note becomes genuinely reusable, promote it into a tracked doc later.
- Do not hide release notes or process docs in ignored folders.
- Prefer refining a tracked doc over creating duplicate versions of the same process in multiple places.

## Safe Workflow

1. Write personal learning notes in `docs/private/` or `docs/local/`.
2. Distill anything durable into a clean tracked doc under `docs/`.
3. Only commit the cleaned-up version.

## Rule Of Thumb

Ask one question:

- "Would future me on another machine, or a collaborator, need this?"

If yes, track it.

If no, keep it in an ignored docs folder.
