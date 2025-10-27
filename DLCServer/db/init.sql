-- Initialize all required tables for the DLC portal

-- DOPPW Pensioner Data Table
CREATE TABLE IF NOT EXISTS doppw_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pensioner_state TEXT,
    pensioner_district TEXT,
    pensioner_pincode TEXT,
    submitted_status TEXT,
    submission_mode TEXT,
    age INTEGER,
    escroll_cat TEXT,
    branch_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DOT Pensioner Data Table
CREATE TABLE IF NOT EXISTS dot_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pensioner_state TEXT,
    pensioner_district TEXT,
    pensioner_pincode TEXT,
    age INTEGER,
    lc_category TEXT,
    verification_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bank Pensioner Data Table
CREATE TABLE IF NOT EXISTS bank_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT,
    bank_state TEXT,
    bank_district TEXT,
    bank_city TEXT,
    branch_pin_code TEXT,
    total_pensioners INTEGER,
    verified_pensioners INTEGER,
    age_less_than_80 INTEGER,
    age_more_than_80 INTEGER,
    age_not_available INTEGER,
    grand_total INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- UBI1 Pensioner Data Table
CREATE TABLE IF NOT EXISTS ubi1_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pensioner_state TEXT,
    pensioner_district TEXT,
    pensioner_city TEXT,
    pensioner_pincode TEXT,
    bank_name TEXT,
    age INTEGER,
    is_valid INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- UBI3 Pensioner Data Table
CREATE TABLE IF NOT EXISTS ubi3_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pensioner_state TEXT,
    pensioner_district TEXT,
    pensioner_city TEXT,
    pensioner_pincode TEXT,
    bank_name TEXT,
    age INTEGER,
    verification_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PSA Pensioner Data Table
CREATE TABLE IF NOT EXISTS psa_pensioner_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_name TEXT,
    district_name TEXT,
    pincode TEXT,
    total_pensioners INTEGER,
    verified_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS idx_doppw_state ON doppw_pensioner_data(pensioner_state);
CREATE INDEX IF NOT EXISTS idx_dot_state ON dot_pensioner_data(pensioner_state);
CREATE INDEX IF NOT EXISTS idx_bank_state ON bank_pensioner_data(bank_state);
CREATE INDEX IF NOT EXISTS idx_ubi1_state ON ubi1_pensioner_data(pensioner_state);
CREATE INDEX IF NOT EXISTS idx_ubi3_state ON ubi3_pensioner_data(pensioner_state);
CREATE INDEX IF NOT EXISTS idx_psa_location ON psa_pensioner_data(location_name);
CREATE INDEX IF NOT EXISTS idx_doppw_status ON doppw_pensioner_data(submitted_status);
CREATE INDEX IF NOT EXISTS idx_bank_name ON bank_pensioner_data(bank_name);