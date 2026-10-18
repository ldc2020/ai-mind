const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/\.addClass\([^)]+\)/g);
if (match) {
    console.log([...new Set(match)].filter(s => s.includes('uid')));
}
