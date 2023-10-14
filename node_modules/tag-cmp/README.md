# tag-cmp

Compare two semver-like version strings, returning -1, 0, or 1.

This can be used with `Array.sort`.

## Example

```javascript
var {cmpTags} = require('tag-cmp');

cmpTags("1.2b1", "1.2") === -1;

arr = ["1.2b1", "1.11", "1.2"];
arr.sort(cmpTags) === ["1.2b1", "1.2", "1.11"];
```

## Version precedence

Versions are being compared in [natural sort order][] (i.e. lexicographic with the consideration of multi-digit numbers), with a special exception for "pre-release identifiers" (letters that immediately follow a number).

Example in ascending order:

* `v1.3` (goes first just because others don't have the "v")
* `1.1.2` (lowest minor version)
* `1.2rc1` (precedes the following as a "release candidate" of 1.2)
* `1.2` (actual release)
* `1.2.1` (patch release)
* `1.11` (much later version; `11 > 2` even if `'1' < '2'`)

(and so `1.11` would be chosen as the "greatest").

This handling is compatible with [SemVer][], but more general.

There is no attempt to isolate the version number from other text that may be part of the tag name. But that's not a problem if the tags have a matching prefix, e.g. `Release-1.2.3` and `Release-1.2.4`. But, `Foo-3.4.5` would precede these just because `'F' < 'R'`.


[natural sort order]: https://en.wikipedia.org/wiki/Natural_sort_order
[semver]: https://semver.org/
