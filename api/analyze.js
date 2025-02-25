const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Helper function to parse and validate the JSON response
function parseResponse(text) {
    console.log('Parsing response text:', text);
    
    try {
        // Try to parse the response as JSON
        const data = JSON.parse(text);
        
        // Validate the required structure
        if (!data.summary || !Array.isArray(data.tables)) {
            console.log('Invalid JSON structure - missing required fields');
            return { summary: '', tables: [] };
        }
        
        return {
            summary: data.summary,
            tables: data.tables,
            otherStructuredData: data.otherStructuredData || {}
        };
    } catch (error) {
        console.error('Failed to parse JSON response:', error);
        return { summary: '', tables: [], otherStructuredData: {} };
    }
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
                role: "user",
                parts: [{ text: `IMPORTANT: You are a JSON extraction API endpoint. Your response must be a single JSON object with no other text.

Example response format:
{
    "summary": "Example summary",
    "tables": [{
        "headers": ["Title", "Year", "Medium", "Price"],
        "rows": [
            ["Artwork 1", "2018", "Oil on canvas", "1000"],
            ["Artwork 2", "2019", "Sculpture", "2000"]
        ]
    }]
}

Rules:
1. Start response with {
2. End response with }
3. No text before or after the JSON
4. No markdown formatting
5. No **bold** or other formatting
6. Keep numbers as plain strings without currency symbols

Now process this PDF and return a JSON object:` },
                    { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
                ]
            }],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 2048,
                topK: 1,
                topP: 0
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

            try {
                // Extract text from the response
                const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
                console.log('Raw response text:', responseText);

                // Try to extract JSON from the response text
                let jsonText = responseText;
                
                // If response contains markdown or other text, try to extract JSON
                if (!jsonText.trim().startsWith('{')) {
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);  // Match everything between { and }
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                        console.log('Extracted JSON from response:', jsonText);
                    } else {
                        throw new Error('No JSON object found in response');
                    }
                }

                // Try to parse the JSON
                const parsedData = JSON.parse(jsonText);
                
                // Create the structured response
                const structuredData = {
                    summary: parsedData.summary || '',
                    tables: Array.isArray(parsedData.tables) ? parsedData.tables : []
                };

                // Validate table structure
                structuredData.tables = structuredData.tables.map(table => ({
                    headers: Array.isArray(table.headers) ? table.headers : [],
                    rows: Array.isArray(table.rows) ? table.rows : []
                }));

                console.log('Successfully processed data:', structuredData);
                return structuredData;

            } catch (error) {
                console.error('Error processing response:', error.message);
                if (error.message.includes('JSON')) {
                    console.log('Invalid JSON format received');
                }
                
                // Return empty structure
                return {
                    summary: '',
                    tables: []
                };
            }

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
