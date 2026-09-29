# Vic3 Tech Tree

**https://vic3tech.jane.berlin** — compare every Victoria 3 country at the 1836 start: the full tech tree with prerequisite arrows, starting armies and navies, every unit, ship and mobilization option by era, and each country's buildings and resources.

Everything is read straight from the game's own files, not transcribed by hand.

## How it works

- `index.html` — the whole site: one static page, plain HTML/CSS/JS, no build step or framework.
- `extract.rb` — reads a local Victoria 3 install and writes `vic3/data.json`, `vic3/economy.json` and the images the page uses. Plain Ruby; needs [ImageMagick](https://imagemagick.org) (`magick`) for the images.
- `deploy.sh` — uploads the page and the generated files to S3, served through CloudFront. See [Deploying](#deploying).

The generated files come from Paradox's game data, so they're **not in this repo**. Run the extractor against your own install to get them.

## Loading a save (prototype, `save-loading` branch)

Drop a *melted* save onto the page (or use "Load a melted save…") and every tab shows that campaign instead of 1836. Vic3 saves are binary by default; melt them first on [pdx.tools](https://pdx.tools) (open the save, then "Melt"). `vic3/save-worker.js` reads the file in your browser (a 361 MB save takes about 2 seconds), so nothing is uploaded.

## Running it locally

```bash
ruby extract.rb                                   # default Steam path on macOS
ruby extract.rb "/path/to/Victoria 3/game"        # or point it at your install
bundle install && bundle exec ruby -run -e httpd . -p 8000   # then open http://localhost:8000
```

Re-run `extract.rb` after a game patch. The page shows which game version its data came from in the footer.

## Deploying

Two kinds of deploy, because the game data can only be generated where Victoria 3 is installed:

- **Code** (`index.html` and our own files in `vic3/`): deployed automatically by GitHub Actions on every push to `main` (`./deploy.sh --code-only`). It reuses the game data already on S3.
- **Game data** (after a game patch, or anything `extract.rb` produces): run locally on a machine with Victoria 3 installed:

  ```bash
  ruby extract.rb && ./deploy.sh
  ```

> [!IMPORTANT]
> **The very first deploy must be a full local one** (`ruby extract.rb && ./deploy.sh`). CI has no game data to upload, so until S3 has a `vic3/data.json`, the GitHub Action stops with an error saying so. The same applies to a fresh bucket.

Local deploys use the `personal` AWS profile by default (`AWS_PROFILE` overrides it). CI logs into AWS through GitHub's OIDC, into a role that can only write to this site's bucket (`terraform-cloud`: `main/vic3tech_jane_berlin.tf`), so no AWS keys are stored in this repo.

## Known approximations

- States split between countries: arable land and resource caps are divided by each owner's share of the state's provinces. The game uses a slightly different internal rule, so these can be off by a few percent (whole states match exactly).
- Starting barracks aren't in the game's building history (they come from the army setup), so military buildings are left out of the economy view.
- Flags are modern emoji, only there to tell countries apart.

## Credits

Unofficial fan project. Victoria 3 and all its data, art and text are © Paradox Interactive; this project isn't affiliated with or endorsed by Paradox. The code in this repository is MIT-licensed.
