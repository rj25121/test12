import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch'; // Render may need this explicitly

const app = express();
const port = process.env.PORT || 3000;

// Get the Gemini API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash"; // Or your preferred model

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json({ limit: '50mb' })); // Increase payload limit for 8 images

// Helper function to build the AI query
function getAiQuery(scanData, isDeepAnalysis) {
    const {
        capturedFrames,
        currentRoomTag,
        roomLocationInHouse,
        floorNumber,
        holisticIssues,
        holisticSurroundings
    } = scanData;

    const avgHeading = capturedFrames.reduce((sum, frame) => sum + frame.heading, 0) / capturedFrames.length;
    const vastuZonesObserved = [...new Set(capturedFrames.map(f => f.zone))].join(', ');

    if (isDeepAnalysis) {
        return `
            CRITICAL INSTRUCTION: You are a Master Vastu Shastra Analyst AI.
            You will be given context about a user's home, their life concerns, and 8 images from a Vastu scan.
            
            CONTEXT:
            - Area Scanned: ${currentRoomTag}
            - Location (C-Point): The ${currentRoomTag} is in the ${roomLocationInHouse || 'UNKNOWN'} zone of the house.
            - Floor: ${floorNumber || 'N/A'}
            - User's Concerns: ${holisticIssues}
            - Property Surroundings: ${holisticSurroundings}
            - Scan Data: The 8 images cover these zones: ${vastuZonesObserved}.

            CRITICAL TASK:
            Do NOT write a full report. 
            Based on ALL the context, provide a bulleted list of EXPERT-LEVEL, STRUCTURAL recommendations for the most severe Vastu defects you can identify.
            
            Start with this exact title (using bold markdown):
            **Expert Analysis (Structural Recommendations)**
            
            Then, add this disclaimer on a new line:
            "The following are high-stakes, structural remedies a professional consultant might suggest. These are major changes and should be considered carefully."
            
            Then, create two subsections, both using bullet points (using a dash "-"):
            
            **Minor Structural Recommendations**
            (List minor but structural/demolition-based remedies here. e.g., "- Relocating the stove from the North to the South-East corner of the kitchen.")
            
            **Major Structural Recommendations**
            (List high-stakes remedies here. e.g., "- The kitchen's location in the North-East is a severe defect. The ideal expert solution is to move this kitchen to the South-East zone.")
            
            Formatting: Use bullet points (using -). You MUST use **bold markdown** for the main title and two sub-section titles. Do NOT use asterisks (*) for bullet points.
        `;
    } else {
        return `
            CRITICAL INSTRUCTION: You are a Master Vastu Shastra Analyst AI.
            Your response must be a single, structured Vastu Report, following all instructions below exactly.

            Analyze the provided 8 visual data segments and their corresponding Vastu Zone data.
            - Area Scanned: ${currentRoomTag}
            - Location (C-Point): The ${currentRoomTag} is in the ${roomLocationInHouse || 'UNKNOWN'} zone of the house.
            - Floor: ${floorNumber || 'N/A'}
            - Scan Data: The Average Compass Heading observed was ${avgHeading.toFixed(1)} degrees.
            - Zones Covered: The scan covered: ${vastuZonesObserved}.

            CRITICAL HOLISTIC CONTEXT:
            - User's Primary Concerns: ${holisticIssues}
            - Property Surroundings: ${holisticSurroundings}
            
            Based on ALL this data, provide a comprehensive report. Tailor your analysis and remedies in Section I and IV to address the user's primary concerns.
            
            The report must be structured into FIVE consecutive sections. Use **bold markdown** for all section titles:

            **I. Executive Summary (Layman's Terms)**: Simple summary. Cover the 2-3 most critical findings and remedies, linking them to the user's primary concerns (if provided).
            Ensure you mention the Vastu Zone compliance of the scanned area (${currentRoomTag}) based on its location (${roomLocationInHouse}).

            **II. Directional Data and Environmental Assessment**: Technical analysis of the observed headings and visual elements.

            **III. Analysis of Vastu Compliance**: Technical findings, issues, and defects found.

            **IV. Remedial Recommendations (Advanced)**: CRITICAL: This section MUST use bullet points (using a dash "-"). Structure this section into two sub-sections using **bold markdown**:
            **Minor Defects & Remedies**
            (List non-structural remedies here, like placing plants, changing colors, or adding mirrors.)
            **Major Defects & Remedies**
            (List more significant remedies here, like moving heavy furniture or changing bed positions. Do NOT suggest structural demolition here.)
            
            **V. Vastu Tips & Remedies (Actionable Advice)**: A short, separate section offering quick, general Vastu tips related to this specific room type.

            Formatting requirements: Use paragraph breaks for readability. You MUST use bullet points (using -). You MUST use **bold markdown** for all section and sub-section titles. Do NOT use asterisks (*) for bullet points.
        `;
    }
}

// --- API Route for Generating Reports ---
app.post('/api/generateReport', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server API Key is not configured." });
    }

    try {
        const { isDeepAnalysis, scanData } = req.body;

        let parts = [];
        let imageParts = [];
        let textMetadataParts = [];

        scanData.capturedFrames.forEach((frame, index) => {
            imageParts.push({ inlineData: { mimeType: "image/jpeg", data: frame.image } });
            textMetadataParts.push({ text: `--- Visual Data Segment ${index + 1} Captured at Heading ${frame.heading.toFixed(1)} degrees (Vastu Zone: ${frame.zone}) ---` });
        });
        
        parts.push(...imageParts);
        parts.push(...textMetadataParts);
        
        const userQuery = getAiQuery(scanData, isDeepAnalysis);
        parts.push({ text: userQuery });

        const payload = {
            contents: [{ role: "user", parts: parts }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        res.json({ text: aiResponse });

    } catch (error) {
        console.error('Error in /api/generateReport:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- API Route for Handling Chat ---
app.post('/api/handleChat', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server API Key is not configured." });
    }

    try {
        const { chatHistory, chatContextSummary } = req.body;

        const chatSystemPrompt = `You are a helpful and friendly Vastu Shastra AI assistant.
        Your goal is to answer the user's questions. If the user asks a question about the Vastu analysis report, you MUST use the following context: --- REPORT CONTEXT START --- ${chatContextSummary} --- REPORT CONTEXT END ---
        If the user asks a general Vastu question, answer it concisely.
        Keep your answers simple and friendly. You may use **bold markdown** for emphasis. For bulleted lists, you MUST use a dash (-) and NOT an asterisk (*).`;

        const payload = {
            contents: chatHistory,
            systemInstruction: {
                parts: [{ text: chatSystemPrompt }]
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that query.";
        
        res.json({ text: aiResponse });

    } catch (error) {
        console.error('Error in /api/handleChat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Vastu server listening on port ${port}`);
});
