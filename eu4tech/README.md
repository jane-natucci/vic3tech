# EU4 tech

How Europa Universalis IV's land units and technology evolve, read straight from the game files:

- **Countries:** a list on the left with every country at each of the game's start dates (1444 to 1792): ruler and heir with their adm/dip/mil, government, religion, culture, provinces and total base tax / production / manpower, trade goods and religions by development, historical rivals and friends, alliances, subjects and overlord, **national ideas** and **mission trees**.
- **Military units:** the strongest infantry, cavalry and artillery each unit group can recruit at every mil tech level (total pips, groups side by side), what mil tech multiplies (fire/shock damage, morale, tactics, combat width), and every unit of a group with its six pips on the mil tech axis.
- **Adm / Dip / Mil tech:** each effect's value at every level, by the year the game expects it, plus what each level unlocks.

Live at https://eu4tech.jane.berlin/ (the cog button on eu4.jane.berlin leads here; the old address https://vic3tech.jane.berlin/eu4/ redirects). `deploy.sh` uploads the page on every deploy, and `data.json` only from a full local deploy, since only a machine with EU4 installed can generate it. It shares no code with the Vic3 page, so it can move to its own repo as a folder.

```bash
ruby eu4tech/extract_countries.rb   # countries.json, missions.json, ideas.json and flags/ (also gitignored)
ruby eu4tech/extract.rb       # writes eu4tech/data.json from the default Steam install (gitignored: Paradox's data)
bundle exec ruby -run -e httpd . -p 8000   # then open http://localhost:8000/eu4tech/
```

`extract.rb` takes the game path as its first argument if EU4 is installed elsewhere. Re-run it after a game patch.

## How the numbers work

- Pips come from `common/units/*.txt`; a unit is available from the mil tech level whose `enable = <unit>` names it. Artillery has no unit group: every group shares it.
- Tech effects add up level by level, on top of the game's base values (`BASE_COMBAT_WIDTH` in `defines.lua`, `base_values` in `static_modifiers`). `allowed_idea_groups` is the exception: each level sets it outright.
- "Strongest" means most total pips. That's a simplification: which pips matter depends on the phase (fire vs shock) and on what you fight.

## How the country data works

- Provinces: `history/provinces` gives each province's starting values and dated changes; the owner, base tax / production / manpower and trade good at a bookmark date are the initial values with every change up to that date applied. A country exists at a date if it owns a province.
- Countries: `history/countries` and `history/diplomacy` the same way (government, religion, ruler and heir from the latest block up to the date; ties that are active on the date).
- Missions: series in `missions/` are attached to the countries their `potential` names, evaluating the DLC conditions as a player who owns every DLC; a country's series are merged into one tree per slot. Conditions the extractor can't evaluate (map settings, flags) are treated as unknown, so alternative branches all appear.
- National ideas come from `common/ideas`. EU4 has no file saying which modifiers are percentages, so that is a best guess.
- Armies and fleets are left out on purpose: a campaign builds starting forces from each country's force limit (`STARTING_ARMY_SIZE` in `defines.lua`), not from a file.
- Text with game variables (`[Root.GetName]`) has the variable removed, so a few mission texts read oddly.

## Later

- Load a melted save (pdx.tools melts EU4 too): each country's mil tech, unit group, the units it fields vs the best it could have.
