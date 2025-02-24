document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileDetails = document.getElementById('file-details');
    const uploadButton = document.getElementById('upload-button');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when file is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    
    // Handle file input change
    fileInput.addEventListener('change', handleFileSelect, false);

    // Handle click on drop zone
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropZone.classList.add('border-primary');
        dropZone.classList.remove('border-gray-300');
    }

    function unhighlight(e) {
        dropZone.classList.remove('border-primary');
        dropZone.classList.add('border-gray-300');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    async function handleFile(file) {
        if (!file) return;
        
        // Check if file is PDF
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file');
            return;
        }

        // Check file size (4MB limit for Vercel)
        if (file.size > 4 * 1024 * 1024) {
            fileDetails.innerHTML = `
                <div class="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
                    <p class="font-medium">File too large</p>
                    <p class="text-sm mt-1">Please upload a PDF smaller than 4MB for Vercel deployments.</p>
                </div>
            `;
            return;
        }

        // Display file details
        const size = formatFileSize(file.size);
        fileDetails.innerHTML = `
            <div class="flex items-center space-x-2 text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="font-medium">${file.name}</span>
                <span class="text-sm text-gray-500">(${size})</span>
            </div>
        `;
        
        // Show upload button
        uploadButton.classList.remove('hidden');
        uploadButton.style.display = 'inline-flex';

        // Add click handler for upload button
        uploadButton.onclick = async (e) => {
            e.preventDefault();
            try {
                uploadButton.disabled = true;
                uploadButton.textContent = 'Processing...';

                const formData = new FormData();
                formData.append('pdf', file);

                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Upload failed');
                }

                // Show analysis results
                fileDetails.innerHTML += `
                    <div class="mt-4 p-4 bg-green-50 text-green-700 rounded-lg">
                        <p class="font-medium">Analysis completed successfully!</p>
                        <p class="text-sm mt-1">Session ID: ${result.data.sessionId}</p>
                        
                        <div class="mt-4">
                            <h3 class="font-medium mb-2">Summary</h3>
                            <p class="text-sm">${result.data.summary || 'No summary available'}</p>
                        </div>

                        ${renderTables(result.data.structuredData.tables)}
                        ${renderOtherStructuredData(result.data.structuredData.otherStructuredData)}
                    </div>
                `;

                // Display debug logs at the bottom if they exist
                if (result.data.logs) {
                    const logsDiv = document.getElementById('debug-logs') || createLogsDiv();
                    logsDiv.innerHTML = `
                        <div class="mt-8 p-4 bg-gray-50 rounded-lg">
                            <h3 class="text-lg font-medium mb-4">Debug Logs</h3>
                            
                            <div class="mb-4">
                                <h4 class="font-medium mb-2">Request Payload:</h4>
                                <pre class="text-sm bg-white p-3 rounded overflow-auto max-h-60 border">${JSON.stringify(result.data.logs.request, null, 2)}</pre>
                            </div>

                            <div>
                                <h4 class="font-medium mb-2">API Response:</h4>
                                <pre class="text-sm bg-white p-3 rounded overflow-auto max-h-60 border">${JSON.stringify(result.data.logs.response, null, 2)}</pre>
                            </div>
                        </div>
                    `;
                }

                // Hide upload button after successful upload
                uploadButton.style.display = 'none';

            } catch (error) {
                console.error('Upload error:', error);
                let errorMessage = error.message;

                // Handle specific error cases
                if (error.message.includes('413')) {
                    errorMessage = 'File is too large. Please try a smaller PDF (max 4MB for Vercel deployments).';
                } else if (error.message.includes('SyntaxError')) {
                    errorMessage = 'Error parsing API response. This might be due to a timeout or server error.';
                }

                fileDetails.innerHTML += `
                    <div class="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
                        <p class="font-medium">Upload failed</p>
                        <p class="text-sm mt-1">${errorMessage}</p>
                        ${error.response ? `<pre class="mt-2 text-xs bg-white p-2 rounded">${JSON.stringify(error.response.data, null, 2)}</pre>` : ''}
                    </div>
                `;
            } finally {
                uploadButton.disabled = false;
                uploadButton.textContent = 'Analyze PDF';
            }
        };
    }

    // Render tables
    function renderTables(tables) {
        if (!tables || tables.length === 0) {
            return `
                <div class="mt-4">
                    <h3 class="font-medium mb-2">Tables</h3>
                    <p class="text-sm text-gray-500">No tables found in the document.</p>
                </div>
            `;
        }

        return `
            <div class="mt-4">
                <h3 class="font-medium mb-2">Tables</h3>
                ${tables.map((table, index) => `
                    <div class="mb-4 bg-white p-4 rounded-lg border">
                        <h4 class="font-medium text-lg">${table.title || `Table ${index + 1}`}</h4>
                        ${table.description ? `<p class="text-sm text-gray-600 mb-2">${table.description}</p>` : ''}
                        ${table.location ? `<p class="text-xs text-gray-500 mb-2">Location: ${table.location}</p>` : ''}
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        ${table.headers.map(header => `
                                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                ${header}
                                            </th>
                                        `).join('')}
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${table.rows.map(row => `
                                        <tr>
                                            ${row.map(cell => `
                                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    ${cell}
                                                </td>
                                            `).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Render other structured data
    function renderOtherStructuredData(data) {
        if (!data) return '';

        let sections = [];

        // Render key figures
        if (data.key_figures && Object.keys(data.key_figures.values || {}).length > 0) {
            sections.push(`
                <div class="mb-4">
                    <h4 class="font-medium mb-2">Key Figures</h4>
                    ${data.key_figures.description ? `<p class="text-sm text-gray-600 mb-2">${data.key_figures.description}</p>` : ''}
                    <div class="grid grid-cols-2 gap-4">
                        ${Object.entries(data.key_figures.values).map(([key, value]) => `
                            <div class="bg-white p-3 rounded border">
                                <div class="text-sm text-gray-500">${key}</div>
                                <div class="font-medium">${value}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `);
        }

        // Render lists
        if (data.lists && data.lists.length > 0) {
            sections.push(`
                <div class="mb-4">
                    <h4 class="font-medium mb-2">Lists</h4>
                    ${data.lists.map(list => `
                        <div class="bg-white p-4 rounded border mb-2">
                            ${list.title ? `<h5 class="font-medium mb-2">${list.title}</h5>` : ''}
                            <ul class="list-disc list-inside">
                                ${list.items.map(item => `
                                    <li class="text-sm text-gray-600">${item}</li>
                                `).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            `);
        }

        if (sections.length === 0) return '';

        return `
            <div class="mt-4">
                <h3 class="font-medium mb-2">Other Structured Data</h3>
                ${sections.join('')}
            </div>
        `;
    }

    // Create logs container
    function createLogsDiv() {
        const logsDiv = document.createElement('div');
        logsDiv.id = 'debug-logs';
        document.body.appendChild(logsDiv);
        return logsDiv;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
