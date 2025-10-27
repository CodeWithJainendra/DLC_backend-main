# Quick Start Guide - Pincode Pensioner Processor

## 🚀 In 3 Simple Steps

### Step 1: Install Dependencies (if not already installed)
```bash
npm install xlsx sqlite3
```

### Step 2: Run the Processor
```bash
cd /data1/jainendra/DLC_backend-main/scripts
node pincode_pensioner_processor.js "path/to/your/excel/file.xlsx"
```

### Step 3: View Results
```bash
sqlite3 ../DLC_Database.db "SELECT * FROM state_pensioner_summary;"
```

---

## 📋 Your Excel File Should Have

| Required Column | Example Value |
|----------------|---------------|
| PPO No. | POSTAL/2013/MA/6 |
| Year of Birth | 21-01-1946 |
| Pension Sanctioning Authority | SPOs,Goalpara Div, Dhubri-783301 |
| Address PinCode of Pension Disbursing Branch | Dhubri H.O , Pin- 783301 |
| Postal Address PinCode of pensioner | Dhubri H.O , Pin- 783301 |

---

## 🧪 Test First (Optional)

```bash
cd /data1/jainendra/DLC_backend-main/scripts
node test_pincode_processor.js
```

This creates sample data and tests everything.

---

## 📊 What You Get

### 7 Database Tables:

1. **pensioner_pincode_data** - All pensioner details
2. **state_pensioner_summary** - State-wise totals
3. **district_pensioner_summary** - District-wise totals
4. **pincode_pensioner_summary** - Pincode-wise totals
5. **age_category_summary** - Age distribution
6. **psa_summary** - PSA office distribution
7. **disbursing_branch_summary** - Bank branch distribution

---

## 🔍 Quick Queries

### How many pensioners per state?
```sql
SELECT state, total_pensioners, total_districts, total_pincodes 
FROM state_pensioner_summary;
```

### How many pensioners in a specific pincode?
```sql
SELECT * FROM pincode_pensioner_summary 
WHERE pincode = '783301';
```

### Age distribution?
```sql
SELECT age_category, SUM(total_pensioners) as total
FROM age_category_summary
GROUP BY age_category;
```

---

## ✅ Features

- ✅ **Duplicate Prevention** - PPO numbers are unique
- ✅ **Age Calculation** - Automatic from date of birth
- ✅ **State/District Extraction** - From pincode and PSA
- ✅ **Comprehensive Analytics** - 7 summary tables
- ✅ **Error Handling** - Skips bad rows, continues processing
- ✅ **Progress Tracking** - Shows progress every 100 rows

---

## 📁 Files Location

- **Processor:** `/scripts/pincode_pensioner_processor.js`
- **Mapping:** `/scripts/pincode_state_mapping.json`
- **Database:** `/DLC_Database.db`
- **Full Docs:** `/scripts/PINCODE_PROCESSOR_README.md`

---

## 🆘 Need Help?

Read the full documentation:
```bash
cat /data1/jainendra/DLC_backend-main/scripts/PINCODE_PROCESSOR_README.md
```

Or check the summary:
```bash
cat /data1/jainendra/DLC_backend-main/PINCODE_DATA_SYSTEM_SUMMARY.md
```

---

## 🎯 That's It!

You're ready to process pensioner data organized by State → District → Pincode!
