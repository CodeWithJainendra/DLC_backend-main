# Pincode-Based Pensioner Data API Documentation

## Overview
Comprehensive API endpoints for fetching pensioner data based on pincodes, states, and districts. All data is extracted from Excel files and existing database tables.

## Database Tables

### 1. `pincode_master`
Master table containing all unique pincodes with location information.
- `pincode` - 6-digit pincode
- `state` - State name
- `district` - District name
- `city` - City name
- `region` - Region information
- `data_source` - Source of data (Excel/Database)

### 2. `pensioner_pincode_data`
Detailed pensioner data for each pincode.
- `pincode` - 6-digit pincode
- `state`, `district`, `city` - Location details
- `bank_name`, `bank_ifsc` - Bank information
- `total_pensioners` - Total count
- `age_less_than_80`, `age_more_than_80`, `age_not_available` - Age distribution
- `data_source`, `file_name`, `sheet_name` - Data source tracking

### 3. `pincode_statistics`
Aggregated statistics for each pincode.
- `pincode` - 6-digit pincode
- `state`, `district` - Location
- `total_pensioners` - Total pensioner count
- `total_banks` - Number of unique banks
- `total_branches` - Number of unique branches

## API Endpoints

### 1. Get All Pincodes with Statistics
```
GET /api/pincode/pincodes
```

**Query Parameters:**
- `state` (optional) - Filter by state name
- `district` (optional) - Filter by district name
- `limit` (optional, default: 100) - Number of results per page
- `offset` (optional, default: 0) - Pagination offset

**Example:**
```bash
curl "http://localhost:9007/api/pincode/pincodes?state=PUNJAB&limit=20"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "pincode": "110001",
      "state": "DELHI",
      "district": "NEW DELHI",
      "total_pensioners": 5000,
      "total_banks": 5,
      "total_branches": 10,
      "city": "New Delhi",
      "region": "North"
    }
  ],
  "pagination": {
    "total": 35485,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 2. Get Pincode Details
```
GET /api/pincode/pincodes/:pincode
```

**Example:**
```bash
curl "http://localhost:9007/api/pincode/pincodes/110001"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pincode": "110001",
    "state": "DELHI",
    "district": "NEW DELHI",
    "city": "New Delhi",
    "region": "North",
    "total_pensioners": 5000,
    "total_banks": 5,
    "total_branches": 10,
    "details": [
      {
        "bank_name": "State Bank of India",
        "bank_ifsc": "SBIN0001234",
        "total_pensioners": 2000,
        "age_less_than_80": 1500,
        "age_more_than_80": 400,
        "age_not_available": 100,
        "data_source": "Excel",
        "file_name": "SBI.xlsx"
      }
    ]
  }
}
```

---

### 3. Get State-wise Summary
```
GET /api/pincode/states/summary
```

**Example:**
```bash
curl "http://localhost:9007/api/pincode/states/summary"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "state": "GUJARAT",
      "total_pincodes": 1527,
      "total_pensioners": 132978,
      "total_banks": 25,
      "total_branches": 450
    }
  ]
}
```

---

### 4. Get Districts for a State
```
GET /api/pincode/states/:state/districts
```

**Example:**
```bash
curl "http://localhost:9007/api/pincode/states/PUNJAB/districts"
```

**Response:**
```json
{
  "success": true,
  "state": "PUNJAB",
  "data": [
    {
      "district": "LUDHIANA",
      "total_pincodes": 150,
      "total_pensioners": 8000,
      "total_banks": 10,
      "total_branches": 50
    }
  ]
}
```

---

### 5. Search Pincodes
```
GET /api/pincode/pincodes/search/:query
```

**Example:**
```bash
curl "http://localhost:9007/api/pincode/pincodes/search/110"
curl "http://localhost:9007/api/pincode/pincodes/search/DELHI"
```

**Response:**
```json
{
  "success": true,
  "query": "110",
  "data": [
    {
      "pincode": "110001",
      "state": "DELHI",
      "district": "NEW DELHI",
      "total_pensioners": 5000,
      "total_banks": 5,
      "city": "New Delhi"
    }
  ]
}
```

---

### 6. Get Pensioners by Pincode from All Tables
```
GET /api/pincode/pincodes/:pincode/pensioners
```

**Query Parameters:**
- `source` (optional) - Filter by data source: `bank`, `doppw`, `dot`, `ubi`

**Example:**
```bash
curl "http://localhost:9007/api/pincode/pincodes/110001/pensioners"
curl "http://localhost:9007/api/pincode/pincodes/110001/pensioners?source=bank"
```

**Response:**
```json
{
  "success": true,
  "pincode": "110001",
  "data": {
    "bank_pensioner_data": [
      {
        "source": "bank",
        "bank_name": "State Bank of India",
        "bank_ifsc": "SBIN0001234",
        "bank_state": "DELHI",
        "bank_city": "NEW DELHI",
        "age_less_than_80": 1500,
        "age_more_than_80": 400,
        "age_not_available": 100,
        "total": 2000
      }
    ],
    "doppw_pensioner_data": [...],
    "dot_pensioner_data": [...],
    "ubi1_pensioner_data": [...],
    "ubi3_pensioner_data": [...]
  }
}
```

---

### 7. Get Top Pincodes
```
GET /api/pincode/top/pincodes
```

**Query Parameters:**
- `limit` (optional, default: 20) - Number of top pincodes to return

**Example:**
```bash
curl "http://localhost:9007/api/pincode/top/pincodes?limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "pincode": "600028",
      "state": "TAMILNADU",
      "district": "CHENNAI",
      "total_pensioners": 45220,
      "total_banks": 4,
      "total_branches": 8,
      "city": "Chennai"
    }
  ]
}
```

---

## Data Processing

### Processing Script
Run the comprehensive pincode processor to extract and update all pincode data:

```bash
python3 comprehensive_pincode_processor.py
```

This script:
1. ✅ Processes all Excel files in `Excel Files/` directory
2. ✅ Processes all Excel files in `Excel Files/21Oct/` subdirectory
3. ✅ Extracts pincode data from existing database tables:
   - `bank_pensioner_data`
   - `doppw_pensioner_data`
   - `dot_pensioner_data`
   - `ubi1_pensioner_data`
   - `ubi3_pensioner_data`
4. ✅ Updates `pincode_master`, `pensioner_pincode_data`, and `pincode_statistics` tables
5. ✅ Generates comprehensive reports

### Current Statistics (as of last run)
- **Total Unique Pincodes:** 35,485
- **Total Pincode Records:** 5,408,492
- **Total Pensioners:** 1,049,686
- **Excel Files Processed:** 28
- **Database Records Processed:** 107,242

### Top States by Pincode Count
1. Gujarat: 1,527 pincodes, 132,978 pensioners
2. Punjab: 1,339 pincodes, 55,235 pensioners
3. Uttar Pradesh: 1,261 pincodes, 87,661 pensioners
4. Maharashtra: 1,230 pincodes, 70,976 pensioners
5. Assam: 1,090 pincodes, 24,299 pensioners

### Top Pincodes by Pensioner Count
1. **600028** (Tamil Nadu, Chennai): 45,220 pensioners
2. **400054** (Maharashtra, Mumbai): 37,938 pensioners
3. **380001** (Gujarat): 28,253 pensioners
4. **560001** (Bangalore): 26,062 pensioners
5. **695033** (Kerala, Trivandrum): 23,670 pensioners

---

## Usage Examples

### Frontend Integration

```javascript
// Get all pincodes for a state
async function getPincodesForState(state) {
  const response = await fetch(`/api/pincode/pincodes?state=${state}&limit=1000`);
  const data = await response.json();
  return data.data;
}

