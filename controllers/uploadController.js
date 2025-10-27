const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execAsync = promisify(exec);

class UploadController {
  static async uploadExcelFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const uploadedFile = req.file;
      const filePath = uploadedFile.path;
      const originalName = uploadedFile.originalname;

      // Processing uploaded file

      // Validate file type
      if (!originalName.toLowerCase().endsWith('.xlsx')) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          message: 'Only .xlsx files are allowed'
        });
      }

      // Run the insert_db.py script with the uploaded file
      const dbPath = path.join(__dirname, '..', 'database.db');
      const pythonScript = path.join(__dirname, '..', 'insert_db.py');
      
      const command = `python "${pythonScript}" "${filePath}" "${dbPath}"`;
      
      // Executing command
      
      const { stdout, stderr } = await execAsync(command);
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      
      if (stderr) {
        // Python script stderr
        return res.status(500).json({
          success: false,
          message: 'Error processing Excel file',
          error: stderr
        });
      }

      // Python script output

      // Parse the output to get insertion details
      const lines = stdout.split('\n');
      let insertedRows = 0;
      let detectedFormat = 'Unknown';

      for (const line of lines) {
        if (line.includes('Successfully inserted') && line.includes('rows')) {
          const match = line.match(/Successfully inserted (\d+) rows/);
          if (match) {
            insertedRows = parseInt(match[1]);
          }
        }
        if (line.includes('Auto-detected')) {
          if (line.includes('BOB format')) {
            detectedFormat = 'BOB';
          } else if (line.includes('UBI format')) {
            detectedFormat = 'UBI';
          } else if (line.includes('Dashboard format')) {
            detectedFormat = 'Dashboard';
          }
        }
      }

      res.json({
        success: true,
        message: 'File processed successfully',
        data: {
          filename: originalName,
          detectedFormat: detectedFormat,
          rowsInserted: insertedRows,
          output: stdout
        }
      });

    } catch (error) {
      // Upload error
      
      // Clean up uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          // Error cleaning up file
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error processing file',
        error: error.message
      });
    }
  }

  static async getUploadStatus(req, res) {
    try {
      // Get database statistics
      const dbPath = path.join(__dirname, '..', 'database.db');
      
      if (!fs.existsSync(dbPath)) {
        return res.json({
          success: true,
          data: {
            totalRecords: 0,
            banks: []
          }
        });
      }

      // Get total records count
      const countCommand = `sqlite3 "${dbPath}" "SELECT COUNT(*) as total FROM pensioner_bank_master;"`;
      const { stdout: countOutput } = await execAsync(countCommand);
      const totalRecords = parseInt(countOutput.trim());

      // Get banks list
      const banksCommand = `sqlite3 "${dbPath}" "SELECT bank_name, COUNT(*) as count FROM pensioner_bank_master GROUP BY bank_name ORDER BY count DESC;"`;
      const { stdout: banksOutput } = await execAsync(banksCommand);
      
      const banks = banksOutput.trim().split('\n').map(line => {
        const [name, count] = line.split('|');
        return { name: name || 'Unknown', count: parseInt(count) || 0 };
      });

      res.json({
        success: true,
        data: {
          totalRecords,
          banks
        }
      });

    } catch (error) {
      // Status error
      res.status(500).json({
        success: false,
        message: 'Error getting status',
        error: error.message
      });
    }
  }
}

module.exports = UploadController;
