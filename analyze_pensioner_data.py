#!/usr/bin/env python3
"""
Analyze Pensioner Data using DuckDB + Pandas
This script analyzes the pensioner data in the TBL_DOPPW_DLCDATA_MST table
and generates comprehensive reports by state, district, pincode, age categories,
and PSA/PDA categories.
"""

import pandas as pd
import duckdb
import sqlite3
from datetime import datetime
import os

def load_data_from_sqlite():
    """Load data from SQLite database into a pandas DataFrame"""
    print("📥 Loading data from SQLite database...")
    
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect('DLC_Database.db')
    
    # Load data into pandas DataFrame
    query = """
    SELECT 
        LEVEL1 as GCODE,
        ESCROLL_CATEGORY,
        BRANCH_STATE_NAME as STATE,
        BRANCH_PINCODE as BRANCH_PIN,
        PENSIONER_STATE_NAME as PENSIONER_STATE,
        PENSIONER_PINCODE,
        PENSIONER_DISTRICT_NAME as DISTRICT,
        YEAR_OF_BIRTH,
        AGE,
        SUBMISSION_STATUS,
        SUBMISSION_MODE,
        VERIFICATION_TYPE
    FROM TBL_DOPPW_DLCDATA_MST
    WHERE LEVEL1 IS NOT NULL
    """
    
    df = pd.read_sql_query(query, sqlite_conn)
    sqlite_conn.close()
    
    print(f"✅ Loaded {len(df)} records from database")
    return df

def create_age_categories(df):
    """Create age categories from birth year"""
    # Create age categories
    def categorize_age(age):
        if pd.isna(age) or age is None:
            return 'Unknown'
        elif age < 60:
            return 'Below 60'
        elif age < 70:
            return '60-70'
        elif age < 80:
            return '70-80'
        elif age < 90:
            return '80-90'
        else:
            return 'Above 90'
    
    df['AGE_CATEGORY'] = df['AGE'].apply(categorize_age)
    return df

def analyze_with_duckdb(df):
    """Perform comprehensive analysis using DuckDB"""
    print("🦆 Performing analysis with DuckDB...")
    
    # Connect to DuckDB in-memory
    con = duckdb.connect()
    
    # Register the dataframe
    con.register('pensioner_data', df)
    
    # Create analysis tables
    analysis_queries = {
        'by_gcode': """
            SELECT 
                GCODE,
                COUNT(*) as total_pensioners,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            GROUP BY GCODE
            ORDER BY total_pensioners DESC
        """,
        
        'by_state': """
            SELECT 
                STATE,
                COUNT(*) as total_pensioners,
                COUNT(DISTINCT DISTRICT) as districts_covered,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            WHERE STATE IS NOT NULL
            GROUP BY STATE
            ORDER BY total_pensioners DESC
        """,
        
        'by_age_category': """
            SELECT 
                AGE_CATEGORY,
                COUNT(*) as total_pensioners,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            GROUP BY AGE_CATEGORY
            ORDER BY total_pensioners DESC
        """,
        
        'by_submission_status': """
            SELECT 
                SUBMISSION_STATUS,
                COUNT(*) as total_pensioners,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            WHERE SUBMISSION_STATUS IS NOT NULL
            GROUP BY SUBMISSION_STATUS
            ORDER BY total_pensioners DESC
        """,
        
        'by_submission_mode': """
            SELECT 
                SUBMISSION_MODE,
                COUNT(*) as total_pensioners,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            WHERE SUBMISSION_MODE IS NOT NULL
            GROUP BY SUBMISSION_MODE
            ORDER BY total_pensioners DESC
        """,
        
        'by_verification_type': """
            SELECT 
                VERIFICATION_TYPE,
                COUNT(*) as total_pensioners,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pensioner_data), 2) as percentage
            FROM pensioner_data 
            WHERE VERIFICATION_TYPE IS NOT NULL
            GROUP BY VERIFICATION_TYPE
            ORDER BY total_pensioners DESC
        """,
        
        'top_districts': """
            SELECT 
                STATE,
                DISTRICT,
                COUNT(*) as total_pensioners
            FROM pensioner_data 
            WHERE DISTRICT IS NOT NULL AND STATE IS NOT NULL
            GROUP BY STATE, DISTRICT
            ORDER BY total_pensioners DESC
            LIMIT 20
        """,
        
        'top_pincodes': """
            SELECT 
                PENSIONER_PINCODE,
                COUNT(*) as total_pensioners
            FROM pensioner_data 
            WHERE PENSIONER_PINCODE IS NOT NULL
            GROUP BY PENSIONER_PINCODE
            ORDER BY total_pensioners DESC
            LIMIT 20
        """,
        
        'state_age_distribution': """
            SELECT 
                STATE,
                AGE_CATEGORY,
                COUNT(*) as total_pensioners
            FROM pensioner_data 
            WHERE STATE IS NOT NULL AND AGE_CATEGORY IS NOT NULL
            GROUP BY STATE, AGE_CATEGORY
            ORDER BY STATE, total_pensioners DESC
        """
    }
    
    results = {}
    for name, query in analysis_queries.items():
        try:
            result = con.execute(query).fetchdf()
            results[name] = result
            print(f"✅ Generated {name} analysis")
        except Exception as e:
            print(f"❌ Error in {name} analysis: {str(e)}")
            results[name] = pd.DataFrame()
    
    con.close()
    return results

