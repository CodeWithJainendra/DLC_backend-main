# 📊 DLC Portal Data Processor - Complete Guide

## क्या है यह System?

Ye system **DLC Portal format** ke Excel files ko process karta hai aur:

1. ✅ **PPO Number** se duplicate check karta hai
2. ✅ **Year of Birth** se age calculate karta hai
3. ✅ **Pincode** se District/State map karta hai
4. ✅ **PSA details** ko parse karta hai (Division, Area, Pincode)
5. ✅ **Age categories** mein data organize karta hai
6. ✅ **Pincode-wise, District-wise, State-wise** analysis provide karta hai

---

## 🚀 Quick Start

### **Step 1: Dependencies Install Karein**

```bash
pip3 install pandas openpyxl
```

### **Step 2: Quick Start Script Run Karein**

```bash
cd /data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata
chmod +x quick_start.sh
./quick_start.sh
```

**Menu Options:**
1. Single file process karein
2. Sabhi DLC Portal files batch mein process karein
3. Database query karein
4. Statistics dekhein
5. Exit

---

## 📋 Supported File Format

### **Expected Columns:**

```
S. No | PPO No. | Year of Birth | Pension Sanctioning Authority | Address PinCode of Pension Disbursing Branch | Postal Address PinCode of pensioner
```

### **Example Data:**

```
1 | POSTAL/2013/MA/6 | 21-01-1946 | SPOs,Goalpara Div, Dhubri-783301 | Dhubri H.O , Pin- 783301 | Dhubri H.O , Pin- 783301
2 | POSTAL/2013/MA/130 | 02-01-1953 | SPOs,Goalpara Div, Dhubri-783301 | Dhubri H.O , Pin- 783301 | Dhubri H.O , Pin- 783301
```

### **Flexible Column Names:**

System automatically detect karta hai:
- **PPO Number**: "PPO No.", "PPO_NUM", "PPO Number"
- **Year of Birth**: "Year of Birth", "Date of Birth", "DOB"
- **PSA**: "Pension Sanctioning Authority", "PSA"
- **Branch Pincode**: "Address PinCode of Pension Disbursing Branch", "Branch PIN"
- **Pensioner Pincode**: "Postal Address PinCode of pensioner", "Pensioner PIN"

---

## 💾 Database Schema

### **Main Table: `dlc_pensioner_data`**

```sql
- ppo_number (UNIQUE)          -- PPO Number
- year_of_birth                -- Original birth date/year text
- birth_year                   -- Calculated year (INTEGER)
- age                          -- Current age
- age_category                 -- AGE_LESS_THAN_60, AGE_60_TO_70, etc.

-- PSA Details
- psa_full                     -- Full PSA text
- psa_type                     -- SPOs, A.G., etc.
- psa_division                 -- Division name
- psa_area                     -- Area name
- psa_pincode                  -- PSA pincode

-- Pincode Details
- branch_pincode               -- Original branch pincode text
- branch_pincode_clean         -- Extracted 6-digit pincode
- pensioner_pincode            -- Original pensioner pincode text
- pensioner_pincode_clean      -- Extracted 6-digit pincode

-- Location (from pincode mapping)
- pensioner_district
- pensioner_state
- branch_district
- branch_state

-- Metadata
- file_source                  -- Source Excel file name
- sheet_source                 -- Sheet name
- created_at
- updated_at
```

### **Summary Table: `pincode_summary`**

```sql
- pincode
- district
- state
- total_pensioners
- age_less_than_60
- age_60_to_70
- age_70_to_80
- age_more_than_80
- age_not_available
```

---

## 🎯 Usage Examples

### **Example 1: Single File Process**

```bash
python3 dlc_portal_processor.py "../Excel Files/21Oct/ASSAM DLC PORTAL DATA.xlsx" "Sheet1"
```

### **Example 2: Batch Processing**

```bash
python3 process_all_dlc_files.py
```

