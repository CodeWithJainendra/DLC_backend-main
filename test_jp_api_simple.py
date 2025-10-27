#!/usr/bin/env python3
"""
Simple test script for Jeevan Pramaan API
"""

import sys
import os
sys.path.append('live_api_call')

import requests
import json
from hash_creation import generate_access_token
from aes_encryption import encrypt_json_data, decrypt_json_data

# Configuration
USERNAME = "UserJP"
PLAIN_PASSWORD = "29#@JP25bhaV"
PWD_SECRET_KEY = "bam5kllfzjzvjv560s5q24fnwbtqs50d"
AUTH_URL = "https://ipension.nic.in/JPWrapper/api/Auth"
REPORT_URL = "https://ipension.nic.in/JPWrapper/api/Broker/Report"
AES_KEY = "3sw6dmhh2vsrjpo5ba36myv6qt5j20fd"

# Test date: 05.11.2024 (expected ~700k records, ~300MB)
TEST_DATE = "2024-11-05"

def authenticate():
    """Authenticate and get JWT token"""
    print("="*80)
    print("STEP 1: AUTHENTICATION")
    print("="*80)
    
    try:
        # Generate authentication data
        auth_data = generate_access_token(USERNAME, PLAIN_PASSWORD, PWD_SECRET_KEY)
        
        print(f"Username: {auth_data['Username']}")
        print(f"Timestamp: {auth_data['Timestamp']}")
        print(f"AccessToken: {auth_data['AccessToken'][:50]}...")
        
        # Make authentication request
        response = requests.post(
            AUTH_URL,
            json=auth_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout=30
        )
        
        print(f"\nAuth Response Status: {response.status_code}")
        
        if response.status_code == 200:
            auth_response = response.json()
            jwt_token = auth_response.get('Token')
            
            if jwt_token:
                print(f"✅ JWT Token: {jwt_token[:50]}...")
                return jwt_token
            else:
                print("❌ No token in response")
                print(f"Response: {json.dumps(auth_response, indent=2)}")
                return None
        else:
            print(f"❌ Authentication failed")
            print(f"Response: {response.text[:500]}")
            return None
            
    except Exception as e:
        print(f"❌ Authentication error: {str(e)}")
        return None

