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
# The header's "Build <sha>" link points at the deployed commit on GitHub.
# A local deploy with uncommitted changes to the page or our files says so.
sha="$(git rev-parse HEAD)"
label="${sha:0:7}"
[ -z "$(git status --porcelain -- index.html $tracked)" ] || label="${label}-dirty"
sed -e "s/__DATA_VERSION__/${version}/g" -e "s/__BUILD_SHA__/${sha}/g" -e "s/__BUILD_LABEL__/${label}/g" \
  index.html > "$tmp/index.html"

# Assets first, page last, so a new page never points at files not yet there.
if [ "${1:-}" = "--code-only" ]; then
  for f in $tracked; do
    aws s3 cp "$f" "s3://${bucket}/${f}" --only-show-errors --cache-control "public, max-age=31536000"
  done
else
  aws s3 sync vic3/ "s3://${bucket}/vic3/" --delete --exclude ".DS_Store" --exclude "*.v3" \
    --cache-control "public, max-age=31536000"
fi
# The EU4 page (eu4/, self-contained): its page on every deploy, its game
# data (eu4/extract.rb's output) only from a full local deploy, like vic3/'s.
# Neither is versioned, so both are no-cache. Served at /eu4/: the bucket is
# private, so CloudFront can't map a folder to its index.html -- the page is
# also stored under the key "eu4/" itself.
if [ "${1:-}" != "--code-only" ]; then
  [ -f eu4/data.json ] || { echo "No eu4/data.json -- run: ruby eu4/extract.rb" >&2; exit 1; }
  aws s3 cp eu4/data.json "s3://${bucket}/eu4/data.json" --only-show-errors \
    --cache-control "no-cache" --content-type "application/json"
fi
# (s3api, not "s3 cp": cp reads a destination ending in / as a folder.)
for key in eu4/ eu4/index.html; do
  aws s3api put-object --bucket "$bucket" --key "$key" --body eu4/index.html \
    --cache-control "no-cache" --content-type "text/html; charset=utf-8" >/dev/null
done
aws s3 cp "$tmp/index.html" "s3://${bucket}/index.html" --only-show-errors \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

# The "share this save" Lambda (lambda/share.mjs). Terraform creates the
# function; its code ships from here. A failure here doesn't undo the site
# deploy above, so it only warns (e.g. before the function exists).
( cd lambda && zip -q -X "$tmp/share.zip" share.mjs ) &&
  aws lambda update-function-code --function-name "${VIC3_SHARE_FUNCTION:-vic3tech-share}" \
    --zip-file "fileb://$tmp/share.zip" --region eu-central-1 --output text --query LastUpdateStatus >/dev/null ||
  echo "warning: couldn't update the vic3tech-share Lambda's code" >&2

echo "Deployed version ${version} to s3://${bucket}${1:+ ($1)}"
