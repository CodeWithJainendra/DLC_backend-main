# import requests
# import json
# from hash_creation import generate_access_token
# from aes_encryption import AESEncryption, aes_encrypt, aes_decrypt, encrypt_json_data, decrypt_json_data

# def make_auth_api_call(url, payload):
#     """
#     Make authentication API call to the specified URL with the given payload
#     """
#     print("=== API Authentication Call ===")
#     print(f"URL: {url}")
#     print(f"Payload: {json.dumps(payload, indent=2)}")
    
#     try:
#         # Make the POST request
#         response = requests.post(
#             url,
#             json=payload,
#             headers={
#                 'Content-Type': 'application/json',
#                 'Accept': 'application/json',
#                 'User-Agent': 'Python-API-Client/1.0'
#             },
#             timeout=30
#         )
        
#         print(f"\nResponse Status Code: {response.status_code}")
#         print(f"Response Headers: {dict(response.headers)}")
        
#         # Try to parse JSON response
#         try:
#             response_data = response.json()
#             print(f"\nResponse JSON:")
#             print(json.dumps(response_data, indent=2, ensure_ascii=False))
#         except json.JSONDecodeError:
#             print(f"\nResponse Text:")
#             print(response.text)
        
#         # Check if request was successful
#         if response.status_code == 200:
#             print("\n✅ Authentication API call successful!")
#             return response
#         else:
#             print(f"\n❌ Authentication API call failed with status code: {response.status_code}")
#             return response
            
#     except requests.exceptions.ConnectionError as e:
#         print(f"\n❌ Connection Error: {str(e)}")
#         print("Please check if the server is reachable and the URL is correct.")
#         return None
#     except requests.exceptions.Timeout as e:
#         print(f"\n❌ Timeout Error: {str(e)}")
#         print("The request timed out. The server might be slow or unreachable.")
#         return None
#     except requests.exceptions.RequestException as e:
#         print(f"\n❌ Request Error: {str(e)}")
#         return None
#     except Exception as e:
#         print(f"\n❌ Unexpected Error: {str(e)}")
#         return None

# def fetch_pensioner_report(jwt_token, report_date, aes_key):
#     """
#     Fetch Pensioner Report from Jeevan Praman API
    
#     Args:
#         jwt_token (str): JWT token obtained from authentication
#         report_date (str): Date in format yyyy-MM-dd (e.g., "2025-08-11")
#         aes_key (str): 32-character AES encryption key
        
#     Returns:
#         dict: API response containing the pensioner report
#     """
#     print(f"\n=== Fetching Pensioner Report ===")
#     print(f"Report Date: {report_date}")
#     print(f"Using AES Key: {aes_key}")
    
#     # API endpoint
#     report_url = "https://ipension.nic.in/JPWrapper/api/Broker/Report"
    
#     # Prepare plain JSON object
#     plain_json = {
#         "date": report_date
#     }
    
#     print(f"Plain JSON Request: {json.dumps(plain_json, indent=2)}")
    
#     # AES encrypt the plain JSON
#     print("🔐 Encrypting request payload with AES-256-GCM...")
#     encrypted_payload = encrypt_json_data(plain_json, aes_key)
    
#     # Prepare the final request payload
#     request_payload = {
#         "JP_Request": encrypted_payload
#     }
    
#     print(f"Encrypted JP_Request: {encrypted_payload}")
    
#     try:
#         # Make the API request with JWT token
#         response = requests.post(
#             report_url,
#             json=request_payload,
#             headers={
#                 'Content-Type': 'application/json',
#                 'Accept': 'application/json',
#                 'Authorization': f'Bearer {jwt_token}',
#                 'User-Agent': 'JP-API-Client/1.0'
#             },
#             timeout=60  # Increased timeout for report generation
#         )
        
#         print(f"\nResponse Status Code: {response.status_code}")
#         print(f"Response Headers: {dict(response.headers)}")
        
#         # Parse response
#         try:
#             response_data = response.json()
            
#             # Check if the response contains encrypted data that needs decryption
#             if isinstance(response_data, dict) and ('jP_Response' in response_data or 'JP_Response' in response_data):
#                 print("\n=== SUCCESS ENCRYPTED RESPONSE ===")
#                 print(f"EncryptedResponse: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
                
