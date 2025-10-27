#!/usr/bin/env python3
"""
Generate comprehensive pincode analysis report
"""

import sqlite3
import json
from datetime import datetime

def generate_report():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    report = {
        'generated_at': datetime.now().isoformat(),
        'summary': {},
        'top_states': [],
        'top_districts': [],
        'top_pincodes': [],
        'bank_distribution': [],
        'age_distribution': {}
    }
    
    # Overall summary
    cursor.execute('SELECT COUNT(DISTINCT pincode) FROM pincode_master')
    report['summary']['total_unique_pincodes'] = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM pensioner_pincode_data')
    report['summary']['total_records'] = cursor.fetchone()[0]
    
    cursor.execute('SELECT SUM(total_pensioners) FROM pincode_statistics')
    report['summary']['total_pensioners'] = cursor.fetchone()[0] or 0
    
    cursor.execute('SELECT COUNT(DISTINCT state) FROM pincode_master WHERE state IS NOT NULL')
    report['summary']['total_states'] = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(DISTINCT district) FROM pincode_master WHERE district IS NOT NULL')
    report['summary']['total_districts'] = cursor.fetchone()[0]
    
    # Top 20 states
    cursor.execute('''
        SELECT state, COUNT(DISTINCT pincode) as pincode_count,
               SUM(total_pensioners) as pensioner_count,
               SUM(total_banks) as bank_count
        FROM pincode_statistics
        WHERE state IS NOT NULL AND state != 'nan'
        GROUP BY state
        ORDER BY pensioner_count DESC
        LIMIT 20
    ''')
    
    for row in cursor.fetchall():
        report['top_states'].append({
            'state': row[0],
            'pincodes': row[1],
            'pensioners': row[2],
            'banks': row[3]
        })
    
    # Top 30 districts
    cursor.execute('''
        SELECT state, district, COUNT(DISTINCT pincode) as pincode_count,
               SUM(total_pensioners) as pensioner_count
        FROM pincode_statistics
        WHERE district IS NOT NULL AND district != 'nan'
        GROUP BY state, district
        ORDER BY pensioner_count DESC
        LIMIT 30
    ''')
    
    for row in cursor.fetchall():
        report['top_districts'].append({
            'state': row[0],
            'district': row[1],
            'pincodes': row[2],
            'pensioners': row[3]
        })
    
    # Top 50 pincodes
    cursor.execute('''
        SELECT ps.pincode, ps.state, ps.district, pm.city,
               ps.total_pensioners, ps.total_banks, ps.total_branches
        FROM pincode_statistics ps
        LEFT JOIN pincode_master pm ON ps.pincode = pm.pincode
        ORDER BY ps.total_pensioners DESC
        LIMIT 50
    ''')
    
    for row in cursor.fetchall():
        report['top_pincodes'].append({
            'pincode': row[0],
            'state': row[1],
            'district': row[2],
            'city': row[3],
            'pensioners': row[4],
            'banks': row[5],
            'branches': row[6]
        })
    
    # Bank distribution
    cursor.execute('''
        SELECT bank_name, COUNT(DISTINCT pincode) as pincode_count,
               SUM(total_pensioners) as pensioner_count
        FROM pensioner_pincode_data
        WHERE bank_name IS NOT NULL AND bank_name != ''
        GROUP BY bank_name
        ORDER BY pensioner_count DESC
        LIMIT 20
    ''')
    
    for row in cursor.fetchall():
        report['bank_distribution'].append({
            'bank': row[0],
            'pincodes': row[1],
            'pensioners': row[2]
        })
    
    # Age distribution
    cursor.execute('''
        SELECT 
            SUM(age_less_than_80) as less_than_80,
            SUM(age_more_than_80) as more_than_80,
            SUM(age_not_available) as not_available
        FROM pensioner_pincode_data
    ''')
    
    age_data = cursor.fetchone()
    report['age_distribution'] = {
        'less_than_80': age_data[0] or 0,
        'more_than_80': age_data[1] or 0,
        'not_available': age_data[2] or 0
    }
    
    conn.close()
    
    # Save JSON report
    with open('pincode_analysis_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    # Generate markdown report
    generate_markdown_report(report)
    
    print("✅ Reports generated:")
    print("   📄 pincode_analysis_report.json")
    print("   📄 pincode_analysis_report.md")

def generate_markdown_report(report):
    md = f"""# Pincode Analysis Report

**Generated:** {report['generated_at']}

## Summary Statistics

- **Total Unique Pincodes:** {report['summary']['total_unique_pincodes']:,}
- **Total Records:** {report['summary']['total_records']:,}
- **Total Pensioners:** {report['summary']['total_pensioners']:,}
- **Total States:** {report['summary']['total_states']}
- **Total Districts:** {report['summary']['total_districts']}

## Top 20 States by Pensioner Count

| Rank | State | Pincodes | Pensioners | Banks |
|------|-------|----------|------------|-------|
"""
    
    for idx, state in enumerate(report['top_states'], 1):
        md += f"| {idx} | {state['state']} | {state['pincodes']:,} | {state['pensioners']:,} | {state['banks']} |\n"
    
    md += "\n## Top 30 Districts by Pensioner Count\n\n"
    md += "| Rank | State | District | Pincodes | Pensioners |\n"
    md += "|------|-------|----------|----------|------------|\n"
    
    for idx, district in enumerate(report['top_districts'], 1):
        md += f"| {idx} | {district['state']} | {district['district']} | {district['pincodes']:,} | {district['pensioners']:,} |\n"
    
    md += "\n## Top 50 Pincodes by Pensioner Count\n\n"
    md += "| Rank | Pincode | State | District | City | Pensioners | Banks | Branches |\n"
    md += "|------|---------|-------|----------|------|------------|-------|----------|\n"
    
    for idx, pincode in enumerate(report['top_pincodes'], 1):
        city = pincode['city'] or 'N/A'
        state = pincode['state'] or 'N/A'
        district = pincode['district'] or 'N/A'
        md += f"| {idx} | {pincode['pincode']} | {state} | {district} | {city} | {pincode['pensioners']:,} | {pincode['banks']} | {pincode['branches']} |\n"
    
    md += "\n## Top 20 Banks by Pensioner Count\n\n"
    md += "| Rank | Bank Name | Pincodes | Pensioners |\n"
    md += "|------|-----------|----------|------------|\n"
    
    for idx, bank in enumerate(report['bank_distribution'], 1):
        md += f"| {idx} | {bank['bank']} | {bank['pincodes']:,} | {bank['pensioners']:,} |\n"
    
    md += "\n## Age Distribution\n\n"
    age = report['age_distribution']
    total = age['less_than_80'] + age['more_than_80'] + age['not_available']
    
    md += f"- **Less than 80 years:** {age['less_than_80']:,} ({(age['less_than_80']/total*100):.2f}%)\n"
    md += f"- **More than 80 years:** {age['more_than_80']:,} ({(age['more_than_80']/total*100):.2f}%)\n"
    md += f"- **Age not available:** {age['not_available']:,} ({(age['not_available']/total*100):.2f}%)\n"
    
    md += "\n---\n\n"
    md += "*Report generated by Pincode Analysis System*\n"
    
    with open('pincode_analysis_report.md', 'w') as f:
        f.write(md)

if __name__ == '__main__':
    generate_report()
