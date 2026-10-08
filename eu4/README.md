# EU4 tech

How Europa Universalis IV's land units and technology evolve, read straight from the game files:

- **Military units:** the strongest infantry, cavalry and artillery each unit group can recruit at every mil tech level (total pips, groups side by side), what mil tech multiplies (fire/shock damage, morale, tactics, combat width), and every unit of a group with its six pips on the mil tech axis.
- **Adm / Dip / Mil tech:** each effect's value at every level, by the year the game expects it, plus what each level unlocks.

Live at https://vic3tech.jane.berlin/eu4/ (linked from the Vic3 page's footer). `deploy.sh` uploads the page on every deploy, and `data.json` only from a full local deploy, since only a machine with EU4 installed can generate it. It shares no code with the Vic3 page, so it can move to another app as a folder.

```bash
ruby eu4/extract.rb       # writes eu4/data.json from the default Steam install (gitignored: Paradox's data)
bundle exec ruby -run -e httpd . -p 8000   # then open http://localhost:8000/eu4/
```

`extract.rb` takes the game path as its first argument if EU4 is installed elsewhere. Re-run it after a game patch.

## How the numbers work

- Pips come from `common/units/*.txt`; a unit is available from the mil tech level whose `enable = <unit>` names it. Artillery has no unit group: every group shares it.
- Tech effects add up level by level, on top of the game's base values (`BASE_COMBAT_WIDTH` in `defines.lua`, `base_values` in `static_modifiers`). `allowed_idea_groups` is the exception: each level sets it outright.
- "Strongest" means most total pips. That's a simplification: which pips matter depends on the phase (fire vs shock) and on what you fight.

## Later

- Load a melted save (pdx.tools melts EU4 too): each country's mil tech, unit group, the units it fields vs the best it could have.
