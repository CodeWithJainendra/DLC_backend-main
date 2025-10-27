#!/usr/bin/env python3
"""
Diagnostic script for Jeevan Pramaan API connectivity
"""

import sys
import os
sys.path.append('live_api_call')

import requests
import json
from hash_creation import generate_access_token

# Configuration
USERNAME = "UserJP"
PLAIN_PASSWORD = "29#@JP25bhaV"
PWD_SECRET_KEY = "bam5kllfzjzvjv560s5q24fnwbtqs50d"
AUTH_URL = "https://ipension.nic.in/JPWrapper/api/Auth"

print("="*80)
print("JEEVAN PRAMAAN API DIAGNOSTIC")
print("="*80)
print()

# Test 1: Check DNS resolution
print("TEST 1: DNS Resolution")
print("-" * 40)
try:
    import socket
    hostname = "ipension.nic.in"
    ip_address = socket.gethostbyname(hostname)
    print(f"✅ {hostname} resolves to {ip_address}")
except Exception as e:
    print(f"❌ DNS resolution failed: {e}")
print()

# Test 2: Check connectivity to base URL
print("TEST 2: Base URL Connectivity")
print("-" * 40)
try:
    response = requests.get("https://ipension.nic.in/", timeout=10, verify=True)
    print(f"✅ Base URL accessible - Status: {response.status_code}")
except requests.exceptions.SSLError as e:
    print(f"⚠️  SSL Error: {e}")
except requests.exceptions.ConnectionError as e:
    print(f"❌ Connection Error: {e}")
except Exception as e:
    print(f"❌ Error: {e}")
print()

# Test 3: Check API endpoint accessibility
print("TEST 3: API Endpoint Accessibility")
print("-" * 40)
try:
    response = requests.get(AUTH_URL, timeout=10, verify=True)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
print()

# Test 4: Check outbound IP
print("TEST 4: Outbound IP Address")
print("-" * 40)
try:
    response = requests.get("https://api.ipify.org", timeout=10)
    outbound_ip = response.text
    print(f"✅ Outbound IP: {outbound_ip}")
    print(f"   This IP must be whitelisted by DoP&PW")
except Exception as e:
    print(f"❌ Could not determine outbound IP: {e}")
print()

# Test 5: Try authentication with detailed headers
print("TEST 5: Authentication Attempt")
print("-" * 40)
try:
    auth_data = generate_access_token(USERNAME, PLAIN_PASSWORD, PWD_SECRET_KEY)
    
    print(f"Username: {auth_data['Username']}")
    print(f"Timestamp: {auth_data['Timestamp']}")
    print(f"AccessToken: {auth_data['AccessToken'][:50]}...")
    print()
    
    # Try with different header combinations
    header_sets = [
        {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'JP-API-Client/1.0'
        },
        {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        {
            'Content-Type': 'application/json',
            'Accept': '*/*'
        }
    ]
    
    for i, headers in enumerate(header_sets, 1):
        print(f"Attempt {i} with headers: {headers}")
        try:
            response = requests.post(
                AUTH_URL,
                json=auth_data,
                headers=headers,
                timeout=30,
                verify=True
            )
            
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 200:
                print(f"  ✅ SUCCESS!")
                print(f"  Response: {json.dumps(response.json(), indent=2)}")
                break
            elif response.status_code == 403:
                print(f"  ❌ 403 Forbidden - IP not whitelisted")
            elif response.status_code == 401:
                print(f"  ❌ 401 Unauthorized - Credentials issue")
            else:
                print(f"  Response: {response.text[:200]}")
                
        except Exception as e:
            print(f"  Error: {e}")
        print()
        
except Exception as e:
    print(f"❌ Authentication test failed: {e}")
print()

# Test 6: Check if there's a firewall or proxy
print("TEST 6: Network Configuration")
print("-" * 40)
print(f"HTTP_PROXY: {os.environ.get('HTTP_PROXY', 'Not set')}")
print(f"HTTPS_PROXY: {os.environ.get('HTTPS_PROXY', 'Not set')}")
print(f"NO_PROXY: {os.environ.get('NO_PROXY', 'Not set')}")
print()

# Summary
print("="*80)
print("DIAGNOSTIC SUMMARY")
print("="*80)
print()
print("If you're getting 403 Forbidden errors:")
print("1. Verify that IP 103.246.106.145 is whitelisted with DoP&PW")
print("2. Contact Anil Bansal (anil.bansal@gov.in) to confirm whitelisting status")
print("3. Contact developers:")
print("   - Sh. Priyranjan Sharma: 6394457028")
print("   - Sh. Arvind Kumar: 8909175628")
print()
print("If IP is confirmed whitelisted but still failing:")
print("- There might be multiple IPs if using load balancer")
print("- Firewall rules might need updating")
print("- API credentials might have changed")
print("="*80)
