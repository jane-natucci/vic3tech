#!/usr/bin/env bash
# Uploads the site to S3, where CloudFront serves it as vic3tech.jane.berlin.
#
#   ./deploy.sh              full deploy: page, our own files and the game
#                            data in vic3/ (run extract.rb first; needs a
#                            machine with Victoria 3 installed)
#   ./deploy.sh --code-only  page and our own files only, reusing the game
#                            data already on S3 -- what CI runs on every push
#                            to main. The very first deploy has to be a full
#                            one, since CI can't generate the data.
#
# Every /vic3/ URL carries ?v=<version>, which CloudFront caches /vic3/* on
# for a year. The version hashes data.json plus our own tracked files in
# vic3/ (e.g. save-worker.js), so a new extraction or a change to any of
# those files busts the cache. index.html is sent with no-cache, so a deploy
# shows up immediately.
set -euo pipefail
cd "$(dirname "$0")"

bucket="${VIC3_BUCKET:-vic3tech.jane.berlin}"
# Locally, use the named profile; in CI, credentials come from the OIDC role.
[ -n "${CI:-}" ] || export AWS_PROFILE="${AWS_PROFILE:-personal}"

md5() { if command -v md5sum >/dev/null; then md5sum | cut -d' ' -f1; else command md5 -q; fi; }
tracked=$(git ls-files vic3)   # our own files in vic3/ (the rest is generated)
tmp="$(mktemp -d)"

if [ "${1:-}" = "--code-only" ]; then
  aws s3 cp "s3://${bucket}/vic3/data.json" "$tmp/data.json" --only-show-errors || {
    echo "No vic3/data.json on S3 yet. The first deploy must be a full one:" >&2
    echo "run 'ruby extract.rb && ./deploy.sh' on a machine with Victoria 3 installed." >&2
    exit 1
  }
  data="$tmp/data.json"
else
  [ -f vic3/data.json ] || { echo "No vic3/data.json -- run: ruby extract.rb" >&2; exit 1; }
  data="vic3/data.json"
fi

version="$(cat "$data" $tracked | md5)"
version="${version:0:10}"
sed "s/__DATA_VERSION__/${version}/g" index.html > "$tmp/index.html"

# Assets first, page last, so a new page never points at files not yet there.
if [ "${1:-}" = "--code-only" ]; then
  for f in $tracked; do
    aws s3 cp "$f" "s3://${bucket}/${f}" --only-show-errors --cache-control "public, max-age=31536000"
  done
else
  aws s3 sync vic3/ "s3://${bucket}/vic3/" --delete --exclude ".DS_Store" --exclude "*.v3" \
    --cache-control "public, max-age=31536000"
fi
aws s3 cp "$tmp/index.html" "s3://${bucket}/index.html" --only-show-errors \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

echo "Deployed version ${version} to s3://${bucket}${1:+ ($1)}"
