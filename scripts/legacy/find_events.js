const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/group\.on\(['"]click['"]/g);
console.log(match);
const match2 = content.match(/\w+\.nodeObj\s*=\s*this/g);
console.log(match2);