#                 print("\n🔓 Decrypting response data...")
#                 try:
#                     # Handle both possible field names
#                     encrypted_data = response_data.get('jP_Response') or response_data.get('JP_Response')
#                     decrypted_response = decrypt_json_data(encrypted_data, aes_key)
#                     print(f"\n=== SUCCESS PLAIN RESPONSE ===")
#                     if isinstance(decrypted_response, list):
#                         print(f"PlainResponse: {json.dumps(decrypted_response, indent=2, ensure_ascii=False)}")
#                     else:
#                         print(f"PlainResponse: {json.dumps(decrypted_response, indent=2, ensure_ascii=False)}")
#                     return {
#                         "status": "success",
#                         "encrypted_response": response_data,
#                         "decrypted_data": decrypted_response
#                     }
#                 except Exception as decrypt_error:
#                     print(f"⚠️ Could not decrypt response: {decrypt_error}")
#                     return {
#                         "status": "success_no_decrypt",
#                         "response": response_data,
#                         "decrypt_error": str(decrypt_error)
#                     }
#             else:
#                 print(f"\n=== RESPONSE ===")
#                 print(json.dumps(response_data, indent=2, ensure_ascii=False))
#                 return {
#                     "status": "success",
#                     "response": response_data
#                 }
                
#         except json.JSONDecodeError:
#             print(f"\nResponse Text:")
#             print(response.text)
#             return {
#                 "status": "json_error",
#                 "status_code": response.status_code,
#                 "text": response.text
#             }
            
#     except requests.exceptions.ConnectionError as e:
#         print(f"\n❌ Connection Error: {str(e)}")
#         return {"status": "connection_error", "error": str(e)}
#     except requests.exceptions.Timeout as e:
#         print(f"\n❌ Timeout Error: {str(e)}")
#         return {"status": "timeout_error", "error": str(e)}
#     except requests.exceptions.RequestException as e:
#         print(f"\n❌ Request Error: {str(e)}")
#         return {"status": "request_error", "error": str(e)}
#     except Exception as e:
#         print(f"\n❌ Unexpected Error: {str(e)}")
#         return {"status": "unexpected_error", "error": str(e)}

# def get_pensioner_report_for_date(date_str):
#     """
#     Complete workflow: Authenticate and fetch pensioner report for a specific date
    
#     Args:
#         date_str (str): Date in format yyyy-MM-dd
        
#     Returns:
#         dict: Complete result with authentication and report data
#     """
#     print(f"=== Complete Pensioner Report Workflow ===")
#     print(f"Requested Date: {date_str}")
    
#     # Step 1: Authenticate
#     auth_response = generate_and_call_api()
    
#     if not auth_response or auth_response.status_code != 200:
#         return {"status": "auth_failed", "message": "Authentication failed"}
    
#     # Extract JWT token
#     try:
#         auth_data = auth_response.json()
#         jwt_token = auth_data.get('token')
        
#         if not jwt_token:
#             return {"status": "auth_failed", "message": "No JWT token received"}
            
#     except (json.JSONDecodeError, AttributeError):
#         return {"status": "auth_failed", "message": "Failed to parse auth response"}
    
#     # Step 2: Fetch report
#     aes_key = "bam5kllfzjzvjv560s5q24fnwbtqs50d"
#     report_result = fetch_pensioner_report(jwt_token, date_str, aes_key)
    
#     return {
#         "status": "completed",
#         "auth_success": True,
#         "jwt_token": jwt_token[:50] + "...",
#         "report_result": report_result,
#         "date_requested": date_str
#     }

# def generate_and_call_api():
#     """
#     Generate access token using current timestamp and make API call
#     """
#     # Configuration
#     username = "UserJP"
#     plain_password = "29#@JP25bhaV"
#     pwd_secret_key = "bam5kllfzjzvjv560s5q24fnwbtqs50d"
#     api_url = "https://ipension.nic.in/JPWrapper/api/Auth"
    
#     print("=== Generating Fresh Access Token ===")
    
#     # Generate fresh authentication data
#     auth_data = generate_access_token(username, plain_password, pwd_secret_key)
    
