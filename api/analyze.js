const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Helper function to parse markdown-style tables
function parseMarkdownTable(text) {
    // Find the table in the text
    const tableMatch = text.match(/\|([^\n]+\|)+\n\|([-:\|\s]+\|)+\n((\|[^\n]+\|)+\n?)+/);
    if (!tableMatch) return { headers: [], rows: [] };

    // Split into lines and clean up
    const lines = tableMatch[0].split('\n').filter(line => line.trim());
    
    // Parse headers
    const headers = lines[0]
        .split('|')
        .filter(cell => cell.trim())
        .map(cell => cell.trim());

    // Skip the separator line (line[1])
    
    // Parse rows
    const rows = lines.slice(2)
        .filter(line => line.trim())
        .map(line => 
            line
                .split('|')
                .filter(cell => cell.trim())
                .map(cell => cell.trim())
        );

    return { headers, rows };
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 4 * 1024 * 1024, // 4MB limit (Vercel's limit)
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'), false);
        }
        cb(null, true);
    }
}).single('pdf');

// Helper function to handle multer upload
const handleUpload = (req, res) => {
    return new Promise((resolve, reject) => {
        upload(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                // Multer error (e.g., file too large)
                reject({
                    status: 400,
                    message: err.message
                });
            } else if (err) {
                // Other errors (e.g., wrong file type)
                reject({
                    status: 400,
                    message: err.message
                });
            } else {
                resolve();
            }
        });
    });
};

// Main handler function
module.exports = async (req, res) => {
    try {
        // Handle the file upload
        await handleUpload(req, res);

        // Check if file was provided
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file was uploaded'
            });
        }

        // Generate session ID
        const sessionId = uuidv4();

        // Convert file buffer to base64
        const base64Pdf = req.file.buffer.toString('base64');

        // Validate API key
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw {
                status: 500,
                message: 'Gemini API key is missing'
            };
        }

        // Prepare request to Gemini API
        const apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        
        const geminiPayload = {
            contents: [{
                parts: [
                    { text: `Please analyze this PDF and return a JSON response with the following structure:
{
    "summary": "A brief summary of the document",
    "tables": [
        {
            "title": "Title or caption of the table",
            "description": "A brief description of what this table represents",
            "headers": ["Column1", "Column2", ...],
            "rows": [["value1", "value2", ...], ...],
            "location": "Page or section where this table appears"
        }
    ],
    "otherStructuredData": {
        "key_figures": {
            "description": "Any important numerical data or statistics",
            "values": {"label1": "value1", ...}
        },
        "lists": [
            {
                "title": "Title of the list",
                "items": ["item1", "item2", ...]
            }
        ]
    }
}

Please ensure all tables are properly structured with consistent columns and data types. If no tables are found, return an empty array for 'tables'.` },
                    { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
                ]
            }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024
            }
        };

        try {
            console.log('Sending request to Gemini API:', JSON.stringify(geminiPayload, null, 2));

            // Call Gemini API
            const geminiResponse = await axios.post(`${apiEndpoint}?key=${apiKey}`, geminiPayload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('Received response from Gemini API:', JSON.stringify(geminiResponse.data, null, 2));

            // Extract text from the response
            const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
            console.log('Extracted text:', responseText);

            // Parse the response text and extract tables
            const tableData = parseMarkdownTable(responseText);
            
            // Calculate pricing
            const baseFee = 1.00;
            const perRecordFee = 0.10;
            const numRecords = tableData.rows.length;
            const totalPrice = baseFee + (numRecords * perRecordFee);

            // Create the structured response
            const summary = 'Analysis complete';
            const structuredData = {
                tables: [{
                    title: 'Artwork Inventory',
                    description: 'Detailed list of artworks with their specifications and pricing',
                    headers: tableData.headers,
                    rows: tableData.rows,
                    location: 'Document body'
                }],
                otherStructuredData: {
                    key_figures: {
                        description: 'Pricing Information',
                        values: {
                            'Number of Records': numRecords.toString(),
                            'Base Fee': `$${baseFee.toFixed(2)}`,
                            'Per Record Fee': `$${perRecordFee.toFixed(2)}`,
                            'Total Price': `$${totalPrice.toFixed(2)}`
                        }
                    },
                    lists: []
                }
            };

            console.log('Processed table data:', structuredData);

            // Optional: Store in Redis here if configured
            // const redisKey = `analysis:${sessionId}`;
            // await redis.setex(redisKey, 3600, JSON.stringify({ summary, structuredData }));

            // Return processed response
            res.status(200).json({
                success: true,
                message: 'File successfully analyzed',
                data: {
                    sessionId,
                    filename: req.file.originalname,
                    size: req.file.size,
                    summary,
                    structuredData,
                    logs: {
                        request: geminiPayload,
                        response: geminiResponse.data
                    }
                }
            });
        } catch (geminiError) {
            console.error('Gemini API Error:', geminiError.response?.data || geminiError.message);
            throw {
                status: 502,
                message: 'Error processing PDF with Gemini API'
            };
        }

    } catch (error) {
        // Handle any errors
        const status = error.status || 500;
        const message = error.message || 'Internal server error';
        
        res.status(status).json({
            success: false,
            message: message
        });
    }
};
