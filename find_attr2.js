const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/data-[a-zA-Z0-9-]+['"],\s*\w+\.uid/g);
console.log(match);
