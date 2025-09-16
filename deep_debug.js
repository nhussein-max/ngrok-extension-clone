const { lintAnnotation, getScore } = require('./linter.js');
const fs = require('fs');

// Read the test data
const testData = JSON.parse(fs.readFileSync('./test_data.json', 'utf8'));
const jsonData = testData[0];

// Manually reproduce the logic to find the bug
console.log('=== Debugging the scoring logic ===');

// Letter mapping
const letterMap = { 'base': 'A' };
let currentLetter = 'B';
if ('responses' in jsonData) {
    for (const model in jsonData.responses) {
        letterMap[model] = currentLetter;
        currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
    }
}
console.log('Letter mapping:', letterMap);

// Extract issues from model_issues table
const responseHasIssue = {};
const modelIssues = jsonData.model_issues || {};
const colHeaders = modelIssues.colHeaders;
const miCells = modelIssues.cells;
const numAspects = modelIssues.rowHeaders.length;

for (let colIdx = 0; colIdx < colHeaders.length; colIdx++) {
    const header = colHeaders[colIdx];
    const letter = header.split(' ').pop(); // e.g., 'Model A' -> 'A'
    let hasIssue = false;
    for (let row = 0; row < numAspects; row++) {
        const issuesList = miCells[row][colIdx];
        if (issuesList.length !== 1 || issuesList[0] !== "no_issues") {
            hasIssue = true;
            break;
        }
    }
    responseHasIssue[letter] = hasIssue;
    console.log(`Response ${letter} has issue: ${hasIssue}`);
}

// Build items object like in the linter
const items = {};
items['A'] = [0, responseHasIssue['A'] || false];
console.log(`Response A: score=0, hasIssue=${items['A'][1]}`);

for (const [model, data] of Object.entries(jsonData.responses)) {
    const letter = letterMap[model];
    const pref = data.preference;
    const score = getScore(pref);
    const hasIssue = responseHasIssue[letter] || false;
    items[letter] = [score, hasIssue];
    console.log(`Response ${letter} (${model}): preference="${pref}" score=${score}, hasIssue=${hasIssue}`);
}

console.log('\n=== Final items object ===');
console.log(items);

// Now check the comparison logic
const aScore = items['A'][0];
const aIssue = items['A'][1];
console.log(`\nA: score=${aScore}, issue=${aIssue}`);

for (const [response, responseData] of Object.entries(items)) {
    if (response !== 'A') {
        const responseScore = responseData[0];
        const responseIssue = responseData[1];
        console.log(`${response}: score=${responseScore}, issue=${responseIssue}`);
        console.log(`  responseScore === aScore? ${responseScore === aScore} (${responseScore} === ${aScore})`);
        if (responseScore === aScore) {
            console.log(`  -> This would trigger the tie error!`);
        }
    }
}
