const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/generalization_['"]\s*\+\s*this\.generalizationBelongNode\.uid/g);
console.log(match);
const match2 = content.match(/generalization_['"]\s*\+\s*\w+\.uid/g);
console.log(match2);
