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

// --- HELPER FUNCTION: To create the core consistency output ---
async function generateCoreAssessment(scanData, parts) {
    // This runs first to establish the agreed-upon Vastu defects.
    if (!GEMINI_API_KEY) throw new Error("Server API Key is not configured for core assessment.");

    const query = `
        CRITICAL INSTRUCTION: You are a Vastu Analyst AI. Analyze the provided ${parts.length - 1} visual segments 
        and the following room context: Room: ${scanData.currentRoomTag}, Location: ${scanData.roomLocationInHouse}, 
        Concerns: ${scanData.holisticIssues}.
        
        CRITICAL TASK: Your SOLE output must be a concise, bulleted list of the top 5 to 7 most severe Vastu defects found in this area.
        Focus ONLY on factual defects (directional, elemental, positional) and use simple language.
        
        Start with the exact bold markdown title: 
        **Core Vastu Assessment (Defects Found)**
        
        Followed by a list using dashes (-). Do NOT include remedies.
    `;

    const payload = {
        contents: [{ role: "user", parts: [...parts, { text: query }] }],
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
        throw new Error(`Google API Error (Core Assessment): ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "**Core Vastu Assessment (Defects Found)**\n- Assessment failed to generate. Please rescan.";
}

// Helper function to build the final AI query, now injecting Core Assessment
function getAiQuery(scanData, isDeepAnalysis, coreAssessment) {
    const {
        currentRoomTag,
        roomLocationInHouse,
        floorNumber,
        holisticIssues,
        holisticSurroundings
    } = scanData;

    const avgHeading = scanData.capturedFrames.reduce((sum, frame) => sum + frame.heading, 0) / scanData.capturedFrames.length;
    const vastuZonesObserved = [...new Set(scanData.capturedFrames.map(f => f.zone))].join(', ');

    // --- Template for all reports to ensure shared context ---
    const sharedContext = `
        CORE VASTU FINDINGS (MUST BE USED AS THE BASIS FOR ALL REMEDIES):
        ${coreAssessment}
        
        CONTEXT FOR THIS REPORT:
        - Area Scanned: ${currentRoomTag}
        - Location (C-Point): The ${currentRoomTag} is in the ${roomLocationInHouse || 'UNKNOWN'} zone of the house.
        - Floor: ${floorNumber || 'N/A'}
        - User's Concerns: ${holisticIssues}
        - Property Surroundings: ${holisticSurroundings}
        - Scan Data: Average Heading: ${avgHeading.toFixed(1)} degrees. Zones Covered: ${vastuZonesObserved}.
    `;
    
    if (isDeepAnalysis) {
        return `
            CRITICAL INSTRUCTION: You are a Master Vastu Shastra Analyst AI, specializing in structural and permanent solutions.
            Your task is to provide an EXPERT-LEVEL, STRUCTURAL Analysis based **EXCLUSIVELY** on the Core Vastu Findings provided below.
            
            ${sharedContext}
            
            CRITICAL TASK:
            Do NOT write a full report. Provide a structural analysis focusing on the defects in the CORE VASTU FINDINGS.
            
            Start with this exact title (using bold markdown):
            **Expert Analysis (Structural Recommendations)**
            
            Then, add this disclaimer on a new line:
            "The following are high-stakes, structural remedies a professional consultant might suggest. These are major changes and should be considered carefully."
            
            Then, create two subsections, both using bullet points (using a dash "-"):
            
            **Minor Structural Recommendations**
            (List minor demolition/construction remedies that address the core defects. e.g., "- Relocating the stove from the North to the South-East corner of the kitchen.")
            
            **Major Structural Recommendations**
            (List high-stakes demolition/construction remedies that address the core defects. e.g., "- The kitchen's location is a severe defect. The ideal expert solution is to move this kitchen to the South-East zone.")
            
            Formatting: Use bullet points (using -). You MUST use **bold markdown** for the main title and two sub-section titles.
        `;
    } else {
        return `
            CRITICAL INSTRUCTION: You are a Master Vastu Shastra Analyst AI, specializing in non-structural, actionable remedies.
            Your response must be a single, structured Vastu Report, following all instructions below exactly. Use the Core Vastu Findings to guide your report.
            
            ${sharedContext}

            Based on ALL this data, provide a comprehensive report. Tailor your analysis and remedies in Section I and IV to address the user's primary concerns and the CORE VASTU FINDINGS.
            
            The report must be structured into FIVE consecutive sections. Use **bold markdown** for all section titles:

            **I. Executive Summary (Layman's Terms)**: Simple summary. Cover the 2-3 most critical findings (from CORE ASSESSMENT) and non-structural remedies, linking them to the user's primary concerns (if provided).
            Ensure you mention the Vastu Zone compliance of the scanned area (${currentRoomTag}) based on its location (${roomLocationInHouse}).

            **II. Directional Data and Environmental Assessment**: Technical analysis of the observed headings and visual elements.

            **III. Analysis of Vastu Compliance**: Technical findings, issues, and defects found, explicitly referencing the points in the CORE ASSESSMENT.

            **IV. Remedial Recommendations (Advanced)**: CRITICAL: This section MUST use bullet points (using a dash "-"). Structure this section into two sub-sections using **bold markdown**. All remedies must be NON-STRUCTURAL (no construction or demolition suggested):
            **Minor Defects & Remedies**
            (List non-structural remedies here, like placing plants, changing colors, or adding mirrors.)
            **Major Defects & Remedies**
            (List more significant NON-STRUCTURAL remedies here, like moving heavy furniture or changing bed positions.)
            
            **V. Vastu Tips & Remedies (Actionable Advice)**: A short, separate section offering quick, general Vastu tips related to this specific room type.

            Formatting requirements: Use paragraph breaks for readability. You MUST use bullet points (using -). You MUST use **bold markdown** for all section and sub-section titles.
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
        // 1. Prepare image parts and metadata for the AI calls
        scanData.capturedFrames.forEach((frame, index) => {
            parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.image } });
            parts.push({ text: `--- Visual Data Segment ${index + 1} Captured at Heading ${frame.heading.toFixed(1)} degrees (Vastu Zone: ${frame.zone}) ---` });
        });
        
        // --- STEP 1: Generate Core Assessment (AI Call 1) ---
        const coreAssessment = await generateCoreAssessment(scanData, parts);
        
        // --- STEP 2: Build Final Query with Core Assessment ---
        const userQuery = getAiQuery(scanData, isDeepAnalysis, coreAssessment);
        
        // 2. Add the final text query part
        parts.push({ text: userQuery });
        
        // --- STEP 3: Generate Final Report (AI Call 2) ---
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
        
        // Prepend the Core Assessment to the final report text for the user to see
        const finalReport = `${coreAssessment}\n\n---\n\n${aiResponse}`;
        
        res.json({ text: finalReport });

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
