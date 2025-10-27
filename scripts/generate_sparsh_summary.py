#!/usr/bin/env python3

"""
Script to generate a summary report of SPARSH Defence pensioners data
organized by state, bank, branch pincode, age groups, and family pincode
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime

def generate_sparsh_summary(db_path):
    """Generate summary report of SPARSH Defence pensioners data"""
    print("📊 SPARSH DEFENCE PENSIONERS DATA SUMMARY REPORT")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Report generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get total SPARSH records
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master WHERE data_source LIKE '%SPARSH%'")
        total_sparsh = cursor.fetchone()[0]
        print(f"📊 Total SPARSH Defence Pensioners: {total_sparsh:,}")
        
        # 1. State-wise summary
        print(f"\n🗾 STATE-WISE SUMMARY:")
        print("-" * 50)
        cursor.execute("""
            SELECT state, COUNT(*) as total_count
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%' AND state IS NOT NULL AND state != ''
            GROUP BY state 
            ORDER BY total_count DESC
        """)
        state_data = cursor.fetchall()
        
        for state, total_count in state_data[:10]:  # Top 10 states
            print(f"   {state}: {total_count:,} pensioners")
            
            # Get bank distribution for this state
            cursor.execute("""
                SELECT bank_name, COUNT(*) as bank_count
                FROM pensioner_bank_master 
                WHERE data_source LIKE '%SPARSH%' AND state = ? AND bank_name IS NOT NULL
                GROUP BY bank_name 
                ORDER BY bank_count DESC
            """, (state,))
            bank_data = cursor.fetchall()
            
            for bank_name, bank_count in bank_data[:3]:  # Top 3 banks per state
                print(f"      ├── {bank_name}: {bank_count:,} pensioners")
                
                # Get branch pincode distribution for this bank in this state
                cursor.execute("""
                    SELECT branch_postcode, COUNT(*) as branch_count
                    FROM pensioner_bank_master 
                    WHERE data_source LIKE '%SPARSH%' AND state = ? AND bank_name = ? 
                    AND branch_postcode IS NOT NULL AND branch_postcode != ''
                    GROUP BY branch_postcode 
                    ORDER BY branch_count DESC
                    LIMIT 5
                """, (state, bank_name))
                branch_data = cursor.fetchall()
                
                for branch_pin, branch_count in branch_data:
                    print(f"      │   ├── Pin {branch_pin}: {branch_count:,} pensioners")
                    
                    # Get age group distribution for this branch
                    cursor.execute("""
                        SELECT PSA, COUNT(*) as age_count
                        FROM pensioner_bank_master 
                        WHERE data_source LIKE '%SPARSH%' AND state = ? AND bank_name = ? 
                        AND branch_postcode = ? AND PSA IS NOT NULL
                        GROUP BY PSA 
                        ORDER BY age_count DESC
                    """, (state, bank_name, branch_pin))
                    age_data = cursor.fetchall()
                    
                    for age_group, age_count in age_data:
                        print(f"      │   │   ├── {age_group}: {age_count:,} pensioners")
        
        # 2. Detailed breakdown for Andhra Pradesh (as requested)
        print(f"\n🔍 DETAILED BREAKDOWN FOR ANDHRA PRADESH:")
        print("-" * 50)
        cursor.execute("""
            SELECT bank_name, branch_postcode, PSA, pensioner_postcode, COUNT(*) as count
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%' AND state = 'ANDHRA PRADESH'
            GROUP BY bank_name, branch_postcode, PSA, pensioner_postcode
            ORDER BY bank_name, branch_postcode, PSA
        """)
        ap_data = cursor.fetchall()
        
        current_bank = None
        current_branch = None
        
        for bank_name, branch_pin, age_group, family_pin, count in ap_data:
            # Print bank header if new bank
            if bank_name != current_bank:
                print(f"   🏦 {bank_name}:")
                current_bank = bank_name
                current_branch = None
            
            # Print branch header if new branch
            if branch_pin != current_branch:
                print(f"      📍 Branch Pin: {branch_pin}")
                current_branch = branch_pin
            
            # Print age group and family pin info
            print(f"         ├── Age Group: {age_group}")
            if 'FAMILY' in age_group:
                print(f"         │   └── Family Pincode: {family_pin} ({count} pensioners)")
            else:
                print(f"         │   └── Branch Pincode: {branch_pin} ({count} pensioners)")
        
        # 3. Age group distribution across all SPARSH data
        print(f"\n👥 AGE GROUP DISTRIBUTION:")
        print("-" * 50)
        cursor.execute("""
            SELECT PSA, COUNT(*) as count
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%' AND PSA IS NOT NULL
            GROUP BY PSA 
            ORDER BY count DESC
        """)
        age_distribution = cursor.fetchall()
        
        for age_group, count in age_distribution:
            percentage = (count / total_sparsh) * 100 if total_sparsh > 0 else 0
            print(f"   {age_group}: {count:,} pensioners ({percentage:.1f}%)")
        
        # 4. Family vs Service Pensioners
        print(f"\n👨‍👩‍👧‍👦 SERVICE vs FAMILY PENSIONERS:")
        print("-" * 50)
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN data_source LIKE '%FAMILY%' THEN 'Family Pensioners'
                    ELSE 'Service Pensioners'
                END as pensioner_type,
                COUNT(*) as count
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%'
            GROUP BY pensioner_type
            ORDER BY count DESC
        """)
        pensioner_types = cursor.fetchall()
        
        for pensioner_type, count in pensioner_types:
            percentage = (count / total_sparsh) * 100 if total_sparsh > 0 else 0
            print(f"   {pensioner_type}: {count:,} pensioners ({percentage:.1f}%)")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ SPARSH Defence pensioners summary report generated successfully!")
        print(f"🏁 Report finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error generating SPARSH summary report: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Generate the summary report
    generate_sparsh_summary(db_path)

if __name__ == "__main__":
    main()