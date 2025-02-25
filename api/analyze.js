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
    // Enable response streaming
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
        
        // Define expected fields for validation
        const expectedFields = [
            'title',
            'artist',
            'year',
            'medium',
            'dimensions_unframed',
            'dimensions_framed',
            'edition',
            'inventory_number',
            'price'
        ];

        const geminiPayload = {
            contents: [{
                role: "system",
                parts: [{ text: `You are a JSON extraction API. You must output ONLY valid JSON.
Do not include ANY other text, markdown, or formatting in your response.
Your response must start with { and end with } and be parseable by JSON.parse().
` }]
            }, {
                role: "user",
                parts: [{ text: `Return ONLY this JSON structure with no other text:
{
  "summary": string,  // Brief catalog summary
  "artworks": [{
    "title": string,         // e.g. "Untitled (Block party)"
    "artist": string,        // Always "Sadie Barnette"
    "year": string,         // e.g. "2018"
    "medium": string,       // e.g. "Archival pigment print"
    "dimensions_unframed": string,  // e.g. "40.25 x 60 in."
    "dimensions_framed": string,    // e.g. "41 x 60.25 in."
    "edition": string|null,  // e.g. "1" or null
    "inventory_number": string,     // e.g. "SB127"
    "price": string         // e.g. "15000.00" (no $ or ,)
  }],
  "metadata": {
    "total_artworks": number,
    "fields": ["title", "artist", "year", "medium", "dimensions_unframed", "dimensions_framed", "edition", "inventory_number", "price"]
  }
}

Rules:
1. Output ONLY valid JSON - no other text
2. Start with { and end with }
3. Use exact field names shown
4. Remove $ and , from prices
5. Use null for missing values

Process this PDF:` },
                    { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
                ]
            }],
            safetySettings: [{
                category: "HARM_CATEGORY_DANGEROUS",
                threshold: "BLOCK_NONE"
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

            // Call Gemini API with timeout and better error handling
            const geminiResponse = await axios.post(`${apiEndpoint}?key=${apiKey}`, geminiPayload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 45000, // 45 second timeout
                maxBodyLength: 20 * 1024 * 1024, // 20MB max
                validateStatus: status => status < 500 // Only reject on 5xx errors
            }).catch(error => {
                console.error('Gemini API error:', error.message);
                if (error.response) {
                    console.error('Gemini API response:', error.response.data);
                }
                throw new Error(`Gemini API error: ${error.message}`);
            });

            if (!geminiResponse.data || !geminiResponse.data.candidates || !geminiResponse.data.candidates[0]) {
                console.error('Invalid Gemini response structure:', geminiResponse.data);
                throw new Error('Invalid response from Gemini API');
            }

            console.log('Received response from Gemini API:', JSON.stringify(geminiResponse.data, null, 2));

            try {
                // Extract text from the response
                const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
                console.log('Raw response text:', responseText);

                // Remove any non-JSON content
                const jsonMatch = responseText.match(/^\s*\{[\s\S]*\}\s*$/);
                if (!jsonMatch) {
                    throw new Error('Response contains non-JSON content');
                }

                // Try to parse the JSON
                const parsedData = JSON.parse(jsonMatch[0]);
                
                // Validate required fields
                if (typeof parsedData.summary !== 'string') {
                    throw new Error('Summary must be a string');
                }
                if (!Array.isArray(parsedData.artworks)) {
                    throw new Error('Artworks must be an array');
                }
                if (!parsedData.metadata || typeof parsedData.metadata !== 'object') {
                    throw new Error('Metadata must be an object');
                }

                // Validate metadata
                if (!Array.isArray(parsedData.metadata.fields)) {
                    throw new Error('Metadata fields must be an array');
                }
                if (typeof parsedData.metadata.total_artworks !== 'number') {
                    throw new Error('Total artworks must be a number');
                }

                // Validate each artwork has required fields
                parsedData.artworks = parsedData.artworks.map((artwork, index) => {
                    // Validate all required fields exist
                    for (const field of expectedFields) {
                        if (!(field in artwork)) {
                            throw new Error(`Artwork ${index} missing required field: ${field}`);
                        }
                    }

                    // Clean and validate fields
                    return {
                        title: String(artwork.title || ''),
                        artist: String(artwork.artist || 'Sadie Barnette'),
                        year: String(artwork.year || ''),
                        medium: String(artwork.medium || ''),
                        dimensions_unframed: String(artwork.dimensions_unframed || ''),
                        dimensions_framed: String(artwork.dimensions_framed || ''),
                        edition: artwork.edition === null ? null : String(artwork.edition),
                        inventory_number: String(artwork.inventory_number || ''),
                        price: artwork.price ? String(artwork.price).replace(/[$,]/g, '') : null
                    };
                });

                // Update total artworks count
                parsedData.metadata.total_artworks = parsedData.artworks.length;
                parsedData.metadata.fields = expectedFields;

                console.log('Successfully processed data:', parsedData);
                return parsedData;

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
