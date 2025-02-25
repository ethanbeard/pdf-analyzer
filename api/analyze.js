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

        // First extract raw data
        const extractionPayload = {
            contents: [{
                role: "system",
                parts: [{ text: `You are a data extraction system. Extract artwork information from the PDF in this exact format (no other text):

TITLE: <title>
ARTIST: <artist>
YEAR: <year>
MEDIUM: <medium>
DIMENSIONS_UNFRAMED: <dimensions>
DIMENSIONS_FRAMED: <dimensions or NONE>
EDITION: <edition or NONE>
INVENTORY: <inventory number>
PRICE: <price without $ or ,>
---
` }]
            }, {
                role: "system",
                parts: [{ text: `You are a JSON extraction API. You must output ONLY valid JSON.
Do not include ANY other text, markdown, or formatting in your response.
Your response must start with { and end with } and be parseable by JSON.parse().
` }]
            }, {
                role: "user",
                parts: [{ text: `Extract all artwork information from this PDF. Follow these rules:
1. Use the exact format shown in the system message
2. Include every artwork found
3. Remove $ and , from prices
4. Use NONE for missing values
5. Start each artwork with TITLE: and end with ---
6. Include nothing else in your response
` },
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
                const rawText = geminiResponse.data.candidates[0].content.parts[0].text;
                console.log('Raw extraction text:', rawText);

                // Split into artwork entries
                const artworks = rawText.split('---\n').filter(entry => entry.trim());

                // Parse each artwork entry
                const parsedArtworks = artworks.map(entry => {
                    const lines = entry.trim().split('\n');
                    const artwork = {};

                    lines.forEach(line => {
                        const [key, ...valueParts] = line.split(': ');
                        const value = valueParts.join(': ').trim();
                        
                        switch(key) {
                            case 'TITLE':
                                artwork.title = value;
                                break;
                            case 'ARTIST':
                                artwork.artist = value;
                                break;
                            case 'YEAR':
                                artwork.year = value;
                                break;
                            case 'MEDIUM':
                                artwork.medium = value;
                                break;
                            case 'DIMENSIONS_UNFRAMED':
                                artwork.dimensions_unframed = value;
                                break;
                            case 'DIMENSIONS_FRAMED':
                                artwork.dimensions_framed = value === 'NONE' ? null : value;
                                break;
                            case 'EDITION':
                                artwork.edition = value === 'NONE' ? null : value;
                                break;
                            case 'INVENTORY':
                                artwork.inventory_number = value;
                                break;
                            case 'PRICE':
                                artwork.price = value.replace(/[$,]/g, '');
                                break;
                        }
                    });

                    return artwork;
                });

                // Now get a summary
                const summaryPayload = {
                    contents: [{
                        role: "user",
                        parts: [{ text: `Write a brief 1-2 sentence summary of this art catalog, focusing on the types of artwork and materials used. Be concise and factual:` },
                            { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0,
                        maxOutputTokens: 150,
                        topK: 1,
                        topP: 0
                    }
                };

                const summaryResponse = await axios.post(`${apiEndpoint}?key=${apiKey}`, summaryPayload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                });

                const summary = summaryResponse.data.candidates[0].content.parts[0].text;

                // Construct final response
                const structuredData = {
                    summary: summary,
                    artworks: parsedArtworks,
                    metadata: {
                        total_artworks: parsedArtworks.length,
                        fields: expectedFields
                    }
                };

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
