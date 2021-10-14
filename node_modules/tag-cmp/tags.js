function cmpTags(a, b) {
    return cmpArrays(tagSortKey(a), tagSortKey(b));
}

exports.cmpTags = cmpTags;

function tagSortKey(s) {
    let a = s.split(/([0-9]+)/);
    // Example: 'v1.23rc4' -> ['v', '1', '.', '23', 'rc', '4', ''];
    for (let i = 1; i < a.length; i += 2) {
        // Every 2nd item will be digit-only; convert it to a number.
        a[i] = +a[i];
    }
    for (let i = 0; i < a.length; i += 3) {
        // Give any string part that starts with a word character a sorting priority
        // by inserting a `false` (< `true`) item into the key array.
        a.splice(i, 0, /^\B/.test(a[i]));
    }
    // Examples (sorted):
    //
    // * 'v1.3'  -> [false, 'v', 1, true, '.', 3, true, '']
    // * '1.2b1' -> [true, '', 1, true, '.', 2, false, 'b', 1, true, '']
    // * '1.2'   -> [true, '', 1, true, '.', 2, true, '']
    // * '1.2-1' -> [true, '', 1, true, '.', 2, true, '-', 1, true, '']
    // * '1.11'  -> [true, '', 1, true, '.', 11, true, '']
    return a;
}

function cmpArrays(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); ++i) {
        if (a[i] !== b[i]) {
            return (a[i] > b[i] ? 1 : -1);
        }
    }
    return a.length - b.length;
}
