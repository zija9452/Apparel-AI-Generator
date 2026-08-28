import pandas as pd
import io
import json
import re
from typing import Dict, Any, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Generic personalization columns: "<Part> <Field>" e.g. "Front Name",
# "Back Number", "Left Sleeve Number", "Sleeve Number" (= both sleeves),
# "Neck Name", "Back Logo". A bare field column ("Name", "Number") has no
# explicit part; the plan builder routes it (name -> front, number -> back
# default, same value on every personalized part when ambiguous).
# NOTE: a bare "Sleeve" column is the sleeve-LENGTH column (Half/Full),
# never personalization - a personalization column must END in a field word.
# ---------------------------------------------------------------------------

def _match_personalization_column(col: str) -> Optional[Tuple[Optional[str], str]]:
    """Returns (part, field) for a personalization column, else None.
    part is None for bare/unprefixed columns like 'Name' or 'Player Number'."""
    c = str(col).lower().strip()
    if not c or "unnamed" in c:
        return None
    tokens = [t for t in re.split(r"[\s_\-.]+", c) if t]
    if not tokens:
        return None
    last = tokens[-1]
    if last == "name":
        field = "name"
    elif last in ("number", "num", "no", "#"):
        field = "number"
    elif last == "logo":
        field = "logo"
    else:
        return None

    prefix = " ".join(tokens[:-1])
    if not prefix:
        return (None, field)

    if "sleeve" in prefix:
        if "left" in prefix:
            part = "sleeve-left"
        elif "right" in prefix:
            part = "sleeve-right"
        else:
            part = "sleeve-both"
    elif "front" in prefix:
        part = "front"
    elif "back" in prefix:
        part = "back"
    elif "neck" in prefix or "collar" in prefix:
        part = "neck"
    else:
        # Unknown prefix ('Player Name', 'Jersey Number'): treat as a bare
        # field, but ONLY for full words. Short aliases with a random prefix
        # ('Sr No', 'S.No') are serial columns, not player numbers.
        if last in ("num", "no", "#"):
            return None
        return (None, field)
    return (part, field)


