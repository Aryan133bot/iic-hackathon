# OrbitGuard

A Next.js 14 Satellite Conjunction & Collision-Risk Alert Platform. Built for space situational awareness presentations.

## Deployment to Vercel

OrbitGuard is designed to work out-of-the-box on Vercel with zero configuration required for the build pipeline. All 3D rendering happens on the client, and the API routes are fully compatible with Vercel's serverless functions.

### Step-by-Step Vercel Deployment

1. **Push your code to GitHub/GitLab/Bitbucket:**
   Make sure all your latest changes are pushed to your remote repository.

2. **Import to Vercel:**
   - Log in to your Vercel account at [vercel.com](https://vercel.com).
   - Click the **Add New...** button and select **Project**.
   - Connect your Git provider and import the OrbitGuard repository.

3. **Configure Environment Variables:**
   Before clicking "Deploy", expand the **Environment Variables** section. You must add the following variable for the AI Briefing pipeline to function:
   
   - **Name**: `GEMINI_API_KEY`
   - **Value**: `(paste your Google Gemini API key here)`
   
   *(Optional)* If you want to use a specific model other than the default `gemini-2.5-flash`:
   - **Name**: `GEMINI_MODEL`
   - **Value**: e.g., `gemini-2.5-pro`

4. **Deploy:**
   - Click the **Deploy** button.
   - Vercel will automatically detect Next.js, run `npm install`, and execute `npm run build`.

5. **Verify Live Deployment:**
   - Once deployed, click the provided Vercel URL.
   - Ensure the 3D globe loads and real-time TLE telemetry is fetched successfully.
   - Click a conjunction event to verify the Gemini AI Briefing generation works in the production environment.
   - *Note: If CelesTrak is rate-limiting the Vercel IPs, you can always toggle **Demo Mode** from the top header to ensure a flawless presentation.*

## Local Development

To run this project locally:

```bash
npm install
npm run dev
```

Remember to add your `.env.local` file with your `GEMINI_API_KEY`.
