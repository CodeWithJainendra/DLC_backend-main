const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3010;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

console.log('Starting minimal DLC server...');

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Minimal DLC Server'
    });
});

// Test SBI integration loading
app.get('/test-sbi', async (req, res) => {
    try {
        console.log('Loading SBI Integration...');
        const SBIIntegration = require('./sbi-integration');
        console.log('Creating SBI Integration instance...');
        const sbiIntegration = new SBIIntegration();
        console.log('SBI Integration created successfully');
        
        res.json({
            success: true,
            message: 'SBI Integration loaded successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('SBI Integration failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Minimal DLC Server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Test SBI: http://localhost:${PORT}/test-sbi`);
});

module.exports = app;
