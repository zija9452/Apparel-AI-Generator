import pandas as pd
import io
import json
from typing import Dict, Any, List

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
    
    if not found:
        # Fallback to first row but this will likely fail the 'size' check
        df = pd.read_excel(excel_file, sheet_name=orders_sheet)
    else:
        # Re-read from the detected header row
        df = pd.read_excel(excel_file, sheet_name=orders_sheet, skiprows=header_idx)
    
    # Standardize column names
    df.columns = [str(col).lower().strip() for col in df.columns]
    
    # Ensure necessary columns exist (Case-insensitive check)
    cols = list(df.columns)
    
    # 1. Size is Mandatory
    if 'size' not in cols:
        detected = ", ".join(cols)
        raise ValueError(f"Excel must have a 'Size' column. Detected columns: [{detected}]")
    
    # 2. Handle 'Name' (Optional)
    if 'name' in cols:
        df['name'] = df['name'].fillna('').astype(str)
    else:
        df['name'] = '' # Create empty column if missing

    # 3. Handle 'Number' (Optional) - Prioritize 'number' over 'no'
    number_col = next((c for c in cols if c in ['number', 'no', 'num']), None)
    if number_col:
        def format_num(x):
            if pd.isna(x): return ""
            # Handle float like 1.0 -> 1 -> "01"
            try:
                if isinstance(x, (int, float)):
                    val = int(x)
                    return str(val).zfill(2) if val < 10 else str(val)
                val = str(x).strip()
                if val.isdigit() and len(val) == 1:
                    return "0" + val
                return val
            except:
                return str(x)
        df['number'] = df[number_col].apply(format_num)
    else:
        df['number'] = ''

    # 4. Handle 'Sleeve' (Optional)
    if 'sleeve' in cols:
        df['sleeve'] = df['sleeve'].fillna('Half').apply(lambda x: str(x).strip().capitalize())
    else:
        df['sleeve'] = 'Half'
    
    # Standardize to our internal names for grouping
    # (Only keep the columns we need to prevent grouping issues)
    df_clean = df[['name', 'number', 'size', 'sleeve']].copy()
    
    # Grouping logic
    grouped = df_clean.groupby(['name', 'number', 'size', 'sleeve']).size().reset_index(name='quantity')
    raw_orders = grouped.to_dict(orient="records")
    
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
    summary = (
        f"Project Title: {project_title}\n"
        f"Total Unique Combinations (Name+Number+Size+Sleeve): {len(raw_orders)}\n"
        f"Full Order List: {json.dumps(raw_orders)}\n"
        f"Color Mapping: {json.dumps(color_mapping)}"
    )
    
    return {
        "summary": summary,
        "raw_orders": raw_orders,
        "color_mapping": color_mapping,
        "total_count": len(raw_orders)
    }
