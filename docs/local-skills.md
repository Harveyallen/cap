# Local Agent skills

CAP discovers `SKILL.md` files on the machine and overlays them onto the seed catalog so `cap search` / `cap add` / `cap use` can find them. Agent `tools/list` stays `cap.search` / `cap.add` / `cap.use`. Skill **bodies stay on disk**; search and default `use` return name, summary, and path only.

## Scan roots

Standard Agent skill layouts (no hardcoded skill names). Cursor plugin trees are walked deeper because `SKILL.md` sits under `plugins/cache/<marketplace>/<id>/<hash>/skills/<name>/`.

| Root | Agent |
|------|--------|
| `~/.claude/skills`, `~/.claude/plugins` | Claude Code |
| `~/.codex/skills` | Codex |
| `~/.cursor/skills`, `~/.cursor/skills-cursor`, `~/.cursor/plugins` | Cursor |
| `~/.agents/skills` | Shared |
| `<project>/.claude/skills` | Claude Code |
| `<project>/.codex/skills` | Codex |
| `<project>/.cursor/skills`, `<project>/.cursor/skills-cursor` | Cursor |
| `<project>/.agents/skills` | Shared |

Each root is walked for `*/SKILL.md` (or nested `**/SKILL.md`). Frontmatter `name` + `description` become the searchable identity. YAML folded descriptions (`>` / `|`) are flattened to one line.

CJK queries like `画架构图` / `架构图` match a skill only when its **name or description** talks about drawing diagrams (or already contains those characters). A nearby “architecture” skill is not enough: pstack `/architect` (types before code) and Matt’s `improve-codebase-architecture` stay findable by their own text, not as diagram hits.

Override roots in tests / programmatic calls with `skillRoots`, `userHome`, and `projectRoot`.

## When they are registered

- **Search** always overlays a live scan (no registry write). A fixture skill whose description mentions architecture diagrams is findable with `cap search "画架构图"`.
- **`cap setup`** and **`cap optimize --apply --yes`** persist an index in `$CAP_HOME/registry.json` `local_skills` (id, name, path). They do not rewrite skill files or dump bodies into Agent context.
- **`cap optimize`** (preview) lists `plan.skills.register` without writing.

`loadCatalog()` remains the seed file. `loadEffectiveCatalog()` is seed + overlay.

## Add / use

```bash
cap search "画架构图" --json
cap add skill.<slug> --json
cap use skill.<slug> --json
cap use skill.<slug> --input '{"include_body":true}' --json
```

`<slug>` comes from the skill folder or frontmatter name (for example `skill.system-blueprint`). Do not add a one-off catalog row for a single diagram skill.

Local skills are usable after search without a prior `add` (they are already on disk). First `use` also registers them in the Registry ledger (same as `cap.add`). `include_body: true` is the on-demand body; default `use` omits it. Seed catalog Skill providers that are not a local `SKILL.md` (for example `pdf.skill`) stay `connection_required`.

Capability ids are `skill.<folder-or-name-slug>`. Duplicate names collapse to the first scan hit.

## What is not injected

Inspect still prices only name + description as resident tokens. CAP does not copy skill text into `tools/list` or the default three-tool surface.
