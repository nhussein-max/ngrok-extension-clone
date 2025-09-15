// Port of Python linting logic to JavaScript

function getScore(pref) {
    /**
     * Parse preference string to a numerical score.
     * Higher score means better ranking.
     * b_3: 3 (much better), b_2: 2, b_1: 1 (slightly better)
     * a: 0 (equal)
     * a_1: -1 (slightly worse), etc.
     * tie: 0 (equal)
     */
    if (pref === 'tie') {
        return 0;
    }
    if (pref.includes('_')) {
        const [side, levelStr] = pref.split('_');
        const level = parseInt(levelStr);
        if (side === 'b') {
            return level;
        } else if (side === 'a') {
            return -level;
        } else {
            throw new Error(`Invalid preference side: ${side}`);
        }
    } else {
        const side = pref;
        const level = 0;
        if (side === 'b') {
            return level;
        } else if (side === 'a') {
            return -level;
        } else {
            throw new Error(`Invalid preference side: ${side}`);
        }
    }
}

function ratingText(r) {
    /**
     * Convert rating to text description.
     */
    if (r === '0') {
        return 'No Issue';
    } else if (r === '1') {
        return 'Minor Issue';
    } else if (r === '2') {
        return 'Major Issue';
    } else {
        return `Unknown (${r})`;
    }
}

