const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/setData\s*\([^)]*\)\s*\{[\s\S]{0,1000}/g);
if (match && match.length > 1) {
    console.log(match[1]);
}