def parse_order_excel(file_content: bytes) -> Dict[str, Any]:
    """
    Reads an Excel file and returns grouped orders and color mapping.
    Smarter: Searches for the header row if it's not the first one.
    """
    excel_file = pd.ExcelFile(io.BytesIO(file_content))
    
    sheet_names = excel_file.sheet_names
    orders_sheet = "Orders" if "Orders" in sheet_names else sheet_names[0]
    
    # Read without headers first to find the real header row
    temp_df = pd.read_excel(excel_file, sheet_name=orders_sheet, header=None)
    
    header_idx = 0
    found = False
    for i, row in temp_df.iterrows():
        row_str = [str(val).lower().strip() for val in row.values]
        if 'size' in row_str:
            header_idx = i
            found = True
            break
    
    # dtype=str: keep every cell EXACTLY as written in Excel. Without it pandas
    # coerces mixed columns to numbers, silently turning a text "05" cell into 5.
    if not found:
        # Fallback to first row but this will likely fail the 'size' check
        df = pd.read_excel(excel_file, sheet_name=orders_sheet, dtype=str)
    else:
        # Re-read from the detected header row
        df = pd.read_excel(excel_file, sheet_name=orders_sheet, skiprows=header_idx, dtype=str)
    
    # Standardize column names
    df.columns = [str(col).lower().strip() for col in df.columns]
    
    # Ensure necessary columns exist (Case-insensitive check)
    cols = list(df.columns)
    
    # 1. Size is Mandatory
    if 'size' not in cols:
        detected = ", ".join(cols)
        raise ValueError(f"Excel must have a 'Size' column. Detected columns: [{detected}]")
    
    # 2. Detect all personalization columns generically: "<Part> <Field>".
    # First matching column wins for each (part, field) slot.
    pers_cols: Dict[Tuple[Optional[str], str], str] = {}
    for c in cols:
        m = _match_personalization_column(c)
        if m and m not in pers_cols:
            pers_cols[m] = c

    # Numbers print EXACTLY as the Excel cell shows them: numeric 5 -> "5",
    # text '05 -> "05" (leading zeros need a text cell; Excel numeric cells
    # strip them before we ever see the value). No padding is added here.
    def format_num(x):
        if pd.isna(x): return ""
        try:
            if isinstance(x, (int, float)):
                # numeric cells surface as floats (5 -> 5.0); Excel shows 5
                return str(int(x)) if float(x) == int(x) else str(x)
            s = str(x).strip()
            # with dtype=str a numeric cell can surface as "5.0"; Excel shows 5.
            # Text cells like "05" have no ".0" suffix and pass through untouched.
            if s.endswith(".0") and s[:-2].isdigit():
                s = s[:-2]
            return s
        except:
            return str(x).strip()

    def format_text(x):
        if pd.isna(x): return ""
        return str(x).strip()

    def cell_value(row, key):
        col = pers_cols.get(key)
        if not col:
            return ""
        v = row[col]
        return format_num(v) if key[1] == "number" else format_text(v)

    # 3. Legacy flat fields (kept for the LLM agent and _enforce_personalization):
    # 'name'/'number' = front column, else bare column; back fields stay explicit.
    def legacy_key(part, field):
        return (part, field) if (part, field) in pers_cols else (None, field)

    name_key = legacy_key("front", "name")
    number_key = legacy_key("front", "number")

    # 4. Handle 'Sleeve' (Optional) - sleeve LENGTH (Half/Full), not personalization
    if 'sleeve' in cols:
        df['sleeve'] = df['sleeve'].fillna('Half').apply(lambda x: str(x).strip().capitalize())
    else:
        df['sleeve'] = 'Half'

    # Normalize size strings (Excel cells often carry trailing spaces e.g. 'Medium ')
    df['size'] = df['size'].fillna('').astype(str).str.strip()

    # Build one record per row, then group identical prints.
    # 'personalization' carries EVERY detected column per part; bare columns
    # land under part "unspecified" for the plan builder to route.
    group_map: Dict[str, Dict[str, Any]] = {}
    group_order: List[str] = []
    for _, row in df.iterrows():
        size = str(row['size']).strip()
        if not size:
            continue  # blank/spacer rows in the sheet

        personalization: Dict[str, Dict[str, str]] = {}
        for (part, field), col in pers_cols.items():
            val = cell_value(row, (part, field))
            if val:
                personalization.setdefault(part or "unspecified", {})[field] = val

        rec = {
            "name": cell_value(row, name_key),
            "back_name": cell_value(row, ("back", "name")),
            "number": cell_value(row, number_key),
            "back_number": cell_value(row, ("back", "number")),
            "size": size,
            "sleeve": str(row['sleeve']),
            "personalization": personalization,
        }
        gkey = json.dumps(
            [rec["size"], rec["sleeve"], rec["personalization"]],
            sort_keys=True,
        )
        if gkey not in group_map:
            rec["quantity"] = 0
            group_map[gkey] = rec
            group_order.append(gkey)
        group_map[gkey]["quantity"] += 1

    raw_orders = [group_map[k] for k in group_order]
    
    # 2. Process Color Mapping
    color_mapping = {}
    # Look for any sheet that has 'color' in its name, or just take the second sheet if it exists
    color_sheet = next((s for s in sheet_names if "color" in s.lower()), None)
    if not color_sheet and len(sheet_names) > 1:
        color_sheet = sheet_names[1] # Fallback to second sheet

    if color_sheet:
        try:
            # Read everything without headers to scan manually
            cdf = pd.read_excel(excel_file, sheet_name=color_sheet, header=None)
            
            # 1. Find the coordinates of C, M, Y, K labels
            labels = {}
            for r in range(len(cdf)):
                for c in range(len(cdf.columns)):
                    val = str(cdf.iloc[r, c]).lower().strip()
                    if val in ['c', 'm', 'y', 'k']:
                        labels[val] = (r, c)
            
            if len(labels) >= 3:
                # Determine Orientation
                rows = [pos[0] for pos in labels.values()]
                cols = [pos[1] for pos in labels.values()]
                
                is_vertical = len(set(cols)) == 1 # All labels in one column
                
                if is_vertical:
                    # --- VERTICAL FORMAT (As in user image) ---
                    label_col = cols[0]
                    first_label_row = min(rows)
                    # Swatch names should be in the row right above the labels
                    header_row_idx = first_label_row - 1
                    
                    if header_row_idx >= 0:
                        for c in range(label_col + 1, len(cdf.columns)):
                            swatch_name = str(cdf.iloc[header_row_idx, c]).strip()
                            if swatch_name and swatch_name.lower() != 'nan' and "unnamed" not in swatch_name.lower():
                                try:
                                    def get_v(l):
                                        if l in labels:
                                            v = cdf.iloc[labels[l][0], c]
                                            if pd.isna(v): return 0.0
                                            # Preserve decimals, round to 2 places
                                            return round(float(str(v).replace('%', '').strip()), 2)
                                        return 0.0
                                    
                                    color_mapping[swatch_name] = {
                                        "c": get_v('c'), "m": get_v('m'),
                                        "y": get_v('y'), "k": get_v('k')
                                    }
                                except: continue
                else:
                    # --- HORIZONTAL FORMAT ---
                    label_row = rows[0]
                    first_label_col = min(cols)
                    # Swatch names should be in the column to the left of the labels
                    header_col_idx = first_label_col - 1
                    
                    if header_col_idx >= 0:
                        for r in range(label_row + 1, len(cdf)):
                            swatch_name = str(cdf.iloc[r, header_col_idx]).strip()
                            if swatch_name and swatch_name.lower() != 'nan':
                                try:
                                    def get_v(l):
                                        if l in labels:
                                            v = cdf.iloc[r, labels[l][1]]
                                            if pd.isna(v): return 0.0
                                            return round(float(str(v).replace('%', '').strip()), 2)
                                        return 0.0
                                    
                                    color_mapping[swatch_name] = {
                                        "c": get_v('c'), "m": get_v('m'),
                                        "y": get_v('y'), "k": get_v('k')
                                    }
                                except: continue
        except Exception as e:
            print(f"Error parsing color sheet: {e}")

    # Extract Project Title (Search first 5 rows)
    project_title = "Apparel Order"
    for i in range(min(5, len(temp_df))):
        row_values = [str(v) for v in temp_df.iloc[i].values if str(v).strip() and str(v).lower() != 'nan']
        if row_values and len(" ".join(row_values)) > 10:
            project_title = " ".join(row_values)
            break

    # Summary for AI Agent (Sending ALL unique combinations now)
    # The 'personalization' dict is NOT sent to the LLM yet: the agent's
    # instructions and the JSX only consume the legacy flat fields. It rides
    # along in raw_orders for the deterministic plan builder (Phase 4).
    llm_orders = [{k: v for k, v in o.items() if k != "personalization"} for o in raw_orders]
    summary = (
        f"Project Title: {project_title}\n"
        f"Total Unique Combinations (Name+BackName+Number+BackNumber+Size+Sleeve): {len(raw_orders)}\n"
        f"Full Order List: {json.dumps(llm_orders)}\n"
        f"Color Mapping: {json.dumps(color_mapping)}"
    )
    
    return {
        "summary": summary,
        "raw_orders": raw_orders,
        "color_mapping": color_mapping,
        "total_count": len(raw_orders)
    }
