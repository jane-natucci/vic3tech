#!/usr/bin/env bash
# Uploads the site to S3, where CloudFront serves it as vic3tech.jane.berlin.
# Run from a machine that has run extract.rb (the data comes from a local
# Victoria 3 install, so it can't be built in CI).
#
#   ./deploy.sh
#
# Every data/image URL carries ?v=<digest of data.json>, which CloudFront
# caches /vic3/* on for a year -- a new extraction therefore busts all of it.
# index.html itself is sent with no-cache, so a deploy shows up immediately.
set -euo pipefail
cd "$(dirname "$0")"

bucket="${VIC3_BUCKET:-vic3tech.jane.berlin}"
export AWS_PROFILE="${AWS_PROFILE:-personal}"

[ -f vic3/data.json ] || { echo "No vic3/data.json -- run: ruby extract.rb" >&2; exit 1; }

version="$(md5 -q vic3/data.json 2>/dev/null || md5sum vic3/data.json | cut -d' ' -f1)"
version="${version:0:10}"
build="$(mktemp -d)"
sed "s/__DATA_VERSION__/${version}/g" index.html > "$build/index.html"

# Assets first, page last, so a new page never points at files not yet there.
aws s3 sync vic3/ "s3://${bucket}/vic3/" --delete --exclude ".DS_Store" \
  --cache-control "public, max-age=31536000"
aws s3 cp "$build/index.html" "s3://${bucket}/index.html" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

echo "Deployed data version ${version} to s3://${bucket}"
