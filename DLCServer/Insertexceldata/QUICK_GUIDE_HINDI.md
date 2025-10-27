# 🚀 DLC Portal Processor - Quick Guide (Hindi)

## ✅ Kya Bana Hai?

Aapke liye **complete system** bana diya hai jo:

1. ✅ **DLC Portal Excel files** ko process karta hai
2. ✅ **PPO Number** se duplicate check karta hai (double insertion nahi hoga)
3. ✅ **Year of Birth** se age calculate karta hai
4. ✅ **Pincode** se District/State map karta hai
5. ✅ **PSA details** parse karta hai (SPOs, Division, Area, Pincode)
6. ✅ **Age categories** mein organize karta hai (<60, 60-70, 70-80, >80)
7. ✅ **Pincode-wise, District-wise, State-wise** analysis deta hai

---

## 📁 Files Jo Bani Hain

```
/data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata/
├── dlc_portal_processor.py      ← Main processor (single file)
├── process_all_dlc_files.py     ← Batch processor (all files)
├── query_dlc_data.py             ← Query tool (interactive)
├── quick_start.sh                ← Quick start script
├── README_DLC_PORTAL.md          ← Complete documentation
└── QUICK_GUIDE_HINDI.md          ← Ye file
```

---

## 🚀 Kaise Use Karein (3 Steps)

### **Step 1: Dependencies Install Karein**

```bash
pip3 install pandas openpyxl
```

### **Step 2: Quick Start Script Run Karein**

```bash
cd /data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata
./quick_start.sh
```

### **Step 3: Option Select Karein**

```
1. Single file process karein
2. Sabhi DLC Portal files batch mein process karein  ← Recommended
3. Database query karein
4. Statistics dekhein
5. Exit
```

---

## 📊 Data Format Jo Support Karta Hai

### **Your Data Format:**

```
S. No | PPO No. | Year of Birth | Pension Sanctioning Authority | Address PinCode of Pension Disbursing Branch | Postal Address PinCode of pensioner
1 | POSTAL/2013/MA/6 | 21-01-1946 | SPOs,Goalpara Div, Dhubri-783301 | Dhubri H.O , Pin- 783301 | Dhubri H.O , Pin- 783301
```

### **Kya Extract Hoga:**

```
✅ PPO Number: POSTAL/2013/MA/6
✅ Birth Year: 1946 (from 21-01-1946)
✅ Age: 78 years (calculated)
✅ Age Category: AGE_70_TO_80
✅ PSA Type: SPOs
✅ PSA Division: Goalpara Div
✅ PSA Area: Dhubri
✅ PSA Pincode: 783301
✅ Branch Pincode: 783301
✅ Pensioner Pincode: 783301
✅ District: Dhubri (from pincode mapping)
✅ State: Assam (from pincode mapping)
```

---

## 🎯 Main Features

### **1. Duplicate Prevention** ✅

```python
# PPO Number se check karta hai
# Agar already exist karta hai toh skip kar deta hai
# Double insertion NAHI hoga
```

### **2. Age Calculation** ✅

```python
# Year of Birth se age calculate
# Multiple formats support:
- "21-01-1946" → 1946 → Age: 78
- "1946" → Age: 78
- Excel date (18678) → Age: 73

# Age Categories:
- AGE_LESS_THAN_60
- AGE_60_TO_70
- AGE_70_TO_80
- AGE_MORE_THAN_80
- AGE_NOT_AVAILABLE
```

### **3. PSA Parsing** ✅

```python
# Input: "SPOs,Goalpara Div, Dhubri-783301"
# Output:
- PSA Type: SPOs
- Division: Goalpara Div
- Area: Dhubri
- Pincode: 783301
```

### **4. Pincode Extraction** ✅

```python
# Automatically extract karta hai:
"Dhubri H.O , Pin- 783301" → "783301"
"Pin-110001" → "110001"
"783301" → "783301"
```

### **5. Location Mapping** ✅

```python
# Pincode se District/State map karta hai
Pincode: 783301 → District: Dhubri, State: Assam
Pincode: 110001 → District: New Delhi, State: Delhi
```

---

