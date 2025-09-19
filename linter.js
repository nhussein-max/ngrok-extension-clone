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
    
    // Check if annotation is complete
    const isComplete = isAnnotationComplete(jsonData);
    if (!isComplete) {
        return ['Task not complete - annotation data is incomplete or missing required fields.'];
    }
    
    // Check for required keys
    const requiredKeys = ['base_response', 'responses', 'model_issues', 'aspect_ratings'];
    for (const key of requiredKeys) {
        if (!(key in jsonData)) {
            errors.push(`Missing required key: '${key}'`);
        }
    }
    
    // Extract letter mapping from table column headers
    const letterMap = { 'base': 'A' };
    const modelToLetterMap = {}; // Maps model names to their letters
    
    // We'll populate this after we process the tables
    
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
        
        // Extract has_issue per response and build model to letter mapping
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
        
        // Build mapping from model names to letters by matching responses order with table columns
        // The table columns after "Model A" correspond to the responses in the order they appear
        if ('responses' in jsonData) {
            const responseModels = Object.keys(jsonData.responses);
            let responseIndex = 0;
            for (let colIdx = 0; colIdx < colHeaders.length; colIdx++) {
                const header = colHeaders[colIdx];
                const letter = header.split(' ').pop();
                
                if (letter === 'A') {
                    // Model A is always the base response
                    continue;
                } else if (responseIndex < responseModels.length) {
                    // Map this model to this letter
                    const modelName = responseModels[responseIndex];
                    modelToLetterMap[modelName] = letter;
                    responseIndex++;
                }
            }
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
                    errors.push("Response A is awesome (rated 7) so should have no issues; remove any issues noted for A.");
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
        
        // Collect responses preferred over A and responses A is preferred over
        const responsesPreferredOverA = [];
        const responsesAPreferredOver = [];
        const responsesPreferredOverIdealA = [];
        
        for (const [model, data] of Object.entries(jsonData.responses)) {
            const letter = modelToLetterMap[model];
            if (!letter) {
                errors.push(`Model '${model}' not found in table columns.`);
                continue;
            }
            if ('preference' in data) {
                const pref = data.preference;
                try {
                    const score = getScore(pref);
                    const hasIssue = responseHasIssue[letter] || false;
                    items[letter] = [score, hasIssue];
                    if (score > 0) {
                        if (!aHasIssue) {
                            responsesPreferredOverA.push(letter);
                        }
                        if (isIdeal) {
                            responsesPreferredOverIdealA.push(letter);
                        }
                    }
                    if (score < 0) {
                        if (!hasIssue) {
                            responsesAPreferredOver.push(letter);
                        }
                    }
                } catch (e) {
                    errors.push(`Invalid preference for Response ${letter}: ${pref} - ${e.message}`);
                }
            } else {
                errors.push(`Missing preference for Response ${letter}.`);
            }
        }
        
        // Generate consolidated error messages
        if (responsesPreferredOverA.length > 0) {
            const responseList = responsesPreferredOverA.join(', ');
            errors.push(`You preferred Response ${responseList} over A, so A has to have at least one minor issue.`);
        }
        
        if (responsesPreferredOverIdealA.length > 0) {
            const responseList = responsesPreferredOverIdealA.join(', ');
            errors.push(`You preferred Response ${responseList} over ideal A (rated 7); no response should rank higher than ideal A.`);
        }
        
        if (responsesAPreferredOver.length > 0) {
            const responseList = responsesAPreferredOver.join(', ');
            errors.push(`You preferred A over Response ${responseList}, so ${responsesAPreferredOver.length === 1 ? 'this response has' : 'these responses have'} to have at least one minor issue.`);
        }
        
        if (Object.keys(items).length > 0) {
            // Only compare non-A responses to response A (deactivate comparisons between non-A responses)
            const aScore = items['A'][0];
            const aIssue = items['A'][1];
            
            // Collect inconsistent preferences for consolidated messaging
            const responseWithIssuePreferredOverANoIssue = [];
            const aWithIssuePreferredOverResponseNoIssue = [];
            const tiedInconsistencies = [];
            
            // Check for inconsistencies only between A and other responses
            for (const [response, responseData] of Object.entries(items)) {
                if (response !== 'A') {
                    const responseScore = responseData[0];
                    const responseIssue = responseData[1];
                    
                    if (responseScore > aScore) {
                        if (responseIssue && !aIssue) {
                            responseWithIssuePreferredOverANoIssue.push(response);
                        }
                    } else if (responseScore < aScore) {
                        if (!responseIssue && aIssue) {
                            aWithIssuePreferredOverResponseNoIssue.push(response);
                        }
                    } else if (responseScore === aScore) {
                        if (responseIssue !== aIssue) {
                            tiedInconsistencies.push(`${response} (${responseIssue ? 'with' : 'no'} issue)`);
                        }
                    }
                }
            }
            
            // Generate consolidated inconsistency error messages
            if (responseWithIssuePreferredOverANoIssue.length > 0) {
                const responseList = responseWithIssuePreferredOverANoIssue.join(', ');
                errors.push(`Inconsistent preference: Response ${responseList} (with issue) preferred over Response A (no issue).`);
            }
            
            if (aWithIssuePreferredOverResponseNoIssue.length > 0) {
                const responseList = aWithIssuePreferredOverResponseNoIssue.join(', ');
                errors.push(`Inconsistent preference: Response A (with issue) preferred over Response ${responseList} (no issue).`);
            }
            
            if (tiedInconsistencies.length > 0) {
                for (const inconsistency of tiedInconsistencies) {
                    errors.push(`Inconsistent preference: Response ${inconsistency} tied with Response A (${aIssue ? 'with' : 'no'} issue).`);
                }
            }
        }
    }
    
    return errors;
}

function isAnnotationComplete(jsonData) {
    /**
     * Check if the annotation is complete enough for full validation.
     * Returns true if all required fields are filled out.
     */
    
    // Check if required structures exist
    if (!jsonData.base_response || !jsonData.responses || !jsonData.model_issues || !jsonData.aspect_ratings) {
        return false;
    }
    
    // Check if base response has rating
    if (!jsonData.base_response.base_model || !jsonData.base_response.base_model.baseline) {
        return false;
    }
    
    // Check if there are any responses defined
    if (Object.keys(jsonData.responses).length === 0) {
        return false;
    }
    
    // Check if all responses have preferences
    for (const [model, data] of Object.entries(jsonData.responses)) {
        if (!data.preference) {
            return false;
        }
    }
    
    // Check if tables have data
    const modelIssues = jsonData.model_issues;
    const aspectRatings = jsonData.aspect_ratings;
    
    if (!modelIssues.cells || !aspectRatings.cells) {
        return false;
    }
    
    // Check if any cells are filled (not all empty)
    let hasAnyData = false;
    for (const row of aspectRatings.cells) {
        for (const cell of row) {
            if (cell && cell !== "") {
                hasAnyData = true;
                break;
            }
        }
        if (hasAnyData) break;
    }
    
    if (!hasAnyData) {
        return false;
    }
    
    // Check if model issues table has any data
    hasAnyData = false;
    for (const row of modelIssues.cells) {
        for (const cell of row) {
            if (Array.isArray(cell) && cell.length > 0) {
                hasAnyData = true;
                break;
            }
        }
        if (hasAnyData) break;
    }
    
    return hasAnyData;
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
    module.exports = { lintAnnotation, getScore, ratingText, isAnnotationComplete };
}
