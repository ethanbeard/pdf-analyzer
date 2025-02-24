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

- `PORT`: Server port (default: 3000)
- `GEMINI_API_KEY`: Google Gemini API key for AI functionality
- `GEMINI_API_ENDPOINT`: Google Gemini API endpoint
- `NODE_ENV`: Environment setting (development/production)

## API Endpoints

- `GET /api/health`: Health check endpoint
- More endpoints coming soon...
