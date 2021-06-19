#!/bin/bash

set -e -u -x

cd "$(dirname "$0")/.."

rm -f package-lock.json

ncu -u
npm update
npm test
git commit -a -m "Upgrade packages"
