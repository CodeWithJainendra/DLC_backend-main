import requests
import random
import datetime
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- Configuration (Replace with your real SMSGatewayHub credentials) ---
SMS_API_KEY = os.getenv("SMS_API_KEY", "GgvIcRfSQEmdB7Kmlj7iOA")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "DLC4.0")
SMS_CHANNEL = os.getenv("SMS_CHANNEL", "2")
SMS_DCS = os.getenv("SMS_DCS", "0")
SMS_FLASH = os.getenv("SMS_FLASH", "0")
SMS_ROUTE = os.getenv("SMS_ROUTE", "1")
SMS_ENTITY_ID = os.getenv("SMS_ENTITY_ID", "your_entity_id")
SMS_DLT_TEMPLATE_ID = os.getenv("SMS_DLT_TEMPLATE_ID", "your_dlt_template_id")

def generate_otp(length=6):
    """Generate a numeric OTP."""
    return ''.join([str(random.randint(0, 9)) for _ in range(length)])

def send_sms(number, message):
    """Send an SMS using SMSGatewayHub API."""
    url = "https://www.smsgatewayhub.com/api/mt/SendSMS"
    params = {
        "APIKey": SMS_API_KEY,
        "senderid": SMS_SENDER_ID,
        "channel": SMS_CHANNEL,
        "DCS": SMS_DCS,
        "flashsms": SMS_FLASH,
        "number": number,
        "text": message,
        "route": SMS_ROUTE,
        "EntityId": SMS_ENTITY_ID,
        "dlttemplateid": SMS_DLT_TEMPLATE_ID,
    }

    response = requests.post(url, params=params)
    
    # Parse the JSON response
    try:
        response_data = response.json()
        return {
            "success": response_data.get("ErrorCode") == "000",  # "000" typically indicates success
            "raw_response": response.text,
            "error_code": response_data.get("ErrorCode"),
            "error_message": response_data.get("ErrorMessage"),
            "job_id": response_data.get("JobId")
        }
    except ValueError:
        # If JSON parsing fails, treat as error
        return {
            "success": False,
            "raw_response": response.text,
            "error_code": None,
            "error_message": "Invalid API response format"
        }

def main():
    number = input("Enter phone number: ").strip()
    otp = generate_otp()
    generated_at = datetime.datetime.now()
    expired_at = generated_at + datetime.timedelta(minutes=4)

    message = f"Dear user, your CRS OTP for CRS application is {otp}. Use it to complete authentication. Do not share it. --AIRAWAT RESEARCH FOUNDATION"

    print("\nSending OTP...")
    response = send_sms(number, message)

    if response["success"]:
        print("\n✅ OTP Sent Successfully!")
        print("Phone Number:", number)
        print("OTP:", otp)
        print("Generated At:", generated_at.strftime("%Y-%m-%d %H:%M:%S"))
        print("Expires At:", expired_at.strftime("%Y-%m-%d %H:%M:%S"))
        if response.get("job_id"):
            print("SMS Job ID:", response["job_id"])
    else:
        print("\n❌ Failed to Send OTP!")
        print("Error Code:", response.get("error_code"))
        print("Error Message:", response.get("error_message"))
        print("\nPlease check your SMS API credentials in the .env file or environment variables.")
    
    print("\nSMS Gateway Response:", response["raw_response"])

if __name__ == "__main__":
    main()
