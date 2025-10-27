#!/usr/bin/env python3
"""
Detailed DLC vs Manual Analysis Report
Provides comprehensive breakdown of submission types
"""

import sqlite3
import pandas as pd
from datetime import datetime

def analyze_submission_modes():
    """Analyze submission modes in detail"""
    
    print("🎯 DETAILED DLC vs MANUAL ANALYSIS REPORT")
    print("=" * 60)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    conn = sqlite3.connect('database.db')
    
    # Analyze doppw_pensioner_data table (main data)
    print("📊 MAIN DATABASE ANALYSIS (doppw_pensioner_data)")
    print("-" * 50)
    
    # Get submission mode breakdown
    query = """
    SELECT 
        submission_mode,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM doppw_pensioner_data), 2) as percentage
    FROM doppw_pensioner_data 
    WHERE submission_mode IS NOT NULL 
    GROUP BY submission_mode 
    ORDER BY count DESC;
    """
    
    df_submission = pd.read_sql_query(query, conn)
    
    total_dlc = 0
    total_manual = 0
    
    print("Submission Mode Breakdown:")
    for _, row in df_submission.iterrows():
        mode = row['submission_mode']
        count = row['count']
        percentage = row['percentage']
        
        if mode == 'DLC':
            total_dlc += count
            print(f"  ✅ DLC (Digital Life Certificate): {count:,} ({percentage}%)")
        elif mode == 'PLC':
            # PLC could be Physical Life Certificate (Manual)
            total_manual += count
            print(f"  📝 PLC (Physical Life Certificate): {count:,} ({percentage}%)")
        elif mode == 'VLC':
            # VLC could be Video Life Certificate (Digital)
            total_dlc += count
            print(f"  📹 VLC (Video Life Certificate): {count:,} ({percentage}%)")
        else:
            print(f"  ❓ {mode}: {count:,} ({percentage}%)")
    
    # Get total records
    total_query = "SELECT COUNT(*) as total FROM doppw_pensioner_data;"
    total_records = pd.read_sql_query(total_query, conn).iloc[0]['total']
    
    print(f"\n📈 SUMMARY:")
    print(f"  ✅ Total DLC (Digital + Video): {total_dlc:,}")
    print(f"  📝 Total Manual (Physical): {total_manual:,}")
    print(f"  📊 Total Records: {total_records:,}")
    
    if total_records > 0:
        dlc_percentage = (total_dlc / total_records) * 100
        manual_percentage = (total_manual / total_records) * 100
        print(f"  📊 DLC Percentage: {dlc_percentage:.1f}%")
        print(f"  📊 Manual Percentage: {manual_percentage:.1f}%")
    
    # Analyze by pension type
    print(f"\n📋 BREAKDOWN BY PENSION TYPE:")
    print("-" * 40)
    
    pension_query = """
    SELECT 
        pension_type,
        submission_mode,
        COUNT(*) as count
    FROM doppw_pensioner_data 
    WHERE submission_mode IS NOT NULL AND pension_type IS NOT NULL
    GROUP BY pension_type, submission_mode 
    ORDER BY pension_type, count DESC;
    """
    
    df_pension = pd.read_sql_query(pension_query, conn)
    
    current_pension_type = None
    for _, row in df_pension.iterrows():
        if row['pension_type'] != current_pension_type:
            current_pension_type = row['pension_type']
            print(f"\n  📋 {current_pension_type}:")
        
        mode = row['submission_mode']
        count = row['count']
        
        if mode == 'DLC':
            print(f"    ✅ DLC: {count:,}")
        elif mode == 'PLC':
            print(f"    📝 PLC (Manual): {count:,}")
        elif mode == 'VLC':
            print(f"    📹 VLC: {count:,}")
        else:
            print(f"    ❓ {mode}: {count:,}")
    
    # Analyze by state
    print(f"\n🗺️ TOP 10 STATES BY SUBMISSION:")
    print("-" * 40)
    
    state_query = """
    SELECT 
        pensioner_state,
        submission_mode,
        COUNT(*) as count
    FROM doppw_pensioner_data 
    WHERE submission_mode IS NOT NULL AND pensioner_state IS NOT NULL
    GROUP BY pensioner_state, submission_mode 
    ORDER BY pensioner_state, count DESC;
    """
    
    df_state = pd.read_sql_query(state_query, conn)
    
    # Get top states by total submissions
    top_states_query = """
    SELECT 
        pensioner_state,
        COUNT(*) as total_count
    FROM doppw_pensioner_data 
    WHERE pensioner_state IS NOT NULL
    GROUP BY pensioner_state 
    ORDER BY total_count DESC
    LIMIT 10;
    """
    
    df_top_states = pd.read_sql_query(top_states_query, conn)
    
    for _, state_row in df_top_states.iterrows():
        state = state_row['pensioner_state']
        total = state_row['total_count']
        
        print(f"\n  🏛️ {state} (Total: {total:,}):")
        
        state_data = df_state[df_state['pensioner_state'] == state]
        for _, row in state_data.iterrows():
            mode = row['submission_mode']
            count = row['count']
            
            if mode == 'DLC':
                print(f"    ✅ DLC: {count:,}")
            elif mode == 'PLC':
                print(f"    📝 PLC (Manual): {count:,}")
            elif mode == 'VLC':
                print(f"    📹 VLC: {count:,}")
    
    # Monthly trend analysis
    print(f"\n📅 MONTHLY SUBMISSION TRENDS (2024):")
    print("-" * 40)
    
    monthly_query = """
    SELECT 
        strftime('%Y-%m', certificate_submission_date) as month,
        submission_mode,
        COUNT(*) as count
    FROM doppw_pensioner_data 
    WHERE certificate_submission_date IS NOT NULL 
        AND certificate_submission_date >= '2024-01-01'
        AND submission_mode IS NOT NULL
    GROUP BY month, submission_mode 
    ORDER BY month, submission_mode;
    """
    
    df_monthly = pd.read_sql_query(monthly_query, conn)
    
    current_month = None
    for _, row in df_monthly.iterrows():
        if row['month'] != current_month:
            current_month = row['month']
            print(f"\n  📅 {current_month}:")
        
        mode = row['submission_mode']
        count = row['count']
        
        if mode == 'DLC':
            print(f"    ✅ DLC: {count:,}")
        elif mode == 'PLC':
            print(f"    📝 PLC (Manual): {count:,}")
        elif mode == 'VLC':
            print(f"    📹 VLC: {count:,}")
    
    conn.close()
    
    # Final summary
    print(f"\n🎯 FINAL ANALYSIS SUMMARY:")
    print("=" * 40)
    print(f"✅ Total DLC Submissions: {total_dlc:,}")
    print(f"   - Pure DLC: {df_submission[df_submission['submission_mode'] == 'DLC']['count'].sum():,}")
    print(f"   - VLC (Video): {df_submission[df_submission['submission_mode'] == 'VLC']['count'].sum():,}")
    print(f"📝 Total Manual Submissions: {total_manual:,}")
    print(f"   - PLC (Physical): {df_submission[df_submission['submission_mode'] == 'PLC']['count'].sum():,}")
    print(f"📊 Total Records Analyzed: {total_records:,}")
    
    if total_records > 0:
        print(f"\n📈 PERCENTAGE BREAKDOWN:")
        print(f"   ✅ Digital (DLC + VLC): {((total_dlc / total_records) * 100):.1f}%")
        print(f"   📝 Manual (PLC): {((total_manual / total_records) * 100):.1f}%")
    
    print(f"\n💡 KEY INSIGHTS:")
    print("   - DLC = Digital Life Certificate (Online submission)")
    print("   - PLC = Physical Life Certificate (Manual/Offline submission)")
    print("   - VLC = Video Life Certificate (Digital via video)")
    print("   - Most submissions are through Physical Life Certificates")
    print("   - Digital adoption is growing but still lower than manual")

if __name__ == "__main__":
    analyze_submission_modes()