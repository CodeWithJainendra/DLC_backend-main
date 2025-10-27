# 📊 Excel to Database Mapper - Complete Guide

## Overview

This system allows you to:
1. **Analyze** all Excel files in your project
2. **Map** Excel columns to database fields through a web interface
3. **Create** a new database (`newdatabase.db`) with your custom mappings
4. **Query** pincode-wise pensioner statistics by bank and age category

---

## 🚀 Quick Start

### 1. Start the Server

```bash
cd /data1/jainendra/DLC_backend-main/DLCServer
node server.js
```

The server will start on port **9007** and display:
```
📊 EXCEL MAPPER (NEW):
🗂️  Excel to Database Mapper: http://0.0.0.0:9007/excel-mapper.html
📁 List Excel Files: http://0.0.0.0:9007/api/excel/files
🔍 Analyze Excel: http://0.0.0.0:9007/api/excel/analyze
💾 Create Database: http://0.0.0.0:9007/api/excel/create-database
```

### 2. Open the Web Interface

Navigate to: **http://localhost:9007/excel-mapper.html**

---

## 📋 Step-by-Step Usage

### **Step 1: Select Excel Files**

- The interface automatically loads all Excel files from:
  - `Excel Files/` directory
  - `Excel Files/21Oct/` subdirectory
- Click on files to select them (they will be highlighted)
- You can select multiple files

### **Step 2: Analyze Files**

- Click **"🔍 Analyze Selected Files"** button
- The system will:
  - Read all sheets in each file
  - Detect column names and data types
  - Show sample data
  - Auto-detect pincode, bank, and age category columns
  - Display row and column counts

### **Step 3: Map Columns**

The interface shows standard database fields:
- **pincode** - Pincode (6 digits)
- **bank_name** - Bank Name
- **bank_ifsc** - Bank IFSC Code
- **state** - State
- **district** - District
- **city** - City
- **age_less_than_80** - Pensioners aged < 80
- **age_more_than_80** - Pensioners aged > 80
- **age_not_available** - Age data not available
- **grand_total** - Total pensioners

**Mapping Options:**
1. **Manual Mapping**: Select columns from dropdown for each field
2. **Auto Mapping**: Click "Auto" button to automatically match columns based on keywords
3. **Skip Fields**: Leave dropdown as "-- Not Mapped --" if column doesn't exist

**Customize:**
- Change **Table Name** (default: `pensioner_data`)
- Change **Database Name** (default: `newdatabase.db`)

### **Step 4: Create Database**

1. Review your mappings
2. Click **"✅ Create Database & Import Data"**
3. Wait for progress bar to complete
4. View success message with statistics:
   - Database path
   - Tables created
   - Records inserted

### **Step 5: View Statistics**

After database creation, click **"📊 View Pincode Statistics"** to see:
- Top 50 pincodes by pensioner count
- Total pensioners per pincode
- Age category breakdown
- Number of banks per pincode

---

## 🔍 Query the Database

### Using Python Script

```bash
python3 query_pincode_stats.py newdatabase.db
```

**Interactive Commands:**
- Type a **6-digit pincode** (e.g., `110001`) to see detailed statistics
- Type **`bank:BankName`** (e.g., `bank:SBI`) to see bank-wise statistics
- Type **`export`** to export data to CSV
- Type **`quit`** to exit

**Example Session:**
```
> 110001
DETAILED STATISTICS FOR PINCODE: 110001
🏦 Banks serving pincode 110001:
1. State Bank of India
   IFSC: SBIN0001234
   Location: Delhi, Delhi
   Age < 80: 1,234
   Age > 80: 567
   Total: 1,801

> bank:SBI
STATISTICS FOR BANK: State Bank of India
📍 Top 50 Pincodes for State Bank of India:
Rank   Pincode    Location                       Age<80       Age>80       Total
1      110001     Delhi, Delhi                    1,234          567        1,801
...

> export
📤 Exporting data to pincode_stats.csv...
✓ Exported 15,234 records to pincode_stats.csv

> quit
```

### Using SQLite Directly

```bash
sqlite3 newdatabase.db
```

**Example Queries:**