## 💻 Usage Examples

### **Example 1: Single File Process**

```bash
python3 dlc_portal_processor.py "../Excel Files/21Oct/ASSAM DLC PORTAL DATA.xlsx" "Sheet1"
```

**Output:**
```
================================================================================
Processing: ASSAM DLC PORTAL DATA.xlsx
================================================================================
✓ Loaded 5,962 rows
✓ Columns: ['S. No', 'PPO No.', 'Year of Birth', ...]

✓ Column Mapping:
  ppo: PPO No.
  yob: Year of Birth
  psa: Pension Sanctioning Authority
  branch_pin: Address PinCode of Pension Disbursing Branch
  pensioner_pin: Postal Address PinCode of pensioner

  Processed 5000 records...

================================================================================
PROCESSING COMPLETE
================================================================================
✓ Inserted: 5,962 records
⚠ Duplicates skipped: 0
✗ Errors: 0
================================================================================
```

### **Example 2: Batch Processing (All Files)**

```bash
python3 process_all_dlc_files.py
```

**Ye process karega:**
- ASSAM DLC PORTAL DATA.xlsx (5,962 records)
- BIHAR DLC PORTAL DATA.xlsx (10,239 records)
- CHHATTISGARH DLC PORTAL DATA.xlsx (2,559 records)
- GUJARAT DLC PORTAL DATA.xlsx (16,618 records)
- JHARKHAND DLC PORTAL DATA.xlsx (4,116 records)
- KARNATAKA DLC PORTAL DATA.xlsx (9,450 records)
- PUNJAB DLC PORTAL DATA.xlsx
- TELANGANA DLC PORTAL DATA.xlsx (8,116 records)
- UP DLC PORTAL DATA.xlsx (23,692 records)
- NE DLC PORTAL DATA.xlsx

**Total: ~100,000+ records**

### **Example 3: Query Database**

```bash
python3 query_dlc_data.py
```

**Interactive Mode:**

```bash
> pincode:783301
📍 Location: Dhubri, Assam
👥 Total Pensioners: 1,234
📊 Age < 60: 123, Age 60-70: 456, Age 70-80: 543, Age > 80: 112

> district:Dhubri
👥 Total Pensioners: 5,678
📍 Pincode-wise Breakdown:
  783301: 1,234 pensioners
  783302: 987 pensioners

> state:Assam
👥 Total Pensioners: 25,432
🏛️  District-wise Breakdown:
  1. Dhubri: 5,678
  2. Guwahati: 4,567

> psa:SPOs
👥 Total Pensioners: 15,432
🗺️  State-wise Breakdown:
  1. Assam: 5,678
  2. Bihar: 4,567

> age
📊 Age Category Breakdown:
  AGE_70_TO_80: 35,432 (35%)
  AGE_60_TO_70: 25,678 (26%)
  AGE_MORE_THAN_80: 20,123 (20%)

> export
📤 Exporting to dlc_export.csv...
✓ Export complete!

> quit
```

---

## 📊 Database Schema

### **Main Table: `dlc_pensioner_data`**

```sql
-- Pensioner Details
ppo_number (UNIQUE)          -- Duplicate prevention
year_of_birth                -- Original text
birth_year                   -- Calculated year
age                          -- Current age
age_category                 -- Category

-- PSA Details
psa_full                     -- Full PSA text
psa_type                     -- SPOs, A.G., etc.
psa_division                 -- Division
psa_area                     -- Area
psa_pincode                  -- PSA pincode

-- Location
pensioner_pincode_clean      -- 6-digit pincode
pensioner_district           -- District
pensioner_state              -- State
branch_pincode_clean         -- Branch pincode
branch_district              -- Branch district
branch_state                 -- Branch state

-- Metadata
file_source                  -- Source file
sheet_source                 -- Sheet name
created_at                   -- Timestamp
```

### **Summary Table: `pincode_summary`**

```sql
pincode
district
state
total_pensioners
age_less_than_60
age_60_to_70
age_70_to_80
age_more_than_80
age_not_available
```

---

## 🎯 Queries Jo Kar Sakte Hain

