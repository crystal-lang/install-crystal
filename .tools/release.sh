#!/bin/bash

set -e -u -x

cd "$(dirname "$0")/.."

rm -rf node_modules
git checkout v1
GIT_EDITOR=true git merge master
sed -i -E -e 's/"version": ".+",/"version": "'"$1"'",/' package.json
git diff --quiet && false
rm -rf node_modules
npm install --production
git add -f node_modules package.json package-lock.json
git diff --quiet
git commit -n -m "v$1"
git tag -a -m "" "v$1"
echo git push origin master v1 --tags
