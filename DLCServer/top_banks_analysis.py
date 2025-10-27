#!/usr/bin/env python3
"""
Top Banks Analysis for Choropleth State Verification
"""

import sqlite3
import pandas as pd
import json

def get_top_banks_by_state():
    """Get top banks by state with pensioner counts"""
    conn = sqlite3.connect('database.db')
    
    # Query to get top banks by state from bank_pensioner_data
    query = """
    SELECT 
        bank_state,
        bank_name,
        COUNT(*) as branch_count,
        SUM(grand_total) as total_pensioners,
        SUM(age_less_than_80) as pensioners_under_80,
        SUM(age_more_than_80) as pensioners_over_80,
        SUM(age_not_available) as pensioners_age_unknown
    FROM bank_pensioner_data 
    WHERE bank_state IS NOT NULL 
        AND bank_name IS NOT NULL
        AND grand_total > 0
    GROUP BY bank_state, bank_name
    ORDER BY bank_state, total_pensioners DESC
    """
    
    df = pd.read_sql_query(query, conn)
    
    # Get top 10 banks overall
    top_banks_overall = df.groupby('bank_name').agg({
        'total_pensioners': 'sum',
        'branch_count': 'sum'
    }).sort_values('total_pensioners', ascending=False).head(10)
    
    # Get top banks by state (top 5 per state)
    top_banks_by_state = df.groupby('bank_state').apply(
        lambda x: x.nlargest(5, 'total_pensioners')
    ).reset_index(drop=True)
    
    # State-wise summary
    state_summary = df.groupby('bank_state').agg({
        'total_pensioners': 'sum',
        'branch_count': 'sum',
        'bank_name': 'nunique'
    }).rename(columns={'bank_name': 'unique_banks'}).sort_values('total_pensioners', ascending=False)
    
    conn.close()
    
    return {
        'top_banks_overall': top_banks_overall.to_dict('index'),
        'top_banks_by_state': top_banks_by_state.to_dict('records'),
        'state_summary': state_summary.to_dict('index'),
        'total_states': len(state_summary),
        'total_pensioners': df['total_pensioners'].sum(),
        'total_branches': df['branch_count'].sum()
    }

def get_doppw_bank_analysis():
    """Get bank analysis from DOPPW data"""
    conn = sqlite3.connect('database.db')
    
    query = """
    SELECT 
        branch_state,
        branch_name,
        COUNT(*) as pensioner_count,
        COUNT(DISTINCT branch_code) as unique_branches
    FROM doppw_pensioner_data 
    WHERE branch_state IS NOT NULL 
        AND branch_name IS NOT NULL
    GROUP BY branch_state, branch_name
    ORDER BY branch_state, pensioner_count DESC
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    return df.to_dict('records')

if __name__ == "__main__":
    print("TOP BANKS ANALYSIS")
    print("="*60)
    
    # Get bank analysis
    bank_data = get_top_banks_by_state()
    
    print(f"Total States: {bank_data['total_states']}")
    print(f"Total Pensioners: {bank_data['total_pensioners']:,}")
    print(f"Total Branches: {bank_data['total_branches']:,}")
    
    print("\nTOP 10 BANKS OVERALL:")
    for bank, data in list(bank_data['top_banks_overall'].items())[:10]:
        print(f"  {bank}: {data['total_pensioners']:,} pensioners, {data['branch_count']:,} branches")
    
    print("\nTOP 5 STATES BY PENSIONERS:")
    for state, data in list(bank_data['state_summary'].items())[:5]:
        print(f"  {state}: {data['total_pensioners']:,} pensioners, {data['unique_banks']} banks")
    
    # Save to JSON for API
    with open('top_banks_data.json', 'w') as f:
        json.dump(bank_data, f, indent=2, default=str)
    
    print("\nData saved to top_banks_data.json")