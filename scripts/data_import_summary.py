#!/usr/bin/env python3

"""
Script to generate a summary report of all imported data
"""

import sqlite3
import os
from datetime import datetime

def generate_summary_report(db_path):
    """Generate a summary report of all imported data"""
    print("📊 DATA IMPORT SUMMARY REPORT")
    print("="*80)
    print(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Database: {db_path}")
    print("="*80)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get total records
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        total_records = cursor.fetchone()[0]
        print(f"📈 Total Records: {total_records:,}")
        
        # Get records by data source
        print(f"\n📋 Records by Data Source:")
        print("-" * 40)
        cursor.execute("""
            SELECT data_source, COUNT(*) as count 
            FROM pensioner_bank_master 
            GROUP BY data_source 
            ORDER BY count DESC
        """)
        sources = cursor.fetchall()
        for source, count in sources:
            percentage = (count / total_records) * 100
            print(f"   {source}: {count:,} ({percentage:.1f}%)")
        
        # Get records by state (top 10)
        print(f"\n🗾 Top 10 States by Record Count:")
        print("-" * 40)
        cursor.execute("""
            SELECT state, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE state IS NOT NULL AND state != ''
            GROUP BY state 
            ORDER BY count DESC 
            LIMIT 10
        """)
        states = cursor.fetchall()
        for state, count in states:
            percentage = (count / total_records) * 100
            print(f"   {state}: {count:,} ({percentage:.1f}%)")
        
        # Get sample records from each data source
        print(f"\n🔍 Sample Records by Data Source:")
        print("-" * 40)
        for source, _ in sources:
            print(f"\n   📄 {source}:")
            if 'BOB' in source:
                cursor.execute("""
                    SELECT ppo_number, branch_name, state 
                    FROM pensioner_bank_master 
                    WHERE data_source = ? 
                    LIMIT 3
                """, (source,))
                records = cursor.fetchall()
                for ppo, branch, state in records:
                    print(f"      PPO: {ppo}, Branch: {branch}, State: {state}")
            elif 'DASHBOARD' in source:
                cursor.execute("""
                    SELECT gcode, branch_name, state 
                    FROM pensioner_bank_master 
                    WHERE data_source = ? 
                    LIMIT 3
                """, (source,))
                records = cursor.fetchall()
                for gcode, branch, state in records:
                    print(f"      GCode: {gcode}, Branch: {branch}, State: {state}")
            elif 'UBI' in source:
                cursor.execute("""
                    SELECT ppo_number, name_of_bank_branch_of_pensioner, state 
                    FROM pensioner_bank_master 
                    WHERE data_source = ? 
                    LIMIT 3
                """, (source,))
                records = cursor.fetchall()
                for ppo, branch, state in records:
                    print(f"      PPO: {ppo}, Branch: {branch}, State: {state}")
            elif 'DOPPW' in source:
                cursor.execute("""
                    SELECT ppo_number, branch_name, state 
                    FROM pensioner_bank_master 
                    WHERE data_source = ? 
                    LIMIT 3
                """, (source,))
                records = cursor.fetchall()
                for ppo, branch, state in records:
                    print(f"      PPO: {ppo}, Branch: {branch}, State: {state}")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ Summary report generated successfully!")
        
    except Exception as e:
        print(f"❌ Error generating summary report: {e}")

def main():
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    generate_summary_report(db_path)

if __name__ == "__main__":
    main()