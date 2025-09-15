import json
import os

def get_score(pref):
    """
    Parse preference string to a numerical score.
    Higher score means better ranking.
    b_3: 3 (much better), b_2: 2, b_1: 1 (slightly better)
    a: 0 (equal)
    a_1: -1 (slightly worse), etc.
    tie: 0 (equal)
    """
    if pref == 'tie':
        return 0
    if '_' in pref:
        side, level_str = pref.split('_')
        level = int(level_str)
    else:
        side = pref
        level = 0
    if side == 'b':
        return level
    elif side == 'a':
        return -level
    else:
        raise ValueError(f"Invalid preference side: {side}")

def rating_text(r):
    """
    Convert rating to text description.
    """
    if r == '0':
        return 'No Issue'
    elif r == '1':
        return 'Minor Issue'
    elif r == '2':
        return 'Major Issue'
    else:
        return f'Unknown ({r})'

def lint_annotation(json_data):
    """
    Performs basic linting checks on the JSON annotation data.
    
    Checks include:
    - Mismatch between aspect_ratings and model_issues tables.
    - Consistency for base response rating and issues.
    - Consistency between preferences and issues.
    
    Returns a list of error messages. If empty, no issues found.
    """
    errors = []
    
    # Check for required keys
    required_keys = ['base_response', 'responses', 'model_issues', 'aspect_ratings']
    for key in required_keys:
        if key not in json_data:
            errors.append(f"Missing required key: '{key}'")
    
    # Assign letters: base -> A, then B, C, ... for responses in order
    letter_map = {'base': 'A'}
    current_letter = 'B'
    if 'responses' in json_data:
        for model in json_data['responses']:
            letter_map[model] = current_letter
            current_letter = chr(ord(current_letter) + 1)
    
    # Extract issues from model_issues table
    response_has_issue = {}
    model_issues = json_data.get('model_issues', {})
    aspect_ratings = json_data.get('aspect_ratings', {})
    
    if 'colHeaders' in model_issues and 'cells' in model_issues and 'rowHeaders' in model_issues:
        col_headers = model_issues['colHeaders']
        mi_cells = model_issues['cells']
        num_aspects = len(model_issues['rowHeaders'])
        
        # Check table consistency with aspect_ratings
        if 'colHeaders' in aspect_ratings and 'cells' in aspect_ratings and 'rowHeaders' in aspect_ratings:
            if set(aspect_ratings['colHeaders']) != set(col_headers):
                errors.append("Column headers mismatch between aspect_ratings and model_issues.")
            if set(aspect_ratings['rowHeaders']) != set(model_issues['rowHeaders']):
                errors.append("Row headers mismatch between aspect_ratings and model_issues.")
            
            ar_cells = aspect_ratings['cells']
            if len(ar_cells) != num_aspects:
                errors.append("Row count mismatch between aspect_ratings and model_issues.")
            else:
                num_cols = len(col_headers)
                for row in range(num_aspects):
                    if len(ar_cells[row]) != num_cols or len(mi_cells[row]) != num_cols:
                        errors.append(f"Column count mismatch in row {row} between tables.")
                    else:
                        for col in range(num_cols):
                            ar_val = ar_cells[row][col]
                            mi_list = mi_cells[row][col]
                            
                            # Check if "no_issues" is mixed with other issues
                            if "no_issues" in mi_list and len(mi_list) > 1:
                                row_h = aspect_ratings['rowHeaders'][row]
                                col_h = col_headers[col]
                                issue_str = ', '.join(mi_list)
                                errors.append(f"For {row_h} in {col_h}: 'no_issues' cannot be combined with other issues. Found: '{issue_str}'")
                            
                            has_issue_here = mi_list != ["no_issues"]
                            if has_issue_here and ar_val == "0":
                                row_h = aspect_ratings['rowHeaders'][row]
                                col_h = col_headers[col]
                                issue_str = ', '.join(mi_list)
                                errors.append(f"For {row_h} in {col_h}: Issue '{issue_str}' is chosen in Model Issues table, but Aspect Ratings is set to \"{rating_text(ar_val)}\". There is mismatch between tables.")
                            elif not has_issue_here and ar_val != "0":
                                row_h = aspect_ratings['rowHeaders'][row]
                                col_h = col_headers[col]
                                errors.append(f"For {row_h} in {col_h}: No issue chosen in Model Issues table, but Aspect Ratings is set to \"{rating_text(ar_val)}\". There is mismatch between tables.")
        else:
            errors.append("Missing colHeaders, cells, or rowHeaders in aspect_ratings.")
        
        # Extract has_issue per response
        for col_idx, header in enumerate(col_headers):
            letter = header.split()[-1]  # e.g., 'Model A' -> 'A'
            has_issue = False
            for row in range(num_aspects):
                issues_list = mi_cells[row][col_idx]
                if issues_list != ["no_issues"]:
                    has_issue = True
                    break
            response_has_issue[letter] = has_issue
    else:
        errors.append("Missing colHeaders, cells, or rowHeaders in model_issues.")
        return errors
    
    # Checks for base response
    if 'base_response' in json_data:
        if 'base_model' in json_data['base_response'] and 'baseline' in json_data['base_response']['base_model']:
            base_rating = json_data['base_response']['base_model']['baseline']
            try:
                rating_int = int(base_rating)
                a_has_issue = response_has_issue.get('A', True)
                is_ideal = rating_int == 7
                if is_ideal and a_has_issue:
                    errors.append("Response A is ideal (rated 7) so should have no issues; remove any issues noted for A.")
                if not is_ideal and not a_has_issue:
                    errors.append("Response A rated below 7 has to have at least one minor issue in the table.")
            except ValueError:
                errors.append("Invalid baseline rating for base response.")
        else:
            errors.append("Missing base_model or baseline in base_response.")
    
    # Preference consistency with issues
    if 'base_response' in json_data and 'responses' in json_data:
        items = {}
        items['A'] = (0, response_has_issue.get('A', True))
        a_has_issue = items['A'][1]
        try:
            is_ideal = int(json_data['base_response']['base_model']['baseline']) == 7
        except:
            is_ideal = False
        
        for model, data in json_data['responses'].items():
            letter = letter_map[model]
            if 'preference' in data:
                pref = data['preference']
                try:
                    score = get_score(pref)
                    has_issue = response_has_issue.get(letter, True)
                    items[letter] = (score, has_issue)
                    if score > 0:
                        if not a_has_issue:
                            errors.append(f"You preferred Response {letter} over A, so A has to have at least one minor issue.")
                        if is_ideal:
                            errors.append(f"You preferred Response {letter} over ideal A (rated 7); no response should rank higher than ideal A.")
                    if score < 0:
                        if not has_issue:
                            errors.append(f"You preferred A over Response {letter}, so this response has to have at least one minor issue.")
                except ValueError as e:
                    errors.append(f"Invalid preference for Response {letter}: {pref} - {e}")
            else:
                errors.append(f"Missing preference for Response {letter}.")
        
        if items:
            # Sort by score descending (best to worst), ties not broken
            ordered = sorted(items.keys(), key=lambda k: -items[k][0])
            
            # Check for inconsistencies
            for i in range(len(ordered)):
                for j in range(i + 1, len(ordered)):
                    higher = ordered[i]
                    lower = ordered[j]
                    higher_score = items[higher][0]
                    lower_score = items[lower][0]
                    higher_issue = items[higher][1]
                    lower_issue = items[lower][1]
                    if higher_score > lower_score:
                        if higher_issue and not lower_issue:
                            errors.append(f"Inconsistent preference: Response {higher} (with issue) preferred over Response {lower} (no issue).")
                    elif higher_score == lower_score:
                        if higher_issue != lower_issue:
                            errors.append(f"Inconsistent preference: Response {higher} ({'with' if higher_issue else 'no'} issue) tied with Response {lower} ({'with' if lower_issue else 'no'} issue).")
    
    # Add more custom checks here based on your specific criteria
    
    return errors

def main():
    """
    Main function to load input.json from the same directory and run linting.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_path = os.path.join(script_dir, 'input.json')
    
    if not os.path.exists(input_path):
        print("Error: input.json not found in the same directory.")
        return
    
    with open(input_path, 'r') as f:
        try:
            json_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error loading JSON: {e}")
            return
    
    if not isinstance(json_data, list):
        data = [json_data]
    else:
        data = json_data
    
    for i, entry in enumerate(data):
        errors = lint_annotation(entry)
        
        print(f"Entry {i + 1}:")
        if errors:
            for error in errors:
                print(f"- {error}")
        else:
            print("No issues found.")

if __name__ == "__main__":
    main()