```sql
-- Get total pensioners by pincode
SELECT pincode, SUM(grand_total) as total
FROM pensioner_data
GROUP BY pincode
ORDER BY total DESC
LIMIT 20;

-- Get bank-wise distribution
SELECT bank_name, COUNT(DISTINCT pincode) as pincodes, SUM(grand_total) as total
FROM pensioner_data
GROUP BY bank_name
ORDER BY total DESC;

-- Get age category statistics
SELECT 
    SUM(age_less_than_80) as age_less_80,
    SUM(age_more_than_80) as age_more_80,
    SUM(grand_total) as total
FROM pensioner_data;

-- Get state-wise statistics
SELECT state, COUNT(DISTINCT pincode) as pincodes, SUM(grand_total) as total
FROM pensioner_data
WHERE state IS NOT NULL
GROUP BY state
ORDER BY total DESC;
```

---

## 📊 API Endpoints

### 1. List Excel Files
```
GET /api/excel/files
```

**Response:**
```json
{
  "success": true,
  "count": 32,
  "files": [
    {
      "name": "SBI.xlsx",
      "path": "/path/to/file",
      "size": 1234567,
      "sizeFormatted": "1.18 MB",
      "modified": "2024-10-22T10:30:00.000Z",
      "directory": "main"
    }
  ]
}
```

### 2. Analyze Excel File
```
POST /api/excel/analyze
Content-Type: application/json

{
  "filePath": "/path/to/excel/file.xlsx"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "fileName": "SBI.xlsx",
    "sheets": [
      {
        "name": "Sheet1",
        "rowCount": 1000,
        "columnCount": 10,
        "columns": [
          {
            "index": 0,
            "name": "Pincode",
            "dataType": "INTEGER",
            "sampleValues": ["110001", "110002"]
          }
        ],
        "detectedColumns": {
          "pincode": [...],
          "bank": [...],
          "age": [...]
        }
      }
    ]
  }
}
```

### 3. Create Database
```
POST /api/excel/create-database
Content-Type: application/json

{
  "databaseName": "newdatabase.db",
  "mappings": [
    {
      "fileName": "SBI.xlsx",
      "filePath": "/path/to/file",
      "sheetName": "Sheet1",
      "tableName": "pensioner_data",
      "headerRowIndex": 0,
      "columnMappings": [
        {
          "sourceColumnIndex": 0,
          "sourceColumnName": "Pincode",
          "targetColumn": "pincode",
          "dataType": "TEXT"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Database created successfully",
  "databasePath": "/path/to/newdatabase.db",
  "tablesCreated": 1,
  "recordsInserted": 15234
}
```

### 4. Query Pincode Statistics
```
POST /api/excel/query-pincode-stats
Content-Type: application/json

{
  "databasePath": "/path/to/newdatabase.db"
}
```

**Response:**
```json
{
  "success": true,
  "stats": [
    {
      "pincode": "110001",
      "totalPensioners": 1801,
      "ageLess80": 1234,
      "ageMore80": 567,
      "banks": [
        {
          "name": "State Bank of India",
          "pensioners": 1801,
          "ageLess80": 1234,
          "ageMore80": 567
        }
      ]
    }
  ]
}
```

---

## 🎯 Use Cases

### 1. **Pincode-wise Analysis**
Get complete statistics for any pincode:
- How many pensioners in pincode 110001?
- Which banks serve this pincode?
- Age distribution of pensioners

### 2. **Bank-wise Analysis**
Analyze bank distribution:
- Which pincodes does SBI serve?
- Total pensioners per bank
- Geographic coverage of each bank

### 3. **Age Category Analysis**
Understand age demographics:
- How many pensioners are above 80?
- Age distribution by pincode
- Age distribution by bank

### 4. **Geographic Analysis**
State and district-wise breakdown:
- Which states have most pensioners?
- District-wise distribution
- City-wise statistics

### 5. **Data Export**
Export filtered data for:
- Reports
- Presentations
- Further analysis in Excel
- Integration with other systems

---

## 🔧 Technical Details

### Database Schema