#     # Prepare payload in the required format
#     payload = {
#         "UserName": auth_data["Username"],
#         "TS": auth_data["Timestamp"],
#         "AccessToken": auth_data["AccessToken"]
#     }
    
#     print(f"Generated:")
#     print(f"Username: {auth_data['Username']}")
#     print(f"Timestamp: {auth_data['Timestamp']}")
#     print(f"AccessToken: {auth_data['AccessToken']}")
    
#     # Make API call
#     return make_auth_api_call(api_url, payload)

# def main():
#     # Step 1: Authenticate and get JWT token
#     print("STEP 1: Authentication")
#     print("="*50)
    
#     auth_response = generate_and_call_api()
    
#     if not auth_response or auth_response.status_code != 200:
#         print("❌ Authentication failed. Cannot proceed with report fetch.")
#         return
    
#     # Extract JWT token from response
#     try:
#         auth_data = auth_response.json()
#         jwt_token = auth_data.get('token')
        
#         if not jwt_token:
#             print("❌ No JWT token received in authentication response.")
#             return
            
#         print(f"✅ JWT Token received: {jwt_token[:50]}...")
        
#     except (json.JSONDecodeError, AttributeError):
#         print("❌ Failed to parse authentication response.")
#         return
    
#     # Step 2: Fetch Pensioner Report
#     print("\nSTEP 2: Fetch Pensioner Report")
#     print("="*50)
    
#     # Configuration for report fetch
#     aes_key = "3sw6dmhh2vsrjpo5ba36myv6qt5j20fd"  # AES key for payload encryption
    
#     # Try different dates to find a valid one
#     test_dates = [  # Older past date
#         "2025-09-21"   # Original future date
#     ]
    
#     successful_fetch = False
    
#     for report_date in test_dates:
#         print(f"\n--- Trying date: {report_date} ---")
        
#         # Fetch the report
#         report_result = fetch_pensioner_report(jwt_token, report_date, aes_key)
        
#         # Check if we got a successful response (not an error code)
#         if (report_result.get("status") == "success" and 
#             isinstance(report_result.get("response"), dict) and 
#             report_result["response"].get("errorCode") is None):
#             print(f"✅ Successfully fetched report for date: {report_date}")
#             successful_fetch = True
#             break
#         elif (report_result.get("status") == "success" and 
#               isinstance(report_result.get("response"), dict)):
#             error_code = report_result["response"].get("errorCode")
#             print(f"⚠️  API returned error code: {error_code} for date: {report_date}")
#         else:
#             print(f"❌ Failed to fetch report for date: {report_date}")
    
#     # Step 3: Summary
#     print("\n" + "="*60)
#     print("FINAL SUMMARY")
#     print("="*60)
    
#     if auth_response and auth_response.status_code == 200:
#         print("✅ Authentication: SUCCESS")
#     else:
#         print("❌ Authentication: FAILED")
    
#     if successful_fetch:
#         print("✅ Pensioner Report Fetch: SUCCESS")
#     else:
#         print("⚠️  Pensioner Report Fetch: API responded but may require different parameters")
#         print("   Common error codes:")
#         print("   - BHJP106: Possible date format or authorization issue")
#         print("   - Check if the user has proper permissions for report access")
        
#     print(f"\nTechnical Implementation:")
#     print(f"✅ AES Encryption: AES-256-GCM")
#     print(f"✅ IV Source: First 12 bytes of AES key")
#     print(f"✅ Tag Length: 16 bytes (included in encrypted output)")
#     print(f"✅ Payload Structure: {{\"JP_Request\": \"<encrypted_data>\"}}")
#     print(f"✅ JWT Authentication: Bearer token in Authorization header")
#     print(f"✅ Endpoint: https://ipension.nic.in/JPWrapper/api/Broker/Report")

# if __name__ == "__main__":
#     main()




from flask import Flask, request, jsonify
from datetime import datetime
import requests
import json
from hash_creation import generate_access_token
from aes_encryption import encrypt_json_data, decrypt_json_data

app = Flask(__name__)

