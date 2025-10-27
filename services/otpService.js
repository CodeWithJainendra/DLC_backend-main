/**
 * OTP Service
 * Handles OTP generation, SMS sending, and verification
 */

const axios = require('axios');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');

class OTPService {
  constructor(dbPath = null) {
    // Use absolute path to database in project root
    const finalDbPath = dbPath || path.join(__dirname, '..', 'DLC_Database.db');
    this.db = new Database(finalDbPath);
    
    // SMS Gateway Configuration (from environment or defaults)
    this.smsConfig = {
      apiKey: process.env.SMS_API_KEY || 'GgvIcRfSQEmdB7Kmlj7iOA',
      senderId: process.env.SMS_SENDER_ID || 'DLC4.0',
      channel: process.env.SMS_CHANNEL || '2',
      dcs: process.env.SMS_DCS || '0',
      flash: process.env.SMS_FLASH || '0',
      route: process.env.SMS_ROUTE || '1',
      entityId: process.env.SMS_ENTITY_ID || 'your_entity_id',
      dltTemplateId: process.env.SMS_DLT_TEMPLATE_ID || 'your_dlt_template_id',
      apiUrl: 'https://www.smsgatewayhub.com/api/mt/SendSMS'
    };

    this.initializeOTPTable();
  }

  /**
   * Initialize OTP table in database
   */
  initializeOTPTable() {
    // Create table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS otp_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_no VARCHAR(15) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        generated_at DATETIME NOT NULL,
        expired_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        verified_at DATETIME,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_records(contact_no);
      CREATE INDEX IF NOT EXISTS idx_otp_expired ON otp_records(expired_at);
      CREATE INDEX IF NOT EXISTS idx_otp_used ON otp_records(used);
    `);
  }

  /**
   * Generate a numeric OTP
   * @param {number} length - Length of OTP (default: 6)
   * @returns {string} Generated OTP
   */
  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[crypto.randomInt(0, digits.length)];
    }
    return otp;
  }

  /**
   * Validate phone number format (must be Indian number with country code 91)
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  validatePhoneNumber(phoneNumber) {
    // Remove any spaces or special characters
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Check if it starts with 91 and has 10 digits after that
    const indianNumberRegex = /^91[6-9]\d{9}$/;
    return indianNumberRegex.test(cleaned);
  }

  /**
   * Send SMS using SMSGatewayHub API
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - SMS message
   * @returns {Promise<Object>} Response object
   */
  async sendSMS(phoneNumber, message) {
    try {
      const params = {
        APIKey: this.smsConfig.apiKey,
        senderid: this.smsConfig.senderId,
        channel: this.smsConfig.channel,
        DCS: this.smsConfig.dcs,
        flashsms: this.smsConfig.flash,
        number: phoneNumber,
        text: message,
        route: this.smsConfig.route,
        EntityId: this.smsConfig.entityId,
        dlttemplateid: this.smsConfig.dltTemplateId
      };

      const response = await axios.post(this.smsConfig.apiUrl, null, { params });
      
      const responseData = response.data;
      
      return {
        success: responseData.ErrorCode === '000',
        errorCode: responseData.ErrorCode,
        errorMessage: responseData.ErrorMessage,
        jobId: responseData.JobId,
        rawResponse: JSON.stringify(responseData)
      };
    } catch (error) {
      console.error('SMS sending error:', error.message);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        rawResponse: error.toString()
      };
    }
  }

  /**
   * Generate and send OTP to phone number
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} ipAddress - Request IP address
   * @param {string} userAgent - Request user agent
   * @returns {Promise<Object>} Result object
   */
  async sendOTP(phoneNumber, ipAddress = null, userAgent = null) {
    try {
      // Validate phone number
      if (!this.validatePhoneNumber(phoneNumber)) {
        return {
          success: false,
          error: 'Invalid phone number. Must be Indian number with country code 91 (e.g., 919876543210)'
        };
      }

      // Check rate limiting - max 3 OTPs per phone number per 10 minutes
      const recentOTPs = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM otp_records 
        WHERE contact_no = ? 
        AND generated_at > datetime('now', '-10 minutes')
      `).get(phoneNumber);

      if (recentOTPs.count >= 3) {
        return {
          success: false,
          error: 'Too many OTP requests. Please try again after 10 minutes.'
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      const generatedAt = new Date();
      const expiredAt = new Date(generatedAt.getTime() + 4 * 60 * 1000); // 4 minutes

      // Prepare SMS message - Simple format for DLT compliance
      const message = `Your OTP is ${otp}. Valid for 4 minutes. Do not share. -DLC Portal`;

      // Send SMS
      const smsResult = await this.sendSMS(phoneNumber, message);

      if (!smsResult.success) {
        return {
          success: false,
          error: 'Failed to send OTP via SMS',
          details: smsResult.errorMessage
        };
      }

      // Store OTP in database
      const insertStmt = this.db.prepare(`
        INSERT INTO otp_records (contact_no, otp_code, generated_at, expired_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        phoneNumber,
        otp,
        generatedAt.toISOString(),
        expiredAt.toISOString(),
        ipAddress,
        userAgent
      );

      return {
        success: true,
        message: 'OTP sent successfully',
        expiresAt: expiredAt.toISOString(),
        jobId: smsResult.jobId
      };

    } catch (error) {
      console.error('Send OTP error:', error);
      return {
        success: false,
        error: 'Failed to send OTP',
        details: error.message
      };
    }
  }

  /**
   * Verify OTP
   * @param {string} phoneNumber - Phone number
   * @param {string} otp - OTP to verify
   * @param {string} ipAddress - Request IP address
   * @returns {Object} Verification result
   */
  verifyOTP(phoneNumber, otp, ipAddress = null) {
    try {
      // Find valid OTP
      const otpRecord = this.db.prepare(`
        SELECT * FROM otp_records
        WHERE contact_no = ?
        AND otp_code = ?
        AND used = 0
        AND expired_at > datetime('now')
        ORDER BY generated_at DESC
        LIMIT 1
      `).get(phoneNumber, otp);

      if (!otpRecord) {
        return {
          success: false,
          error: 'Invalid or expired OTP'
        };
      }

      // Mark OTP as used
      const updateStmt = this.db.prepare(`
        UPDATE otp_records
        SET used = 1, verified_at = datetime('now')
        WHERE id = ?
      `);
      
      updateStmt.run(otpRecord.id);

      return {
        success: true,
        message: 'OTP verified successfully'
      };

    } catch (error) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        error: 'Failed to verify OTP',
        details: error.message
      };
    }
  }

  /**
   * Clean up expired OTPs (run periodically)
   */
  cleanupExpiredOTPs() {
    try {
      const deleteStmt = this.db.prepare(`
        DELETE FROM otp_records
        WHERE expired_at < datetime('now', '-1 day')
      `);
      
      const result = deleteStmt.run();
      console.log(`Cleaned up ${result.changes} expired OTP records`);
      
      return {
        success: true,
        deletedCount: result.changes
      };
    } catch (error) {
      console.error('Cleanup OTPs error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get OTP statistics for a phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Object} Statistics
   */
  getOTPStats(phoneNumber) {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_sent,
          SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) as total_verified,
          MAX(generated_at) as last_sent
        FROM otp_records
        WHERE contact_no = ?
      `).get(phoneNumber);

      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Get OTP stats error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new OTPService();