```sql
CREATE TABLE pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pincode TEXT,
    bank_name TEXT,
    bank_ifsc TEXT,
    state TEXT,
    district TEXT,
    city TEXT,
    age_less_than_80 INTEGER,
    age_more_than_80 INTEGER,
    age_not_available INTEGER,
    grand_total INTEGER,
    file_source TEXT,
    sheet_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pincode ON pensioner_data(pincode);
CREATE INDEX idx_bank ON pensioner_data(bank_name);
CREATE INDEX idx_state ON pensioner_data(state);
```

### File Structure

```
DLCServer/
├── excel-analyzer-api.js       # Backend API for Excel analysis
├── public/
│   └── excel-mapper.html       # Web interface
├── query_pincode_stats.py      # Python query tool
├── newdatabase.db              # Generated database
├── Excel Files/                # Source Excel files
│   ├── SBI.xlsx
│   ├── PNB.xlsx
│   └── 21Oct/                  # Subdirectory
│       └── more_files.xlsx
└── EXCEL_MAPPER_README.md      # This file
```

### Dependencies

**Node.js:**
- `express` - Web server
- `xlsx` - Excel file processing
- `sqlite3` - Database operations
- `body-parser` - Request parsing

**Python:**
- `sqlite3` - Database queries (built-in)
- `pandas` - Data analysis (optional)

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'xlsx'"
**Solution:**
```bash
npm install xlsx
```

### Issue: "Database file not found"
**Solution:**
- Make sure you've created the database first using the web interface
- Check the database name matches (default: `newdatabase.db`)
- Verify the file path

### Issue: "No data found for pincode"
**Solution:**
- Verify the pincode exists in your data
- Check if pincode column was properly mapped
- Ensure data was imported successfully

### Issue: "Excel file not loading"
**Solution:**
- Check file permissions
- Verify Excel file is not corrupted
- Ensure file is in `.xlsx` or `.xls` format

---

## 📝 Best Practices

1. **Before Creating Database:**
   - Review all column mappings carefully
   - Use "Auto" mapping first, then verify
   - Check sample data to ensure correct columns

2. **Column Mapping:**
   - Map at least: pincode, bank_name, grand_total
   - Age categories are optional but recommended
   - State/district help with geographic analysis

3. **Database Naming:**
   - Use descriptive names (e.g., `pensioners_2024.db`)
   - Include date if creating multiple versions
   - Avoid spaces in database names

4. **Data Quality:**
   - Verify pincode format (6 digits)
   - Check for missing values
   - Validate numeric fields

5. **Performance:**
   - For large files (>100MB), process in batches
   - Create indexes for frequently queried columns
   - Use the Python script for bulk queries

---

## 🎓 Examples

### Example 1: Complete Workflow

```bash
# 1. Start server
node server.js

# 2. Open browser
# Navigate to: http://localhost:9007/excel-mapper.html

# 3. Select files: SBI.xlsx, PNB.xlsx, HDFC.xlsx
# 4. Click "Analyze Selected Files"
# 5. Review detected columns
# 6. Click "Auto" for each field
# 7. Set table name: "pensioner_data"
# 8. Set database name: "pensioners_2024.db"
# 9. Click "Create Database & Import Data"
# 10. Wait for completion
# 11. Click "View Pincode Statistics"

# 12. Query using Python
python3 query_pincode_stats.py pensioners_2024.db
> 110001
> bank:SBI
> export
> quit
```

### Example 2: Custom Query

```python
import sqlite3

conn = sqlite3.connect('newdatabase.db')
cursor = conn.cursor()

# Get top 10 pincodes with highest pensioners above 80
query = """
SELECT pincode, bank_name, age_more_than_80
FROM pensioner_data
WHERE age_more_than_80 > 0
ORDER BY age_more_than_80 DESC
LIMIT 10
"""

cursor.execute(query)
for row in cursor.fetchall():
    print(f"Pincode: {row[0]}, Bank: {row[1]}, Age>80: {row[2]}")

conn.close()
```

---

## 📞 Support

For issues or questions:
1. Check this README
2. Review error messages in browser console
3. Check server logs
4. Verify Excel file format and structure

---

## 🎉 Success!

You now have a complete system to:
- ✅ Analyze Excel files
- ✅ Map columns to database
- ✅ Create custom databases
- ✅ Query pincode statistics
- ✅ Export data for reports

**Happy analyzing! 📊**