# Configuration
USERNAME = "UserJP"
PLAIN_PASSWORD = "29#@JP25bhaV"
PWD_SECRET_KEY = "bam5kllfzjzvjv560s5q24fnwbtqs50d"
AUTH_URL = "https://ipension.nic.in/JPWrapper/api/Auth"
REPORT_URL = "https://ipension.nic.in/JPWrapper/api/Broker/Report"
AES_KEY = "3sw6dmhh2vsrjpo5ba36myv6qt5j20fd"

def authenticate():
    """
    Authenticate with the Jeevan Praman API and get JWT token
    
    Returns:
        str: JWT token if successful, None if failed
    """
    try:
        print("=== Authenticating with JP API ===")
        
        # Generate authentication data
        auth_data = generate_access_token(USERNAME, PLAIN_PASSWORD, PWD_SECRET_KEY)
        
        # Prepare payload
        payload = {
            "UserName": auth_data["Username"],
            "TS": auth_data["Timestamp"],
            "AccessToken": auth_data["AccessToken"]
        }
        
        print(f"Auth payload: {json.dumps(payload, indent=2)}")
        
        # Make authentication request
        response = requests.post(
            AUTH_URL,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout=30
        )
        
        print(f"Auth response status: {response.status_code}")
        
        if response.status_code == 200:
            auth_response = response.json()
            jwt_token = auth_response.get('Token') or auth_response.get('token')
            
            if jwt_token:
                print(f"✅ Authentication successful. Token: {jwt_token[:50]}...")
                return jwt_token
            else:
                print("❌ No Token in auth response")
                return None
        else:
            print(f"❌ Authentication failed with status: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Authentication error: {str(e)}")
        return None

def fetch_report_data(jwt_token, report_date):
    """
    Fetch pensioner report data for the given date
    
    Args:
        jwt_token (str): JWT token for authentication
        report_date (str): Date in format yyyy-MM-dd
        
    Returns:
        dict: Plain response data or error information
    """
    try:
        print(f"=== Fetching Report for {report_date} ===")
        
        # Prepare plain JSON request
        plain_json = {
            "date": report_date
        }
        
        print(f"Plain request: {json.dumps(plain_json, indent=2)}")
        
        # Encrypt the payload
        print("🔐 Encrypting request payload...")
        encrypted_payload = encrypt_json_data(plain_json, AES_KEY)
        
        # Prepare final request
        request_payload = {
            "JP_Request": encrypted_payload
        }
        
        print(f"Encrypted payload ready: {len(encrypted_payload)} characters")
        
        # Make the API request
        response = requests.post(
            REPORT_URL,
            json=request_payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Bearer {jwt_token}',
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout=60
        )
        
        print(f"Report response status: {response.status_code}")
        
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if response contains encrypted data
            if isinstance(response_data, dict) and ('jP_Response' in response_data or 'JP_Response' in response_data):
                print("🔓 Decrypting response...")
                
                # Handle both possible field names
                encrypted_data = response_data.get('jP_Response') or response_data.get('JP_Response')
                
                try:
                    decrypted_data = decrypt_json_data(encrypted_data, AES_KEY)
                    print("✅ Successfully decrypted response")
                    return {
                        "success": True,
                        "data": decrypted_data,
                        "message": "Report fetched successfully"
                    }
                except Exception as decrypt_error:
                    print(f"❌ Decryption error: {decrypt_error}")
                    return {
                        "success": False,
                        "error": "Failed to decrypt response",
                        "details": str(decrypt_error),
                        "encrypted_response": response_data
                    }
            else:
                # Response is not encrypted
                print("✅ Plain response received")
                return {
                    "success": True,
                    "data": response_data,
                    "message": "Report fetched successfully"
                }
        else:
            print(f"❌ Report fetch failed with status: {response.status_code}")
            return {
                "success": False,
                "error": f"API request failed with status {response.status_code}",
                "details": response.text
            }
            
    except Exception as e:
        print(f"❌ Report fetch error: {str(e)}")
        return {
            "success": False,
            "error": "Failed to fetch report",
            "details": str(e)
        }

