// Excel Upload and Analysis JavaScript
let authToken = localStorage.getItem('authToken');
let selectedFile = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    setupEventListeners();
});

// Check if user is authenticated
async function checkAuthentication() {
    if (!authToken) {
        redirectToLogin();
        return;
    }

    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('userInfo').textContent = `Welcome, ${data.user.fullName} (${data.user.role})`;
        } else {
            redirectToLogin();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        redirectToLogin();
    }
}

function redirectToLogin() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    window.location.href = '/public/login.html';
}

function logout() {
    localStorage.removeItem('authToken');
    redirectToLogin();
}

// Setup event listeners
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // Drag and drop events
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // File input change
    fileInput.addEventListener('change', handleFileSelect);
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files: files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                       'application/vnd.ms-excel', 'text/csv'];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showError('Please select a valid Excel file (.xlsx, .xls) or CSV file');
        return;
    }

    selectedFile = file;
    displayFileInfo(file);
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');

    fileName.textContent = file.name;
    fileSize.textContent = `(${formatFileSize(file.size)})`;
    fileInfo.classList.remove('hidden');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Analyze and insert file data
async function analyzeFile() {
    if (!selectedFile) {
        showError('Please select a file first');
        return;
    }

    showLoadingModal('Analyzing Excel file structure...');
    
    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('excelFile', selectedFile);

        // Upload and analyze file
        const response = await fetch('/api/excel/analyze-and-insert', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        hideLoadingModal();

        if (result.success) {
            displayAnalysisResults(result.data);
        } else {
            showError(result.error || 'Analysis failed');
        }

    } catch (error) {
        hideLoadingModal();
        console.error('Analysis error:', error);
        showError('Failed to analyze file: ' + error.message);
    }
}

function displayAnalysisResults(data) {
    // Show analysis results section
    document.getElementById('analysisResults').classList.remove('hidden');
    
    // Update summary cards
    document.getElementById('totalRecords').textContent = data.totalRecords || 0;
    document.getElementById('detectedTables').textContent = data.detectedTables || 0;
    
    // Update status
    updateProcessingStatus('completed', 'Success');
    
    // Display table mapping
    if (data.tableMappings && data.tableMappings.length > 0) {
        displayTableMappings(data.tableMappings);
    }
    
    // Display data preview
    if (data.preview && data.preview.length > 0) {
        displayDataPreview(data.preview);
    }
    
    // Display insertion results
    if (data.insertionResults) {
        displayInsertionResults(data.insertionResults);
    }
}

function displayTableMappings(mappings) {
    const section = document.getElementById('tableMappingSection');
    const container = document.getElementById('tableMappingResults');
    
    container.innerHTML = '';
    
    mappings.forEach((mapping, index) => {
        const mappingCard = document.createElement('div');
        mappingCard.className = 'bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500';
        
        mappingCard.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-gray-800">
                    <i class="fas fa-table text-blue-500 mr-2"></i>
                    ${mapping.sheetName || `Sheet ${index + 1}`}
                </h4>
                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                    ${mapping.recordCount} records
                </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-600 mb-1">Detected Table:</p>
                    <p class="font-medium text-gray-800">${mapping.targetTable}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-600 mb-1">Confidence:</p>
                    <div class="flex items-center">
                        <div class="bg-gray-200 rounded-full h-2 flex-1 mr-2">
                            <div class="bg-green-500 h-2 rounded-full" style="width: ${mapping.confidence}%"></div>
                        </div>
                        <span class="text-sm font-medium">${mapping.confidence}%</span>
                    </div>
                </div>
            </div>
            <div class="mt-3">
                <p class="text-sm text-gray-600 mb-1">Column Mappings:</p>
                <div class="flex flex-wrap gap-2">
                    ${mapping.columnMappings.map(col => 
                        `<span class="bg-white px-2 py-1 rounded text-xs border">
                            ${col.source} → ${col.target}
                        </span>`
                    ).join('')}
                </div>
            </div>
        `;
        
        container.appendChild(mappingCard);
    });
    
    section.classList.remove('hidden');
}

function displayDataPreview(preview) {
    const section = document.getElementById('dataPreviewSection');
    const container = document.getElementById('dataPreview');
    
    if (!preview || preview.length === 0) return;
    
    // Create table
    const table = document.createElement('table');
    table.className = 'min-w-full bg-white border border-gray-200';
    
    // Create header
    const thead = document.createElement('thead');
    thead.className = 'bg-gray-50';
    const headerRow = document.createElement('tr');
    
    Object.keys(preview[0]).forEach(key => {
        const th = document.createElement('th');
        th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b';
        th.textContent = key;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-gray-200';
    
    preview.slice(0, 10).forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-b';
            td.textContent = value || '-';
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
    
    section.classList.remove('hidden');
}

function displayInsertionResults(results) {
    const section = document.getElementById('insertionResults');
    const container = document.getElementById('insertionSummary');
    
    container.innerHTML = '';
    
    results.forEach(result => {
        const resultCard = document.createElement('div');
        resultCard.className = `p-4 rounded-lg border-l-4 ${
            result.success ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
        }`;
        
        resultCard.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}">
                        <i class="fas ${result.success ? 'fa-check-circle text-green-500' : 'fa-exclamation-circle text-red-500'} mr-2"></i>
                        ${result.tableName}
                    </h4>
                    <p class="text-sm ${result.success ? 'text-green-600' : 'text-red-600'} mt-1">
                        ${result.message}
                    </p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${result.success ? 'text-green-800' : 'text-red-800'}">
                        ${result.recordsInserted || 0} records
                    </p>
                    ${result.duplicatesSkipped ? 
                        `<p class="text-xs text-gray-500">${result.duplicatesSkipped} duplicates skipped</p>` : ''
                    }
                </div>
            </div>
        `;
        
        container.appendChild(resultCard);
    });
    
    section.classList.remove('hidden');
}

function updateProcessingStatus(status, message) {
    const statusCard = document.getElementById('statusCard');
    const statusText = document.getElementById('processingStatus');
    const statusIcon = document.getElementById('statusIcon');
    
    statusText.textContent = message;
    
    if (status === 'completed') {
        statusCard.className = 'success-card text-white p-6 rounded-xl';
        statusIcon.className = 'fas fa-check-circle text-4xl opacity-80';
    } else if (status === 'error') {
        statusCard.className = 'error-card text-white p-6 rounded-xl';
        statusIcon.className = 'fas fa-exclamation-circle text-4xl opacity-80';
    } else {
        statusCard.className = 'analysis-card text-white p-6 rounded-xl';
        statusIcon.className = 'fas fa-spinner fa-spin text-4xl opacity-80';
    }
}

function showLoadingModal(message) {
    const modal = document.getElementById('loadingModal');
    const loadingText = document.getElementById('loadingText');
    
    loadingText.textContent = message;
    modal.classList.remove('hidden');
    
    // Simulate progress
    let progress = 0;
    const progressBar = document.getElementById('modalProgressBar');
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        progressBar.style.width = progress + '%';
    }, 500);
    
    // Store interval ID to clear it later
    modal.dataset.intervalId = interval;
}

function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    const intervalId = modal.dataset.intervalId;
    
    if (intervalId) {
        clearInterval(intervalId);
    }
    
    // Complete progress bar
    document.getElementById('modalProgressBar').style.width = '100%';
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('modalProgressBar').style.width = '0%';
    }, 500);
}

function showError(message) {
    alert('Error: ' + message);
    updateProcessingStatus('error', 'Error: ' + message);
}

// Utility function to format numbers
function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}
