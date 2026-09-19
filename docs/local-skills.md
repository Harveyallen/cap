# Local Agent skills

CAP discovers `SKILL.md` files on the machine and overlays them onto the seed catalog so `cap search` / `cap add` / `cap use` can find them. Agent `tools/list` stays `cap.search` / `cap.add` / `cap.use`. Skill **bodies stay on disk**; search and default `use` return name, summary, and path only.

## Scan roots

Same layouts inspect already used, plus Cursor and user-level shared dirs:

| Root | Agent |
|------|--------|
| `~/.claude/skills` | Claude Code |
| `~/.codex/skills` | Codex |
| `~/.cursor/skills` | Cursor |
| `~/.agents/skills` | Shared |
| `<project>/.claude/skills` | Claude Code |
| `<project>/.codex/skills` | Codex |
| `<project>/.cursor/skills` | Cursor |
| `<project>/.agents/skills` | Shared |

Each root is walked a few levels for `*/SKILL.md` (or nested `**/SKILL.md`). Frontmatter `name` + `description` become the searchable identity. YAML folded descriptions (`>` / `|`) are flattened to one line.

Override roots in tests / programmatic calls with `skillRoots`, `userHome`, and `projectRoot`.

## When they are registered

- **Search** always overlays a live scan (no registry write). A fixture skill whose description mentions architecture diagrams is findable with `cap search "画架构图"`.
- **`cap setup`** and **`cap optimize --apply --yes`** persist an index in `$CAP_HOME/registry.json` `local_skills` (id, name, path). They do not rewrite skill files or dump bodies into Agent context.
- **`cap optimize`** (preview) lists `plan.skills.register` without writing.

`loadCatalog()` remains the seed file. `loadEffectiveCatalog()` is seed + overlay.

## Add / use

```bash
cap search "画架构图" --json
cap add skill.draw-architecture --json
cap use skill.draw-architecture --json
cap use skill.draw-architecture --input '{"include_body":true}' --json
```

Local skills are usable after search without a prior `add` (they are already on disk). `include_body: true` is the on-demand body; default `use` omits it. Seed catalog Skill providers that are not a local `SKILL.md` (for example `pdf.skill`) stay `connection_required`.

Capability ids are `skill.<folder-or-name-slug>`. Duplicate names collapse to the first scan hit.

## What is not injected

Inspect still prices only name + description as resident tokens. CAP does not copy skill text into `tools/list` or the default three-tool surface.