def save_analysis_results(analysis_results):
    """Save analysis results to Excel file"""
    print("💾 Saving analysis results...")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"pensioner_data_analysis_{timestamp}.xlsx"
    
    with pd.ExcelWriter(filename) as writer:
        for name, df in analysis_results.items():
            if not df.empty:
                # Limit sheet name to 31 characters
                sheet_name = name[:31]
                df.to_excel(writer, sheet_name=sheet_name, index=False)
    
    print(f"✅ Analysis saved to {filename}")
    return filename

def generate_summary_report(analysis_results):
    """Generate a summary report"""
    print("\n" + "="*60)
    print("📊 PENSIONER DATA ANALYSIS SUMMARY REPORT")
    print("="*60)
    
    # Overall statistics
    if 'by_gcode' in analysis_results and not analysis_results['by_gcode'].empty:
        gcode_df = analysis_results['by_gcode']
        print(f"\n📈 BY GCODE CATEGORY:")
        for _, row in gcode_df.iterrows():
            print(f"   {row['GCODE']}: {row['total_pensioners']:,} pensioners ({row['percentage']}%)")
    
    if 'by_state' in analysis_results and not analysis_results['by_state'].empty:
        state_df = analysis_results['by_state']
        print(f"\n🌍 TOP 5 STATES BY PENSIONER COUNT:")
        for i, (_, row) in enumerate(state_df.head().iterrows()):
            print(f"   {i+1}. {row['STATE']}: {row['total_pensioners']:,} pensioners ({row['percentage']}%)")
    
    if 'by_age_category' in analysis_results and not analysis_results['by_age_category'].empty:
        age_df = analysis_results['by_age_category']
        print(f"\n🎂 AGE CATEGORY DISTRIBUTION:")
        for _, row in age_df.iterrows():
            print(f"   {row['AGE_CATEGORY']}: {row['total_pensioners']:,} pensioners ({row['percentage']}%)")
    
    if 'by_submission_status' in analysis_results and not analysis_results['by_submission_status'].empty:
        status_df = analysis_results['by_submission_status']
        print(f"\n📋 SUBMISSION STATUS:")
        for _, row in status_df.iterrows():
            print(f"   {row['SUBMISSION_STATUS']}: {row['total_pensioners']:,} pensioners ({row['percentage']}%)")
    
    if 'by_submission_mode' in analysis_results and not analysis_results['by_submission_mode'].empty:
        mode_df = analysis_results['by_submission_mode']
        print(f"\n📤 SUBMISSION MODE:")
        for _, row in mode_df.iterrows():
            print(f"   {row['SUBMISSION_MODE']}: {row['total_pensioners']:,} pensioners ({row['percentage']}%)")
    
    print("\n" + "="*60)

def main():
    """Main function to analyze pensioner data"""
    print("🚀 Starting pensioner data analysis...")
    
    # Load data from SQLite
    df = load_data_from_sqlite()
    
    if df.empty:
        print("❌ No data found in database")
        return
    
    # Create age categories
    df = create_age_categories(df)
    
    # Perform analysis with DuckDB
    analysis_results = analyze_with_duckdb(df)
    
    # Save results
    filename = save_analysis_results(analysis_results)
    
    # Generate summary report
    generate_summary_report(analysis_results)
    
    print(f"\n🎉 Analysis complete! Results saved to {filename}")

if __name__ == "__main__":
    main()