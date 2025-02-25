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
                parts: [{ text: `You are a JSON data extraction API. You must return ONLY valid JSON, no other text.

Function: extract_pdf_data(pdf_content)
Return type: application/json
Schema:
{
    "summary": string,
    "field_info": {
        "total_fields": number,
        "field_names": string[],
        "total_records": number
    },
    "tables": [{
        "title": string,
        "field_count": number,
        "record_count": number,
        "headers": string[],
        "rows": any[][]
    }]
}

Validation:
- Response must parse with JSON.parse()
- No text outside JSON object
- No comments in JSON
- No markdown formatting

Input PDF follows below:
` }]
            }, {
                role: "model",
                parts: [{ text: `I understand. I will:
1. Extract data from the PDF
2. Return only a JSON object matching the schema
3. Include no text outside the JSON
4. Use no markdown or formatting
5. Ensure the response is valid JSON

Proceeding with extraction...` }]
            }, {
                role: "user",
                parts: [{ text: `Correct. Now process this PDF and return ONLY the JSON response:` },
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

            // Extract text from the response
            const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
            console.log('Extracted text:', responseText);

            // Parse the response text and extract data
            const parsedData = parseResponse(responseText);
            
            // Create the structured response using the parsed data directly
            const structuredData = {
                summary: parsedData.summary,
                tables: parsedData.tables,
                otherStructuredData: parsedData.otherStructuredData
            };

            console.log('Processed data:', structuredData);

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
