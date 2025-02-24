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

        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            alert('File size must be less than 10MB');
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
                            <p class="text-sm">${result.data.summary}</p>
                        </div>

                        <div class="mt-4">
                            <h3 class="font-medium mb-2">Structured Data</h3>
                            <pre class="text-sm bg-white p-2 rounded overflow-auto max-h-60">${JSON.stringify(result.data.structuredData, null, 2)}</pre>
                        </div>
                    </div>
                `;

                // Hide upload button after successful upload
                uploadButton.style.display = 'none';

            } catch (error) {
                console.error('Upload error:', error);
                fileDetails.innerHTML += `
                    <div class="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
                        <p class="font-medium">Upload failed</p>
                        <p class="text-sm mt-1">${error.message}</p>
                    </div>
                `;
            } finally {
                uploadButton.disabled = false;
                uploadButton.textContent = 'Analyze PDF';
            }
        };
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
