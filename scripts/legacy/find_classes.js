const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const matches = content.match(/['"]smm-[^'"]*['"]/g);
console.log([...new Set(matches)]);