def validate_date_format(date_string):
    """
    Validate that the date string is in the correct format (yyyy-MM-dd)
    
    Args:
        date_string (str): Date string to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    try:
        datetime.strptime(date_string, '%Y-%m-%d')
        return True
    except ValueError:
        return False

@app.route('/pensioner-report', methods=['GET', 'POST'])
def get_pensioner_report():
    """
    API endpoint to get pensioner report for a specific date
    
    GET: Pass date as query parameter (?date=2025-09-21)
    POST: Pass date in JSON body {"date": "2025-09-21"}
    
    Returns:
        JSON response with report data or error information
    """
    try:
        # Get date from request
        if request.method == 'GET':
            date_str = request.args.get('date')
        else:  # POST
            data = request.get_json()
            if not data:
                return jsonify({
                    "success": False,
                    "error": "No JSON data provided",
                    "usage": {
                        "GET": "/pensioner-report?date=2025-09-21",
                        "POST": '{"date": "2025-09-21"}'
                    }
                }), 400
            date_str = data.get('date')
        
        # Validate date parameter
        if not date_str:
            return jsonify({
                "success": False,
                "error": "Date parameter is required",
                "usage": {
                    "GET": "/pensioner-report?date=2025-09-21",
                    "POST": '{"date": "2025-09-21"}'
                }
            }), 400
        
        # Validate date format
        if not validate_date_format(date_str):
            return jsonify({
                "success": False,
                "error": "Invalid date format. Use yyyy-MM-dd format",
                "example": "2025-09-21"
            }), 400
        
        print(f"=== Processing request for date: {date_str} ===")
        
        # Step 1: Authenticate
        jwt_token = authenticate()
        if not jwt_token:
            return jsonify({
                "success": False,
                "error": "Authentication failed",
                "details": "Unable to obtain JWT token from JP API"
            }), 500
        
        # Step 2: Fetch report
        report_result = fetch_report_data(jwt_token, date_str)
        
        # Return the result
        if report_result["success"]:
            return jsonify({
                "success": True,
                "data": report_result["data"],
                "message": report_result["message"],
            })
        else:
            return jsonify({
                "success": False,
                "date": date_str,
                "error": report_result["error"],
                "details": report_result.get("details"),
                "timestamp": datetime.now().isoformat()
            }), 500
            
    except Exception as e:
        print(f"❌ Endpoint error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "details": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Pensioner Report API",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        "service": "Pensioner Report API",
        "description": "API to fetch pensioner reports from Jeevan Praman system",
        "endpoints": {
            "GET /pensioner-report": {
                "description": "Fetch pensioner report for a specific date",
                "parameters": {
                    "date": "Date in yyyy-MM-dd format (query parameter)"
                },
                "example": "/pensioner-report?date=2025-09-21"
            },
            "POST /pensioner-report": {
                "description": "Fetch pensioner report for a specific date",
                "body": {
                    "date": "Date in yyyy-MM-dd format"
                },
                "example": '{"date": "2025-09-21"}'
            },
            "GET /health": "Health check endpoint"
        },
        "timestamp": datetime.now().isoformat()
    })

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "success": False,
        "error": "Endpoint not found",
        "available_endpoints": [
            "GET /",
            "GET /health",
            "GET /pensioner-report?date=yyyy-MM-dd",
            "POST /pensioner-report"
        ]
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({
        "success": False,
        "error": "Internal server error",
        "message": "Something went wrong on the server"
    }), 500

if __name__ == '__main__':
    print("="*60)
    print("PENSIONER REPORT API SERVER")
    print("="*60)
    print("Starting Flask server...")
    print("Available endpoints:")
    print("- GET  /                     - API information")
    print("- GET  /health               - Health check")
    print("- GET  /pensioner-report     - Fetch report (date as query param)")
    print("- POST /pensioner-report     - Fetch report (date in JSON body)")
    print("="*60)
    print("Example usage:")
    print("GET  http://localhost:5000/pensioner-report?date=2025-09-21")
    print("POST http://localhost:5000/pensioner-report")
    print("     Body: {\"date\": \"2025-09-21\"}")
    print("="*60)
    
    # Run the Flask app
    app.run(
        host='0.0.0.0',  # Allow external connections
        port=5000,       # Port number
        debug=True,      # Enable debug mode
        threaded=True    # Handle multiple requests concurrently
    )
