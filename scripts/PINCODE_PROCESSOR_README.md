# Pincode-Based Pensioner Data Processor

## Overview
This processor organizes pensioner data by **State → District → Pincode** hierarchy with comprehensive analytics including age categories, PSA details, and disbursing branch information.

## Features

✅ **Hierarchical Organization**: State → District → Pincode  
✅ **Duplicate Prevention**: PPO number-based uniqueness  
✅ **Age Categorization**: Automatic age calculation and grouping  
✅ **PSA Parsing**: Extracts district and pincode from PSA text  
✅ **Branch Tracking**: Disbursing branch pincode analysis  
✅ **Comprehensive Summaries**: Multiple summary tables for analytics  

## Database Tables Created

### 1. `pensioner_pincode_data` (Main Table)
Stores individual pensioner records:
- PPO Number (unique)
- Date of Birth / Year of Birth
- Age & Age Category
- Pension Sanctioning Authority (PSA)
- PSA District & Pincode
- Disbursing Branch Address & Pincode
- Pensioner Address & Pincode
- State & District

### 2. `state_pensioner_summary`
State-level aggregation:
- Total pensioners per state
- Total districts per state
- Total pincodes per state

### 3. `district_pensioner_summary`
District-level aggregation:
- Total pensioners per district
- Total pincodes per district
- State association

### 4. `pincode_pensioner_summary`
Pincode-level aggregation:
- Total pensioners per pincode
- District and State association

### 5. `age_category_summary`
Age distribution:
- Below 60
- 60-69
- 70-79
- 80-89
- 90+

### 6. `psa_summary`
PSA-wise distribution:
- PSA full text
- Extracted district & pincode
- Total pensioners per PSA

### 7. `disbursing_branch_summary`
Branch-wise distribution:
- Branch pincode
- Branch address
- Total pensioners per branch

## Excel File Format

Your Excel file should have these columns:

| Column Name | Description | Example |
|-------------|-------------|---------|
| PPO No. | Unique PPO Number | POSTAL/2013/MA/6 |
| Year of Birth | DOB or YOB | 21-01-1946 |
| Pension Sanctioning Authority | PSA details | SPOs,Goalpara Div, Dhubri-783301 |
| Address PinCode of Pension Disbursing Branch | Branch address with pincode | Dhubri H.O , Pin- 783301 |
| Postal Address PinCode of pensioner | Pensioner address with pincode | Dhubri H.O , Pin- 783301 |

**Alternative column names supported:**
- `PPO No` or `ppo_number`
- `YOB` or `year_of_birth`
- `PSA` or `psa`
- `Disbursing Branch` or `disbursing_branch`
- `Pensioner Address` or `pensioner_address`

## Usage

### Basic Usage
```bash
cd /data1/jainendra/DLC_backend-main/scripts
node pincode_pensioner_processor.js "path/to/your/excel/file.xlsx"
```

### Example
```bash
node pincode_pensioner_processor.js "../EXCEL_DATA/Pensioner_Data.xlsx"
```

### With Full Path
```bash
node pincode_pensioner_processor.js "/data1/jainendra/DLC_backend-main/EXCEL_DATA/Excel Files/Pensioner_Data.xlsx"
```

## Processing Logic

### 1. Duplicate Prevention
- Checks if PPO number already exists in database
- Skips duplicate entries automatically
- Logs duplicate count in statistics

### 2. PSA Parsing
Extracts information from PSA text:
```
Input: "SPOs,Goalpara Div, Dhubri-783301"
Output: 
  - District: "Dhubri"
  - Pincode: "783301"
```

### 3. Pincode Extraction
Finds 6-digit pincodes from addresses:
```
Input: "Dhubri H.O , Pin- 783301"
Output: "783301"
```

### 4. Age Calculation
Calculates age from date of birth and categorizes:
- Below 60
- 60-69 years
- 70-79 years
- 80-89 years
- 90+ years

### 5. State/District Mapping
Uses pincode-based mapping from `pincode_state_mapping.json`:
- First 2 digits of pincode determine state
- PSA district used when available
- Falls back to "Unknown" if not found

## Output

