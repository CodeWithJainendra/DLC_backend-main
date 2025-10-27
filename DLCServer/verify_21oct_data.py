#!/usr/bin/env python3
"""
Verify the data inserted from 21Oct Excel files
"""

import sqlite3
import pandas as pd
from datetime import datetime

def verify_data():
    """Verify the inserted data quality and completeness"""
    
    print("🔍 VERIFYING 21OCT DATA INSERTION")
    print("=" * 50)
    
    conn = sqlite3.connect("database.db")
    
    # Get total records
    query = "SELECT COUNT(*) FROM doppw_pensioner_data"
    total_records = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"📊 Total records in database: {total_records:,}")
    
    # Get records from today's insertion (21Oct files)
    query = """
    SELECT COUNT(*) FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    """
    new_records = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"📝 Records from 21Oct files: {new_records:,}")
    
    # Breakdown by file
    print(f"\n📋 BREAKDOWN BY FILE:")
    print("-" * 30)
    query = """
    SELECT file_name, COUNT(*) as count 
    FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    GROUP BY file_name 
    ORDER BY count DESC
    """
    file_breakdown = pd.read_sql_query(query, conn)
    for _, row in file_breakdown.iterrows():
        print(f"   {row['file_name']}: {row['count']:,}")
    
    # Breakdown by state
    print(f"\n🏛️  BREAKDOWN BY STATE:")
    print("-" * 30)
    query = """
    SELECT pensioner_state, COUNT(*) as count 
    FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx'
    )
    AND pensioner_state IS NOT NULL
    GROUP BY pensioner_state 
    ORDER BY count DESC
    """
    state_breakdown = pd.read_sql_query(query, conn)
    for _, row in state_breakdown.iterrows():
        print(f"   {row['pensioner_state']}: {row['count']:,}")
    
    # Data quality checks
    print(f"\n🔍 DATA QUALITY CHECKS:")
    print("-" * 30)
    
    # Check for records with birth year
    query = """
    SELECT COUNT(*) FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    AND birth_year IS NOT NULL
    """
    with_birth_year = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"   Records with birth year: {with_birth_year:,} ({with_birth_year/new_records*100:.1f}%)")
    
    # Check for records with age
    query = """
    SELECT COUNT(*) FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    AND age IS NOT NULL
    """
    with_age = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"   Records with age: {with_age:,} ({with_age/new_records*100:.1f}%)")
    
    # Check for records with branch pincode
    query = """
    SELECT COUNT(*) FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    AND branch_pincode IS NOT NULL
    """
    with_branch_pincode = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"   Records with branch pincode: {with_branch_pincode:,} ({with_branch_pincode/new_records*100:.1f}%)")
    
    # Check for records with pensioner pincode
    query = """
    SELECT COUNT(*) FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    AND pensioner_pincode IS NOT NULL
    """
    with_pensioner_pincode = pd.read_sql_query(query, conn).iloc[0, 0]
    print(f"   Records with pensioner pincode: {with_pensioner_pincode:,} ({with_pensioner_pincode/new_records*100:.1f}%)")
    
    # Age distribution
    print(f"\n📊 AGE DISTRIBUTION:")
    print("-" * 30)
    query = """
    SELECT 
        CASE 
            WHEN age < 60 THEN 'Under 60'
            WHEN age >= 60 AND age < 70 THEN '60-69'
            WHEN age >= 70 AND age < 80 THEN '70-79'
            WHEN age >= 80 AND age < 90 THEN '80-89'
            WHEN age >= 90 THEN '90+'
            ELSE 'Unknown'
        END as age_group,
        COUNT(*) as count
    FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'CHHATTISGARH DLC PORTAL DATA.xlsx', 'GUJARAT DLC PORTAL DATA.xlsx',
        'JHARKHAND DLC PORTAL DATA.xlsx', 'JK DLC PORTAL DATA.xlsx',
        'KARNATAKA DLC PORTAL DATA.xlsx', 'NE DLC PORTAL DATA.xlsx',
        'PUNJAB DLC PORTAL DATA.xlsx', 'TELANGANA DLC PORTAL DATA.xlsx',
        'UP DLC PORTAL DATA.xlsx', 'PSB.xlsx', 'IOB.xlsx', 'IDBI.xlsx',
        'ICICI.xlsx', 'HDFC.xlsx', 'Bank of Maharashtra.xlsx',
        'Bandhan Bank for Information for DLC Dashboard.xlsx'
    )
    GROUP BY age_group
    ORDER BY count DESC
    """
    age_distribution = pd.read_sql_query(query, conn)
    for _, row in age_distribution.iterrows():
        print(f"   {row['age_group']}: {row['count']:,}")
    
    # Sample records
    print(f"\n📝 SAMPLE RECORDS:")
    print("-" * 30)
    query = """
    SELECT gcode, birth_year, age, branch_pincode, pensioner_pincode, pensioner_state, file_name
    FROM doppw_pensioner_data 
    WHERE file_name IN (
        'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx',
        'HDFC.xlsx'
    )
    AND gcode IS NOT NULL
    LIMIT 5
    """
    sample_records = pd.read_sql_query(query, conn)
    for _, row in sample_records.iterrows():
        print(f"   PPO: {row['gcode']}, Birth: {row['birth_year']}, Age: {row['age']}, State: {row['pensioner_state']}")
    
    conn.close()
    
    print(f"\n✅ DATA VERIFICATION COMPLETE")
    print(f"🎯 Successfully processed and verified {new_records:,} records from 21Oct Excel files")

if __name__ == "__main__":
    verify_data()