def fetch_report(jwt_token, report_date):
    """Fetch pensioner report"""
    print("\n" + "="*80)
    print("STEP 2: FETCH REPORT")
    print("="*80)
    print(f"Report Date: {report_date}")
    
    try:
        # Prepare plain JSON request
        plain_json = {"date": report_date}
        plain_json_str = json.dumps(plain_json, separators=(',', ':'))
        
        print(f"Plain Request: {plain_json_str}")
        
        # Encrypt the payload
        print("🔐 Encrypting request payload...")
        encrypted_payload = encrypt_json_data(plain_json, AES_KEY)
        
        print(f"Encrypted Payload Length: {len(encrypted_payload)} characters")
        
        # Prepare final request
        request_payload = {"JP_Request": encrypted_payload}
        
        # Make the API request
        print("Sending request to Report API...")
        import time
        start_time = time.time()
        
        response = requests.post(
            REPORT_URL,
            json=request_payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Bearer {jwt_token}',
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout=300  # 5 minutes
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"\nReport Response Status: {response.status_code}")
        print(f"Response Time: {duration:.2f} seconds")
        
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if response contains encrypted data
            if isinstance(response_data, dict) and ('jP_Response' in response_data or 'JP_Response' in response_data):
                print("🔓 Decrypting response...")
                
                encrypted_response = response_data.get('jP_Response') or response_data.get('JP_Response')
                
                # Calculate encrypted size
                encrypted_size_mb = len(encrypted_response) / (1024 * 1024)
                print(f"Encrypted Response Size: {encrypted_size_mb:.2f} MB")
                
                try:
                    decrypted_data = decrypt_json_data(encrypted_response, AES_KEY)
                    
                    # Calculate decrypted size
                    decrypted_str = json.dumps(decrypted_data)
                    decrypted_size_mb = len(decrypted_str) / (1024 * 1024)
                    
                    print(f"✅ Decrypted Data Size: {decrypted_size_mb:.2f} MB")
                    
                    return {
                        'success': True,
                        'data': decrypted_data,
                        'response_time': duration,
                        'encrypted_size_mb': encrypted_size_mb,
                        'decrypted_size_mb': decrypted_size_mb
                    }
                except Exception as decrypt_error:
                    print(f"❌ Decryption error: {decrypt_error}")
                    return {
                        'success': False,
                        'error': 'Decryption failed',
                        'details': str(decrypt_error)
                    }
            else:
                # Plain response
                print("✅ Plain response received")
                response_str = json.dumps(response_data)
                size_mb = len(response_str) / (1024 * 1024)
                print(f"Response Size: {size_mb:.2f} MB")
                
                return {
                    'success': True,
                    'data': response_data,
                    'response_time': duration,
                    'size_mb': size_mb
                }
        else:
            print(f"❌ Report fetch failed")
            print(f"Response: {response.text[:500]}")
            return {
                'success': False,
                'error': f'HTTP {response.status_code}',
                'details': response.text[:500]
            }
            
    except Exception as e:
        print(f"❌ Report fetch error: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def analyze_data(data):
    """Analyze the report data"""
    print("\n" + "="*80)
    print("STEP 3: DATA ANALYSIS")
    print("="*80)
    
    if isinstance(data, list):
        print(f"✅ Record Count: {len(data):,}")
        
        if len(data) > 0:
            print("\n--- Sample Record (First) ---")
            print(json.dumps(data[0], indent=2, ensure_ascii=False))
            
            print("\n--- Record Structure ---")
            fields = list(data[0].keys())
            print(f"Fields ({len(fields)}): {', '.join(fields)}")
            
            # Calculate average record size
            sample_size = min(100, len(data))
            total_size = sum(len(json.dumps(data[i])) for i in range(sample_size))
            avg_size = total_size / sample_size
            print(f"Average Record Size: {avg_size:.2f} bytes")
            
            if len(data) > 1:
                print("\n--- Sample Record (Last) ---")
                print(json.dumps(data[-1], indent=2, ensure_ascii=False))
                
    elif isinstance(data, dict):
        print("Response Structure:")
        print(f"Keys: {', '.join(data.keys())}")
        
        for key, value in data.items():
            if isinstance(value, list):
                print(f"✅ {key}: Array with {len(value):,} items")
                if len(value) > 0:
                    print(f"\n--- Sample {key} Record ---")
                    print(json.dumps(value[0], indent=2, ensure_ascii=False))

def main():
    """Main test function"""
    print("="*80)
    print("JEEVAN PRAMAAN API TEST")
    print("="*80)
    print(f"Auth URL: {AUTH_URL}")
    print(f"Report URL: {REPORT_URL}")
    print(f"Test Date: {TEST_DATE}")
    print(f"Expected: ~700,000 records, ~300 MB")
    print("="*80)
    print()
    
    try:
        # Step 1: Authenticate
        jwt_token = authenticate()
        
        if not jwt_token:
            print("\n❌ FAILED: Authentication failed")
            return False
        
        # Step 2: Fetch Report
        report_result = fetch_report(jwt_token, TEST_DATE)
        
        if not report_result['success']:
            print(f"\n❌ FAILED: {report_result['error']}")
            if 'details' in report_result:
                print(f"Details: {report_result['details']}")
            return False
        
        # Step 3: Analyze Data
        analyze_data(report_result['data'])
        
        # Final Summary
        print("\n" + "="*80)
        print("TEST RESULT: SUCCESS ✅")
        print("="*80)
        print("Summary:")
        print(f"  Response Time: {report_result['response_time']:.2f} seconds")
        
        if 'decrypted_size_mb' in report_result:
            print(f"  Encrypted Size: {report_result['encrypted_size_mb']:.2f} MB")
            print(f"  Decrypted Size: {report_result['decrypted_size_mb']:.2f} MB")
        else:
            print(f"  Payload Size: {report_result['size_mb']:.2f} MB")
        
        if isinstance(report_result['data'], list):
            print(f"  Record Count: {len(report_result['data']):,}")
        
        print("="*80)
        
        return True
        
    except Exception as e:
        print("\n" + "="*80)
        print("TEST RESULT: FAILED ❌")
        print("="*80)
        print(f"Error: {str(e)}")
        print("="*80)
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
