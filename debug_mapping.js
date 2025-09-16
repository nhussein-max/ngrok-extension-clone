const { lintAnnotation, getScore } = require('./linter.js');
const fs = require('fs');

// Read the test data
const testData = JSON.parse(fs.readFileSync('./test_data.json', 'utf8'));
const jsonData = testData[0];

// Debug the letter mapping
const letterMap = { 'base': 'A' };
let currentLetter = 'B';
if ('responses' in jsonData) {
    for (const model in jsonData.responses) {
        letterMap[model] = currentLetter;
        console.log(`Model: ${model} -> Letter: ${currentLetter}`);
        currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
    }
}

console.log('\nLetter mapping:', letterMap);

// Check scores
console.log('\nScores:');
for (const [model, data] of Object.entries(jsonData.responses)) {
    const letter = letterMap[model];
    const pref = data.preference;
    const score = getScore(pref);
    console.log(`${model} (Letter ${letter}): preference="${pref}" -> score=${score}`);
}

console.log('\nBase response (A) score should be 0');
