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
  # The flags have a version of their own (a digest of the pictures, written by the last full deploy), so
  # redrawing a flag busts the cache without the data changing, and a CI deploy keeps whatever is on S3.
  aws s3 cp "s3://${bucket}/vic3/flags/VERSION" "$tmp/VERSION" --only-show-errors || echo 0 > "$tmp/VERSION"
else
  [ -f vic3/data.json ] || { echo "No vic3/data.json -- run: ruby extract.rb" >&2; exit 1; }
  data="vic3/data.json"
  if [ -d vic3/flags ]; then
    find vic3/flags -name '*.png' | sort | xargs cat | md5 | cut -c1-10 > vic3/flags/VERSION
  else
    echo 0 > "$tmp/VERSION"; mkdir -p vic3/flags; cp "$tmp/VERSION" vic3/flags/VERSION
  fi
  cp vic3/flags/VERSION "$tmp/VERSION"
fi
flags_version="$(tr -d '[:space:]' < "$tmp/VERSION")"

version="$(cat "$data" $tracked | md5)"
version="${version:0:10}"
# The header's "Build <sha>" link points at the deployed commit on GitHub.
# A local deploy with uncommitted changes to the page or our files says so.
sha="$(git rev-parse HEAD)"
label="${sha:0:7}"
[ -z "$(git status --porcelain -- index.html $tracked)" ] || label="${label}-dirty"
sed -e "s/__DATA_VERSION__/${version}/g" -e "s/__FLAGS_VERSION__/${flags_version}/g" -e "s/__BUILD_SHA__/${sha}/g" -e "s/__BUILD_LABEL__/${label}/g" \
  index.html > "$tmp/index.html"

# The crawlable side: a page per country, the sitemap and the front page (seo.rb).
ruby seo.rb "$data" "$tmp/index.html" "$tmp/seo"

# Assets first, page last, so a new page never points at files not yet there.
if [ "${1:-}" = "--code-only" ]; then
  for f in $tracked; do
    aws s3 cp "$f" "s3://${bucket}/${f}" --only-show-errors --cache-control "public, max-age=31536000"
  done
else
  aws s3 sync vic3/ "s3://${bucket}/vic3/" --delete --exclude ".DS_Store" --exclude "*.v3" --exclude "links.json" \
    --cache-control "public, max-age=31536000"
  # links.json (country name -> tag) is read by other apps that link here; at the root, not under the
  # year-long-cached /vic3/, so a change shows up within the hour.
  aws s3 cp vic3/links.json "s3://${bucket}/links.json" --only-show-errors \
    --cache-control "public, max-age=3600" --content-type "application/json"
fi
# The country pages have no file extension, so they say they are HTML themselves. (A plain copy, not a sync: the CI
# role may write to the bucket but not list it.)
aws s3 cp "$tmp/seo/country" "s3://${bucket}/country" --recursive --only-show-errors \
  --content-type "text/html; charset=utf-8" --cache-control "public, max-age=3600"
aws s3 cp "$tmp/seo/sitemap.xml" "s3://${bucket}/sitemap.xml" --only-show-errors \
  --cache-control "public, max-age=3600" --content-type "application/xml"
aws s3 cp robots.txt "s3://${bucket}/robots.txt" --only-show-errors \
  --cache-control "public, max-age=3600" --content-type "text/plain; charset=utf-8"
aws s3 cp "$tmp/seo/index.html" "s3://${bucket}/index.html" --only-show-errors \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

# The "share this save" Lambda (lambda/share.mjs). Terraform creates the
# function; its code ships from here. A failure here doesn't undo the site
# deploy above, so it only warns (e.g. before the function exists).
( cd lambda && zip -q -X "$tmp/share.zip" share.mjs ) &&
  aws lambda update-function-code --function-name "${VIC3_SHARE_FUNCTION:-vic3tech-share}" \
    --zip-file "fileb://$tmp/share.zip" --region eu-central-1 --output text --query LastUpdateStatus >/dev/null ||
  echo "warning: couldn't update the vic3tech-share Lambda's code" >&2

echo "Deployed version ${version} to s3://${bucket}${1:+ ($1)}"