**Ye process karega:**
- ASSAM DLC PORTAL DATA.xlsx
- BIHAR DLC PORTAL DATA.xlsx
- CHHATTISGARH DLC PORTAL DATA.xlsx
- GUJARAT DLC PORTAL DATA.xlsx
- JHARKHAND DLC PORTAL DATA.xlsx
- KARNATAKA DLC PORTAL DATA.xlsx
- PUNJAB DLC PORTAL DATA.xlsx
- TELANGANA DLC PORTAL DATA.xlsx
- UP DLC PORTAL DATA.xlsx
- NE DLC PORTAL DATA.xlsx

### **Example 3: Query Database**

```bash
python3 query_dlc_data.py
```

**Interactive Commands:**

```bash
> pincode:783301          # Pincode 783301 ki details
> district:Dhubri         # Dhubri district ki details
> state:Assam             # Assam state ki details
> psa:SPOs                # SPOs PSA type ki details
> age                     # Age analysis
> export                  # CSV mein export
> quit                    # Exit
```

---

## 📊 Query Examples

### **1. Pincode-wise Analysis**

```bash
> pincode:783301

PENSIONERS IN PINCODE: 783301
================================================================================

📍 Location: Dhubri, Assam
👥 Total Pensioners: 1,234

📊 Age Category Breakdown:
  Age < 60:  123
  Age 60-70: 456
  Age 70-80: 543
  Age > 80:  112
  Age N/A:   0

🏛️  PSA Type Breakdown:
  SPOs: 1,234
```

### **2. District-wise Analysis**

```bash
> district:Dhubri

DISTRICT ANALYSIS: DHUBRI
================================================================================

👥 Total Pensioners: 5,678

📍 Pincode-wise Breakdown:
Pincode    Total      <60      60-70    70-80    >80
----------------------------------------------------------
783301     1234       123      456      543      112
783302     987        98       345      432      112
```

### **3. State-wise Analysis**

```bash
> state:Assam

STATE ANALYSIS: ASSAM
================================================================================

👥 Total Pensioners: 25,432

🏛️  District-wise Breakdown:
  1. Dhubri: 5,678
  2. Guwahati: 4,567
  3. Jorhat: 3,456
  ...

📊 Age Category Breakdown:
  AGE_70_TO_80: 8,765
  AGE_60_TO_70: 7,654
  AGE_MORE_THAN_80: 5,432
  AGE_LESS_THAN_60: 3,581
```

### **4. PSA Type Analysis**

```bash
> psa:SPOs

PSA ANALYSIS: SPOS
================================================================================

👥 Total Pensioners: 15,432

🗺️  State-wise Breakdown:
  1. Assam: 5,678
  2. Bihar: 4,567
  3. West Bengal: 3,456
  ...
```

---

## 🔧 Features

### **1. Age Calculation**

System automatically calculate karta hai age from various formats:

```python
# Format 1: DD-MM-YYYY
"21-01-1946" → 1946 → Age: 78

# Format 2: Excel Date
18678 → 1951 → Age: 73

# Format 3: Direct Year
1946 → Age: 78
```

### **2. Age Categories**

```
AGE_LESS_THAN_60    - < 60 years
AGE_60_TO_70        - 60-70 years
AGE_70_TO_80        - 70-80 years
AGE_MORE_THAN_80    - > 80 years
AGE_NOT_AVAILABLE   - Birth year not available
```

### **3. PSA Parsing**

```
Input: "SPOs,Goalpara Div, Dhubri-783301"

Output:
- psa_type: "SPOs"
- psa_division: "Goalpara Div"
- psa_area: "Dhubri"
- psa_pincode: "783301"
```

### **4. Pincode Extraction**

```
Input: "Dhubri H.O , Pin- 783301"
Output: "783301"

Input: "Pin-110001"
Output: "110001"
```

### **5. Duplicate Prevention**

```python
# PPO Number se check
if check_duplicate("POSTAL/2013/MA/6"):
    skip_record()
else:
    insert_record()
```

---

## 📈 Statistics Available