// Get pincode details
async function getPincodeDetails(pincode) {
  const response = await fetch(`/api/pincode/pincodes/${pincode}`);
  const data = await response.json();
  return data.data;
}

// Search pincodes
async function searchPincodes(query) {
  const response = await fetch(`/api/pincode/pincodes/search/${query}`);
  const data = await response.json();
  return data.data;
}

// Get state summary
async function getStateSummary() {
  const response = await fetch('/api/pincode/states/summary');
  const data = await response.json();
  return data.data;
}
```

### Python Integration

```python
import requests

BASE_URL = "http://localhost:9007/api/pincode"

# Get pincodes for a state
def get_pincodes_for_state(state):
    response = requests.get(f"{BASE_URL}/pincodes", params={"state": state, "limit": 1000})
    return response.json()

# Get pincode details
def get_pincode_details(pincode):
    response = requests.get(f"{BASE_URL}/pincodes/{pincode}")
    return response.json()

# Search pincodes
def search_pincodes(query):
    response = requests.get(f"{BASE_URL}/pincodes/search/{query}")
    return response.json()
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

HTTP Status Codes:
- `200` - Success
- `404` - Resource not found
- `500` - Internal server error

---

## Notes

1. **Data Sources:** Data is collected from:
   - Excel files in `Excel Files/` directory
   - Excel files in `Excel Files/21Oct/` subdirectory
   - Existing database tables (bank_pensioner_data, doppw_pensioner_data, etc.)

2. **Pincode Validation:** All pincodes are validated to be 6-digit Indian pincodes

3. **State Mapping:** States are automatically mapped from pincode first digit when not available in data

4. **Performance:** Indexes are created on pincode, state, and district columns for fast queries

5. **Updates:** Run `comprehensive_pincode_processor.py` to refresh data from new Excel files

---

## Support

For issues or questions, contact the development team.