### **1. Pincode-wise Analysis**
```bash
> pincode:783301
```
- Kitne pensioners?
- Age distribution?
- PSA types?

### **2. District-wise Analysis**
```bash
> district:Dhubri
```
- Total pensioners
- Pincode breakdown
- Age distribution

### **3. State-wise Analysis**
```bash
> state:Assam
```
- Total pensioners
- District breakdown
- Age demographics

### **4. PSA-wise Analysis**
```bash
> psa:SPOs
```
- Total pensioners
- State distribution
- Division breakdown

### **5. Age Analysis**
```bash
> age
```
- Overall age distribution
- Percentage breakdown
- Average age by state

### **6. Export to CSV**
```bash
> export
```
- Complete data export
- Ready for Excel/reports

---

## 💡 Important Points

### **✅ Duplicate Prevention**
- PPO Number se check hota hai
- Agar already exist hai toh skip kar deta hai
- **Double insertion NAHI hoga**

### **✅ Age Calculation**
- Year of Birth se automatic calculate
- Multiple formats support
- Age categories mein organize

### **✅ Pincode Mapping**
- Automatic pincode extraction
- District/State mapping
- Branch aur Pensioner dono pincodes

### **✅ PSA Parsing**
- Type, Division, Area, Pincode
- Hierarchy maintain karta hai
- Flexible parsing

### **✅ Data Quality**
- Error handling
- Validation
- Progress tracking

---

## 🔧 Customization

### **Pincode Mapping Add Karein**

File: `dlc_portal_processor.py`

```python
def load_pincode_mapping(self):
    return {
        '783301': {'district': 'Dhubri', 'state': 'Assam'},
        '110001': {'district': 'New Delhi', 'state': 'Delhi'},
        # Apne pincodes add karein
        '400001': {'district': 'Mumbai', 'state': 'Maharashtra'},
        '560001': {'district': 'Bangalore', 'state': 'Karnataka'},
    }
```

### **Age Categories Customize Karein**

```python
def get_age_category(self, age):
    if age < 60:
        return 'AGE_LESS_THAN_60'
    elif 60 <= age < 70:
        return 'AGE_60_TO_70'
    # Apne categories add karein
```

---

## 📈 Expected Results

### **After Processing All Files:**

```
✅ Total Records: ~100,000+
✅ Unique Pincodes: ~5,000+
✅ States: 10+
✅ Districts: 200+
✅ PSA Types: 20+
✅ Duplicates Prevented: Automatic
✅ Age Calculated: 100%
✅ Location Mapped: Based on pincode database
```

---

## 🎉 Summary

### **Aapke Paas Hai:**

1. ✅ **dlc_portal_processor.py** - Single file processor
2. ✅ **process_all_dlc_files.py** - Batch processor
3. ✅ **query_dlc_data.py** - Interactive query tool
4. ✅ **quick_start.sh** - Easy start script
5. ✅ **Complete documentation** - README files

### **Features:**

1. ✅ Duplicate prevention (PPO Number)
2. ✅ Age calculation (Year of Birth)
3. ✅ Pincode mapping (District/State)
4. ✅ PSA parsing (Type/Division/Area)
5. ✅ Age categories (<60, 60-70, 70-80, >80)
6. ✅ Multi-level analysis (Pincode/District/State/PSA)
7. ✅ CSV export
8. ✅ Interactive queries

---

## 🚀 Ab Kya Karein?

### **Step 1: Install Dependencies**
```bash
pip3 install pandas openpyxl
```

### **Step 2: Run Quick Start**
```bash
cd /data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata
./quick_start.sh
```

### **Step 3: Select Option 2 (Batch Processing)**
```
Enter your choice (1-5): 2
```

### **Step 4: Wait for Processing**
```
Processing ASSAM DLC PORTAL DATA.xlsx...
Processing BIHAR DLC PORTAL DATA.xlsx...
...
```

### **Step 5: Query Data**
```bash
python3 query_dlc_data.py
> pincode:783301
> district:Dhubri
> state:Assam
> export
```

---

**All the Best! 🎉📊**

Koi problem ho toh README_DLC_PORTAL.md dekhen ya mujhe batayein!