### **Overall Statistics:**
- Total pensioners
- Age category breakdown
- Top pincodes
- PSA type distribution

### **Pincode-wise:**
- Total pensioners per pincode
- Age distribution
- PSA types
- District/State mapping

### **District-wise:**
- Total pensioners per district
- Pincode breakdown
- Age distribution

### **State-wise:**
- Total pensioners per state
- District breakdown
- Age distribution

### **PSA-wise:**
- Total pensioners per PSA type
- State distribution
- Division breakdown

---

## 🗂️ File Structure

```
Insertexceldata/
├── dlc_portal_processor.py      # Main processor
├── process_all_dlc_files.py     # Batch processor
├── query_dlc_data.py             # Query tool
├── quick_start.sh                # Quick start script
├── README_DLC_PORTAL.md          # This file
└── dlc_portal_database.db        # Generated database
```

---

## 💡 Pro Tips

### **1. Pincode Mapping Expand Karein**

File mein pincode mapping add karein:

```python
# dlc_portal_processor.py mein
self.pincode_mapping = {
    '783301': {'district': 'Dhubri', 'state': 'Assam'},
    '110001': {'district': 'New Delhi', 'state': 'Delhi'},
    # Add more...
}
```

### **2. Custom Age Categories**

Age categories customize kar sakte hain:

```python
def get_age_category(self, age):
    if age < 60:
        return 'AGE_LESS_THAN_60'
    elif 60 <= age < 70:
        return 'AGE_60_TO_70'
    # Customize as needed
```

### **3. CSV Export**

Data export karein analysis ke liye:

```bash
python3 query_dlc_data.py
> export
```

### **4. Batch Processing**

Sabhi files ek saath process karein:

```bash
python3 process_all_dlc_files.py
```

---

## 🐛 Troubleshooting

### **Problem: "pandas not found"**

```bash
pip3 install pandas openpyxl
```

### **Problem: "File not found"**

```bash
# Check file path
ls -la "../Excel Files/21Oct/"

# Use absolute path
python3 dlc_portal_processor.py "/full/path/to/file.xlsx"
```

### **Problem: "Column not detected"**

```bash
# Check column names in Excel
# System automatically detects variations
# If still not working, check detect_columns() function
```

### **Problem: "Duplicate PPO numbers"**

```bash
# This is expected - duplicates are automatically skipped
# Check logs for count of duplicates
```

---

## 📊 Expected Results

### **After Processing All Files:**

```
Total Pensioners: ~100,000+
Unique Pincodes: ~5,000+
States Covered: 10+
Districts: 200+
PSA Types: 20+

Age Distribution:
- Age < 60: ~15%
- Age 60-70: ~25%
- Age 70-80: ~35%
- Age > 80: ~25%
```

---

## 🎯 Use Cases

### **1. Pincode-wise Analysis**
- Kis pincode mein kitne pensioners?
- Age distribution kya hai?
- Kaun se PSA types hain?

### **2. District-wise Planning**
- District mein total pensioners
- Pincode-wise breakdown
- Resource allocation planning

### **3. State-wise Reports**
- State-level statistics
- District comparison
- Age demographics

### **4. PSA-wise Tracking**
- PSA type-wise distribution
- Geographic coverage
- Division-wise breakdown

### **5. Age-based Analysis**
- Senior citizens (>80) identification
- Age category distribution
- State-wise age demographics

---

## 🚀 Next Steps

1. ✅ Install dependencies
2. ✅ Run quick_start.sh
3. ✅ Process your Excel files
4. ✅ Query and analyze data
5. ✅ Export reports

---

## 📞 Support

Koi problem ho toh:
1. README phir se padhein
2. Error messages check karein
3. File format verify karein
4. Column names check karein

---

## 🎉 Success!

Aapke paas ab hai:
- ✅ Complete DLC Portal data processor
- ✅ Duplicate prevention
- ✅ Age calculation
- ✅ Pincode/District/State mapping
- ✅ Interactive query tool
- ✅ CSV export capability

**Happy Processing! 📊🎉**
