# SBI UAT API Integration - Issue Report

**Date:** October 22, 2025  
**Issue:** SI411 - Unauthorized: RSA decryption Failed!!  
**Status:** Unable to connect to UAT API

---

## Summary

We have successfully implemented the SBI EIS GEN6 encryption and API integration as per the specifications provided. However, when testing against the UAT endpoint, we are consistently receiving error **SI411 (RSA decryption Failed)**.

This error indicates that **SBI's gateway cannot decrypt our encrypted request**, which typically means there is a **certificate mismatch** between what we're using to encrypt and what SBI has configured on their end.

---

## Our Implementation Status

✅ **Completed:**
- SBI EIS GEN6 encryption implementation (AES-256-GCM + RSA)
- Digital signature creation (SHA256withRSA)
- Request format as per SBI specifications
- Both API endpoints implemented:
  - GET_BATCHID (TXN_SUB_TYPE: GET_BATCHID)
  - FETCH_RECORDS (TXN_SUB_TYPE: FETCH_RECORDS)

✅ **Verified:**
- Certificate validity: ENC_EIS_UAT.cer (Valid until Nov 3, 2025)
- Our certificate: samar.iitk.ac.in.cer (Valid until Dec 30, 2025)
- Request reference number format: SBIDQ + Julian date format (25 chars)
- SOURCE_ID: "DQ" (as specified in email)
- Encryption: AES-256-GCM with 32-character dynamic key
- RSA encryption: Tried both PKCS1-V1_5 and RSA-OAEP with SHA-256

---

## Test Results

### UAT Endpoint
```
URL: https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services
Method: POST
Headers: Content-Type: application/json, AccessToken: <RSA encrypted AES key>
```

### Response Received
```json
{
  "RESPONSE_STATUS": "2",
  "ERROR_CODE": "SI411",
  "ERROR_DESCRIPTION": "Unauthorized : RSA decryption Failed!!"
}
```

### Sample Request Sent
```json
{
  "REQUEST_REFERENCE_NUMBER": "SBIDQ25295175559877101650",
  "REQUEST": "<AES-256-GCM encrypted payload>",
  "DIGI_SIGN": "<SHA256withRSA signature>"
}
```

**AccessToken Header:** Contains the AES key encrypted with SBI's public key (ENC_EIS_UAT.cer)

---

## Root Cause Analysis

The **SI411 error** means SBI's gateway cannot decrypt the AccessToken (encrypted AES key) using their private key. This happens when:

1. **Certificate Mismatch:** The public certificate we're using (ENC_EIS_UAT.cer) doesn't match the private key SBI is using to decrypt
2. **Our Certificate Not Configured:** SBI hasn't configured our public certificate (samar.iitk.ac.in.cer) on their end
3. **Wrong SOURCE_ID:** The SOURCE_ID "DQ" might not be correctly mapped to our certificate in SBI's system

---

## Action Items for SBI

### 1. Verify Certificate Configuration

**Question:** Has our public certificate been configured in the UAT environment?

**Our Certificate Details:**
- **File:** samar.iitk.ac.in.cer
- **Subject:** CN=samar.iitk.ac.in, O=Indian Institute of Technology Kanpur
- **Valid From:** Nov 28, 2024
- **Valid To:** Dec 30, 2025
- **Key Size:** 2048 bits RSA

**Action Required:** Please confirm that this exact certificate is configured for SOURCE_ID "DQ" in your UAT environment.

### 2. Verify ENC_EIS_UAT Certificate

**Question:** Is the ENC_EIS_UAT.cer certificate we have the correct one for UAT?

**Certificate We're Using:**
- **Subject:** CN=ENC_EIS_UAT, OU=EIS, O=SBI
- **Issuer:** CN=SBI-PROD-RCA
- **Valid From:** Nov 4, 2023
- **Valid To:** Nov 3, 2025

**Action Required:** Please confirm this is the correct certificate, or provide the updated UAT certificate if different.

### 3. Verify SOURCE_ID Mapping

**Question:** Is SOURCE_ID "DQ" correctly configured and mapped to our certificate?

**Current Configuration:**
- SOURCE_ID: "DQ"
- DESTINATION: "SPIGOV"
- TXN_TYPE: "DLC"
- TXN_SUB_TYPE: "GET_BATCHID" / "FETCH_RECORDS"

**Action Required:** Please verify the SOURCE_ID "DQ" is active and correctly mapped in UAT.

### 4. Check Encryption Method

**Question:** What RSA padding scheme should we use?

**What We're Using:**
- Primary: RSAES-PKCS1-V1_5
- Fallback: RSA-OAEP with SHA-256

**Action Required:** Please confirm which padding scheme is expected in UAT.

---

## What We Need from SBI

1. ✅ **Confirmation** that our certificate (samar.iitk.ac.in.cer) is configured in UAT
2. ✅ **Verification** that SOURCE_ID "DQ" is correctly mapped to our certificate
3. ✅ **Latest certificate** if ENC_EIS_UAT.cer needs to be updated
4. ✅ **Test logs** from SBI's side showing the exact error when processing our request
5. ✅ **Sample encrypted request** from SBI that works, so we can compare formats

---

## Our Certificate (for SBI to configure)

**File:** samar.iitk.ac.in.cer  
**Location:** /data1/jainendra/DLC_backend-main/certificates/samar.iitk.ac.in.cer

Please find attached or let us know if you need us to resend this certificate.

---

## Contact Information

**Team:** IIT Kanpur - DLC Portal Integration  
**Technical Contact:** Jainendra  
**Email:** [Your email]  
**Reference:** Email dated September 30, 2025 from Dhruvendra Kumar Pandey

---

## Next Steps

1. **SBI to verify** certificate configuration in UAT
2. **SBI to confirm** SOURCE_ID "DQ" mapping
3. **SBI to provide** test logs or working sample request
4. **We will retest** once configuration is confirmed

---

## Technical Details (for SBI Team)

### Request Format
```json
{
  "REQUEST_REFERENCE_NUMBER": "SBI<SOURCE_ID><YYDDD><HHmmssSSS><NNNNNN>",
  "REQUEST": "<Base64 encoded AES-256-GCM encrypted JSON payload>",
  "DIGI_SIGN": "<Base64 encoded SHA256withRSA signature of plain JSON>"
}
```

### AccessToken Header
```
AccessToken: <Base64 encoded RSA encrypted 32-character AES key>
```

### Encryption Flow
1. Generate 32-character AES key (keyboard characters)
2. Encrypt JSON payload with AES-256-GCM (IV = first 12 bytes of key)
3. Create SHA256withRSA signature of plain JSON using our private key
4. Encrypt AES key with SBI's public key (ENC_EIS_UAT.cer) using RSA
5. Send encrypted request with AccessToken header

### Decryption Flow (SBI's side)
1. Decrypt AccessToken using SBI's private key → Get AES key
2. Decrypt REQUEST using AES key → Get plain JSON
3. Verify DIGI_SIGN using our public certificate → Validate authenticity

**The failure is at Step 1** - SBI cannot decrypt the AccessToken, indicating certificate mismatch.

---

**Generated:** October 22, 2025  
**Test Script:** DLCServer/test-sbi-uat-api.js  
**Diagnostic Tool:** DLCServer/diagnose-sbi-uat.js