function lintAnnotation(jsonData) {
    /**
     * Performs basic linting checks on the JSON annotation data.
     * 
     * Checks include:
     * - Mismatch between aspect_ratings and model_issues tables.
     * - Consistency for base response rating and issues.
     * - Consistency between preferences and issues.
     * 
     * Returns a list of error messages. If empty, no issues found.
     */
    const errors = [];
    
    // Check for required keys
    const requiredKeys = ['base_response', 'responses', 'model_issues', 'aspect_ratings'];
    for (const key of requiredKeys) {
        if (!(key in jsonData)) {
            errors.push(`Missing required key: '${key}'`);
        }
    }
    
    // Assign letters: base -> A, then B, C, ... for responses in order
    const letterMap = { 'base': 'A' };
    let currentLetter = 'B';
    if ('responses' in jsonData) {
        for (const model in jsonData.responses) {
            letterMap[model] = currentLetter;
            currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
        }
    }
    
    // Extract issues from model_issues table
    const responseHasIssue = {};
    const modelIssues = jsonData.model_issues || {};
    const aspectRatings = jsonData.aspect_ratings || {};
    
    if ('colHeaders' in modelIssues && 'cells' in modelIssues && 'rowHeaders' in modelIssues) {
        const colHeaders = modelIssues.colHeaders;
        const miCells = modelIssues.cells;
        const numAspects = modelIssues.rowHeaders.length;
        
        // Check table consistency with aspect_ratings
        if ('colHeaders' in aspectRatings && 'cells' in aspectRatings && 'rowHeaders' in aspectRatings) {
            const arColHeaders = new Set(aspectRatings.colHeaders);
            const miColHeaders = new Set(colHeaders);
            if (!setsEqual(arColHeaders, miColHeaders)) {
                errors.push("Column headers mismatch between aspect_ratings and model_issues.");
            }
            
            const arRowHeaders = new Set(aspectRatings.rowHeaders);
            const miRowHeaders = new Set(modelIssues.rowHeaders);
            if (!setsEqual(arRowHeaders, miRowHeaders)) {
                errors.push("Row headers mismatch between aspect_ratings and model_issues.");
            }
            
            const arCells = aspectRatings.cells;
            if (arCells.length !== numAspects) {
                errors.push("Row count mismatch between aspect_ratings and model_issues.");
            } else {
                const numCols = colHeaders.length;
                for (let row = 0; row < numAspects; row++) {
                    if (arCells[row].length !== numCols || miCells[row].length !== numCols) {
                        errors.push(`Column count mismatch in row ${row} between tables.`);
                    } else {
                        for (let col = 0; col < numCols; col++) {
                            const arVal = arCells[row][col];
                            const miList = miCells[row][col];
                            
                            // Check if "no_issues" is mixed with other issues
                            if (miList.includes("no_issues") && miList.length > 1) {
                                const rowH = aspectRatings.rowHeaders[row];
                                const colH = colHeaders[col];
                                const issueStr = miList.join(', ');
                                errors.push(`For ${rowH} in ${colH}: 'no_issues' cannot be combined with other issues. Found: '${issueStr}'`);
                            }
                            
                            const hasIssueHere = !arraysEqual(miList, ["no_issues"]);
                            if (hasIssueHere && (arVal === "0" || arVal === "n/a")) {
                                const rowH = aspectRatings.rowHeaders[row];
                                const colH = colHeaders[col];
                                const issueStr = miList.join(', ');
                                errors.push(`For ${rowH} in ${colH}: Issue '${issueStr}' is chosen in Model Issues table, but Aspect Ratings is set to "${ratingText(arVal)}". There is mismatch between tables.`);
                            } else if (!hasIssueHere && (arVal !== "0" && arVal !== "n/a")) {
                                const rowH = aspectRatings.rowHeaders[row];
                                const colH = colHeaders[col];
                                errors.push(`For ${rowH} in ${colH}: No issue chosen in Model Issues table, but Aspect Ratings is set to "${ratingText(arVal)}". There is mismatch between tables.`);
                            }
                        }
                    }
                }
            }
        } else {
            errors.push("Missing colHeaders, cells, or rowHeaders in aspect_ratings.");
        }
        
        // Extract has_issue per response
        for (let colIdx = 0; colIdx < colHeaders.length; colIdx++) {
            const header = colHeaders[colIdx];
            const letter = header.split(' ').pop(); // e.g., 'Model A' -> 'A'
            let hasIssue = false;
            for (let row = 0; row < numAspects; row++) {
                const issuesList = miCells[row][colIdx];
                if (!arraysEqual(issuesList, ["no_issues"])) {
                    hasIssue = true;
                    break;
                }
            }
            responseHasIssue[letter] = hasIssue;
        }
    } else {
        errors.push("Missing colHeaders, cells, or rowHeaders in model_issues.");
        return errors;
    }
    
    // Checks for base response
    if ('base_response' in jsonData) {
        if ('base_model' in jsonData.base_response && 'baseline' in jsonData.base_response.base_model) {
            const baseRating = jsonData.base_response.base_model.baseline;
            try {
                const ratingInt = parseInt(baseRating);
                const aHasIssue = responseHasIssue['A'] || false;
                const isIdeal = ratingInt === 7;
                if (isIdeal && aHasIssue) {
                    errors.push("Response A is ideal (rated 7) so should have no issues; remove any issues noted for A.");
                }
                if (!isIdeal && !aHasIssue) {
                    errors.push("Response A rated below 7 has to have at least one minor issue in the table.");
                }
            } catch (e) {
                errors.push("Invalid baseline rating for base response.");
            }
        } else {
            errors.push("Missing base_model or baseline in base_response.");
        }
    }
    
    // Preference consistency with issues
    if ('base_response' in jsonData && 'responses' in jsonData) {
        const items = {};
        items['A'] = [0, responseHasIssue['A'] || false];
        const aHasIssue = items['A'][1];
        let isIdeal = false;
        try {
            isIdeal = parseInt(jsonData.base_response.base_model.baseline) === 7;
        } catch (e) {
            // ignore
        }
        
        for (const [model, data] of Object.entries(jsonData.responses)) {
            const letter = letterMap[model];
            if ('preference' in data) {
                const pref = data.preference;
                try {
                    const score = getScore(pref);
                    const hasIssue = responseHasIssue[letter] || false;
                    items[letter] = [score, hasIssue];
                    if (score > 0) {
                        if (!aHasIssue) {
                            errors.push(`You preferred Response ${letter} over A, so A has to have at least one minor issue.`);
                        }
                        if (isIdeal) {
                            errors.push(`You preferred Response ${letter} over ideal A (rated 7); no response should rank higher than ideal A.`);
                        }
                    }
                    if (score < 0) {
                        if (!hasIssue) {
                            errors.push(`You preferred A over Response ${letter}, so this response has to have at least one minor issue.`);
                        }
                    }
                } catch (e) {
                    errors.push(`Invalid preference for Response ${letter}: ${pref} - ${e.message}`);
                }
            } else {
                errors.push(`Missing preference for Response ${letter}.`);
            }
        }
        
        if (Object.keys(items).length > 0) {
            // Only compare non-A responses to response A (deactivate comparisons between non-A responses)
            const aScore = items['A'][0];
            const aIssue = items['A'][1];
            
            // Check for inconsistencies only between A and other responses
            for (const [response, responseData] of Object.entries(items)) {
                if (response !== 'A') {
                    const responseScore = responseData[0];
                    const responseIssue = responseData[1];
                    
                    if (responseScore > aScore) {
                        if (responseIssue && !aIssue) {
                            errors.push(`Inconsistent preference: Response ${response} (with issue) preferred over Response A (no issue).`);
                        }
                    } else if (responseScore < aScore) {
                        if (!responseIssue && aIssue) {
                            errors.push(`Inconsistent preference: Response A (with issue) preferred over Response ${response} (no issue).`);
                        }
                    } else if (responseScore === aScore) {
                        if (responseIssue !== aIssue) {
                            errors.push(`Inconsistent preference: Response ${response} (${responseIssue ? 'with' : 'no'} issue) tied with Response A (${aIssue ? 'with' : 'no'} issue).`);
                        }
                    }
                }
            }
        }
    }
    
    return errors;
}

// Helper functions
function setsEqual(a, b) {
    return a.size === b.size && [...a].every(value => b.has(value));
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, i) => val === b[i]);
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { lintAnnotation, getScore, ratingText };
}
