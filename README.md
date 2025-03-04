# PDF Analyzer

An intelligent PDF analysis tool that leverages AI to extract, analyze, and provide insights from PDF documents.

## Project Structure

```
pdf-analyzer/
├── api/              # Serverless API endpoints
│   └── health.js     # Health check endpoint
├── public/           # Static files
│   ├── css/          # Stylesheets
│   │   └── styles.css # Main stylesheet
│   └── index.html    # Landing page
├── index.js          # Express server configuration
├── package.json      # Project dependencies
├── vercel.json       # Vercel deployment configuration
└── README.md         # Project documentation
```

## Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in the root directory with:
   ```
   PORT=3004
   GEMINI_API_KEY=your_api_key_here
   GEMINI_API_ENDPOINT=your_api_endpoint_here
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

   The server will start on http://localhost:3004

4. **View Landing Page**
   - Open your browser and navigate to http://localhost:3004
   - You should see the PDF Analyzer landing page
   - The page is responsive and will adapt to different screen sizes
   - When deployed, the landing page will be accessible at https://parsepdf.io

## Deployment to Vercel (parsepdf.io)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Configure Domain**
   - Log into your Vercel account
   - Add `parsepdf.io` as a custom domain
   - Configure DNS settings as provided by Vercel

3. **Environment Variables**
   Set the following environment variables in your Vercel project settings:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `GEMINI_API_ENDPOINT`: Your Google Gemini API endpoint

4. **Deploy**
   ```bash
   vercel
   ```

   For production deployment:
   ```bash
   vercel --prod
   ```

## Environment Variables

### Required Variables
- `PORT`: Server port (default: 3004)
- `GEMINI_API_KEY`: Your Gemini API key (get it from [Google AI Studio](https://makersuite.google.com/app/apikey))
- `NODE_ENV`: Environment setting (development/production)

### Local Setup
Create a `.env` file in the root directory:
```env
# Server Configuration
PORT=3004

# Gemini API Configuration
GEMINI_API_KEY=your-api-key
```

### Vercel Deployment
1. Go to your project settings in the Vercel dashboard
2. Navigate to the Environment Variables section
3. Add the required variables:
   - `GEMINI_API_KEY`
   - `GEMINI_API_ENDPOINT`
4. Deploy your project to apply the changes

## Features

### File Upload
The application supports PDF file upload through:
- Drag and drop interface
- Traditional file picker

When a file is selected:
1. The file name and size are displayed
2. Only PDF files are accepted
3. An "Analyze PDF" button appears

### Pricing
- Base fee: $1.00 per document
- Per record: $0.10

## Testing File Upload

1. **Local Testing**
   - Start the development server: `npm run dev`
   - Open http://localhost:3004 in your browser
   - Try uploading a PDF file by:
     a. Dragging and dropping a PDF onto the upload zone
     b. Clicking the upload zone and selecting a PDF
   - Verify that:
     - The file name and size are displayed
     - Non-PDF files are rejected
     - The "Analyze PDF" button appears after selection

2. **Production Testing**
   - Visit the deployed site
   - Perform the same upload tests as above
   - Verify the upload interface is responsive on mobile devices

## API Endpoints

### Health Check
- `GET /api/health`: Health check endpoint
  - Returns: `{ status: 'healthy', timestamp: '...' }`

### PDF Analysis
- `POST /api/analyze`: Upload and analyze a PDF file
  - Content-Type: `multipart/form-data`
  - Body:
    - `pdf`: PDF file (required)
  - Size Limit: 10MB
  - Returns:
    ```json
    {
      "success": true,
      "message": "File successfully processed",
      "data": {
        "sessionId": "uuid-v4",
        "filename": "example.pdf",
        "size": 1234567,
        "mimeType": "application/pdf",
        "base64Preview": "...",
        "base64": "full-base64-string"
      }
    }
    ```

## Testing the API

### Using the Web Interface
1. Visit the landing page
2. Upload a PDF file using drag-and-drop or file picker
3. Click "Analyze PDF"
4. Check the response in the UI

### Using Postman
1. Create a new POST request to `/api/analyze`
2. Set the request type to `multipart/form-data`
3. Add a field named `pdf` and select a PDF file
4. Send the request
5. Verify the JSON response includes:
   - Success status
   - Session ID
   - Summary of the PDF content
   - Structured data extracted from the PDF

### Using cURL
```bash
curl -X POST \
  -F "pdf=@/path/to/your/file.pdf" \
  http://localhost:3004/api/analyze
```

### Error Responses
- File too large (>10MB):
  ```json
  {
    "success": false,
    "message": "File too large"
  }
  ```
- Invalid file type:
  ```json
  {
    "success": false,
    "message": "Only PDF files are allowed"
  }
  ```
