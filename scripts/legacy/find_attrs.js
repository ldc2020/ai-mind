const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');

// Find where group or SVG elements get attributes or properties
const attrMatches = content.match(/\.setAttribute\([^)]+\)/g);
if (attrMatches) {
    console.log("Attributes:", [...new Set(attrMatches)].filter(s => s.includes('data-') || s.includes('uid')));
}

const propMatches = content.match(/\w+\.nodeObj\s*=/g);
console.log("Properties:", propMatches);