### Console Output
```
📂 Processing Excel file: Pensioner_Data.xlsx
================================================================================
📊 Total rows found: 1000
✅ Processed 100/1000 rows...
✅ Processed 200/1000 rows...
...
🔄 Recalculating summary counts...
✅ Summary counts updated

================================================================================
📊 Processing Complete!
================================================================================

📈 Statistics:
   Total Rows: 1000
   ✅ Inserted: 950
   ⏭️  Duplicates: 45
   ❌ Errors: 5

================================================================================
📊 SUMMARY REPORT
================================================================================

🗺️  STATE-WISE SUMMARY:
────────────────────────────────────────────────────────────────────────────────
   Assam: 500 pensioners, 5 districts, 25 pincodes
   West Bengal: 300 pensioners, 3 districts, 15 pincodes
   Delhi: 150 pensioners, 2 districts, 8 pincodes

👴 AGE CATEGORY SUMMARY:
────────────────────────────────────────────────────────────────────────────────
   Below 60: 50 pensioners
   60-69: 200 pensioners
   70-79: 400 pensioners
   80-89: 250 pensioners
   90+: 50 pensioners
```

## Querying the Data

### Get all pensioners for a state
```sql
SELECT * FROM pensioner_pincode_data WHERE state = 'Assam';
```

### Get pensioners by pincode
```sql
SELECT * FROM pensioner_pincode_data WHERE pensioner_pincode = '783301';
```

### Get state summary
```sql
SELECT * FROM state_pensioner_summary ORDER BY total_pensioners DESC;
```

### Get district summary for a state
```sql
SELECT * FROM district_pensioner_summary 
WHERE state = 'Assam' 
ORDER BY total_pensioners DESC;
```

### Get pincode-wise distribution
```sql
SELECT state, district, pincode, total_pensioners 
FROM pincode_pensioner_summary 
WHERE state = 'Assam'
ORDER BY total_pensioners DESC;
```

### Get age distribution by state
```sql
SELECT state, age_category, total_pensioners 
FROM age_category_summary 
WHERE state = 'Assam'
ORDER BY 
  CASE age_category
    WHEN 'Below 60' THEN 1
    WHEN '60-69' THEN 2
    WHEN '70-79' THEN 3
    WHEN '80-89' THEN 4
    WHEN '90+' THEN 5
  END;
```

### Get PSA-wise distribution
```sql
SELECT psa_full_text, psa_district, total_pensioners 
FROM psa_summary 
ORDER BY total_pensioners DESC;
```

### Get branch-wise distribution
```sql
SELECT branch_pincode, branch_address, total_pensioners 
FROM disbursing_branch_summary 
ORDER BY total_pensioners DESC;
```

## Error Handling

The processor handles:
- ✅ Missing PPO numbers (skips row)
- ✅ Duplicate PPO numbers (skips with log)
- ✅ Invalid dates (sets age to NULL)
- ✅ Missing pincodes (uses "Unknown")
- ✅ Malformed PSA text (extracts what's possible)

## Performance

- **Batch Processing**: Processes 100 rows at a time
- **Transaction Support**: Uses database transactions for consistency
- **Progress Tracking**: Shows progress every 100 rows
- **Memory Efficient**: Streams large Excel files

## Customization

### Adding More States to Pincode Mapping
Edit `pincode_state_mapping.json`:
```json
{
  "pincodeRanges": {
    "Your State": ["XX", "YY"]
  },
  "specialCases": {
    "123456": {"state": "Your State", "district": "Your District"}
  }
}
```

### Modifying Age Categories
Edit the `getAgeCategory()` method in the processor.

### Adding Custom Columns
Modify the `pensioner_pincode_data` table schema and update the insert logic.

## Troubleshooting

### Issue: "Cannot find module 'xlsx'"
```bash
npm install xlsx
```

### Issue: "Database locked"
Close any other connections to the database and try again.

### Issue: "Column not found"
Check your Excel column names match the expected format or add alternative names in the code.

### Issue: "State showing as Unknown"
Add the pincode range to `pincode_state_mapping.json`.

## Database Location

Default: `/data1/jainendra/DLC_backend-main/DLC_Database.db`

To use a different database, modify the `dbPath` parameter in the constructor.

## Support

For issues or questions, check:
1. Excel file format matches expected columns
2. PPO numbers are unique
3. Pincodes are 6 digits
4. Database has write permissions

## Example Complete Workflow

```bash
# 1. Navigate to scripts directory
cd /data1/jainendra/DLC_backend-main/scripts

# 2. Process your Excel file
node pincode_pensioner_processor.js "../EXCEL_DATA/Pensioner_Data.xlsx"

# 3. Query the results
sqlite3 ../DLC_Database.db "SELECT * FROM state_pensioner_summary;"

# 4. Export results
sqlite3 ../DLC_Database.db ".mode csv" ".output results.csv" "SELECT * FROM pensioner_pincode_data;"
```

## Notes

- **Duplicate Prevention**: PPO numbers must be unique
- **State Mapping**: Based on first 2 digits of pincode
- **District Extraction**: Primarily from PSA text
- **Age Calculation**: Based on current date
- **Summary Updates**: Automatic after each insert
