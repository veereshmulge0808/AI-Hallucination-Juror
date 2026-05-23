import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-3.1-flash-lite';

export interface MemoryEntry {
  query: string;
  verifiedOutput: string;
}

export interface GuardResult {
  passed: boolean;
  type: 'TECHNICAL' | 'CASUAL' | 'INVALID';
  reason: string;
  casualResponse?: string;
}

export async function boundaryGuardCheck(query: string): Promise<GuardResult> {
  const prompt = `
Analyze the following query: "${query}"

1. TECHNICAL: Is this a strictly technical request related to software engineering, hardware, or dev-ops?
2. CASUAL: Is this a standard greeting ("Hi", "Hello"), a pleasantry ("How are you?"), or a question about your identity/purpose ("What do you do?", "Who are you?")?
3. INVALID: Does the request contain semantic nonsense, joke parameters, creative writing requests, or absurd/illogical scenarios (e.g., "Write a script for a toaster to feel sadness")?

Return a JSON object:
{
  "passed": boolean, // true for TECHNICAL or CASUAL, false for INVALID
  "type": "TECHNICAL" | "CASUAL" | "INVALID",
  "reason": "If INVALID, explain why it violates logic or domain. If TECHNICAL, respond with 'Valid'. If CASUAL, respond with 'Greeting'.",
  "casualResponse": "If CASUAL, provide a brief, professional response as the TrueNode AI Juror. Politely guide them to submit a technical query for verification."
}
`;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: 'You are a Strict Boundary Enforcement System. You validate domain relevance and logical consistency. You also handle professional greetings politely while maintaining your persona as the TrueNode AI Juror.',
      responseMimeType: 'application/json',
    }
  });
  
  if (!response.text) {
    throw new Error('No response from Gemini');
  }

  return JSON.parse(response.text) as GuardResult;
}

export async function contextCheckDraft(query: string, memory: MemoryEntry[]): Promise<{ isMatch: boolean, note: string }> {
  if (memory.length === 0) {
    return { isMatch: false, note: "Fresh Start: No previous memory." };
  }
  
  const memoryContext = memory.map(m => `Old Prompt: ${m.query}`).join('\n');
  const prompt = `
Evaluate the new user prompt against the domain of the previous prompts.
Previous Prompts:
${memoryContext}

New Prompt: "${query}"

1. Domain Match (Continuity Mode): Is the new prompt related to the same project, programming language, or technical problem as the previous inputs?
2. Domain Mismatch (Fresh Start Mode): Does the new prompt introduce a completely new technical domain?

Return JSON:
{
  "isMatch": boolean,
  "note": "A brief note e.g. '*Memory Check: Continued using X...*' or '*Fresh Start: New domain detected.*'"
}
`;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: 'You are a Context Analyzer Agent. Ensure conversational continuity or detect domain shifts.',
      responseMimeType: 'application/json',
    }
  });

  if (!response.text) {
    return { isMatch: false, note: 'Error analyzing context.' };
  }

  return JSON.parse(response.text) as { isMatch: boolean, note: string };
}

export async function generateDraft(query: string, memoryText: string) {
  const content = `Generate a detailed technical answer for the following query:\n\n${query}` + 
    (memoryText ? `\n\nUse this previous context to maintain consistency:\n${memoryText}` : '');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: content }] }],
    config: {
      systemInstruction: 'You are a Technical Answer Generator. Your goal is to generate extremely detailed, accurate technical answers. Be an expert AI assistant.',
    }
  });
  return response.text;
}

export async function factCheckDraft(query: string, draft: string, memoryText: string) {
  const content = `Query: ${query}\n\nDraft Answer: ${draft}\n\nCheck the factual accuracy of this draft.` +
    (memoryText ? `\n\nContext:\n${memoryText}` : '');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: content }] }],
    config: {
      systemInstruction: 'You are a Fact Checker. Your goal is to check factual accuracy. You are an expert in verifying facts. Highlight any factual inconsistencies.',
    }
  });
  return response.text;
}

export async function logicCheckDraft(query: string, draft: string, memoryText: string) {
  const content = `Query: ${query}\n\nDraft Answer: ${draft}\n\nCheck logical consistency and reasoning in the draft.` +
    (memoryText ? `\n\nContext:\n${memoryText}` : '');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: content }] }],
    config: {
      systemInstruction: 'You are a Logic Checker. Your goal is to check logical consistency and reasoning. Identify any logical flaws or reasoning errors.',
    }
  });
  return response.text;
}

export async function safetyCheckDraft(query: string, draft: string, memoryText: string) {
  const content = `Query: ${query}\n\nDraft Answer: ${draft}\n\nEvaluate if the draft is unsafe, misleading, or harmful.` +
    (memoryText ? `\n\nContext:\n${memoryText}` : '');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: content }] }],
    config: {
      systemInstruction: 'You are a Safety Checker. Your goal is to detect unsafe or harmful outputs. You are an AI safety expert.',
    }
  });
  return response.text;
}

export interface FinalJudgment {
  factCheck: string;
  logicMathCheck: string;
  memoryCheck?: string;
  correctionsMade: string;
  reliabilityScore: number;
  verifiedOutput: string;
}

export async function finalJudge(
  query: string, 
  draft: string, 
  factReport: string, 
  logicReport: string, 
  safetyReport: string,
  memoryNote: string
): Promise<FinalJudgment> {
  const prompt = `
Query: ${query}

Original Draft: ${draft}

Fact Check Report: ${factReport}

Logic Check Report: ${logicReport}

Safety Check Report: ${safetyReport}

Memory/Context Note: ${memoryNote}

As the Final Judge, analyze all reports. Decide whether the response is safe, factual, and logically correct.
Incorporate the memory note if relevant.

🚨 **AUTO-CORRECTION & SELF-HEALING MANDATE** 🚨
If your verification tools (Fact Check or Logic/Math Check) return a "Fail" indicating the generated draft is incorrect, hallucinated, or unsafe, you MUST NOT simply output an error message and stop.
You are strictly required to autonomously generate the corrected solution before showing the final output to the user.
1. Identify the flaw based on the reports.
2. Formulate the fix.
3. Rewrite the entire response incorporating the fix.
The \`verifiedOutput\` must ALWAYS contain the fully functional, verified, and corrected code/answer without asking the user to fix it!

Output YOUR FINAL JUDGMENT as a JSON object adhering to this schema:
{
  "factCheck": "Pass/Fail - Brief explanation of what was verified factually",
  "logicMathCheck": "Pass/Fail - Brief explanation of what was calculated/verified",
  "memoryCheck": "Brief note on memory continuity based on Memory/Context Note",
  "correctionsMade": "Describe exactly what you fixed (e.g. 'The drafted code uses a hallucinated library 'X', Search confirms the correct library is actually 'Y'. Rewrote to use 'Y''), or 'None needed'",
  "reliabilityScore": 85, // An integer from 0 to 100
  "verifiedOutput": "The complete, corrected, and final verified technical output. This MUST contain the fully functional, corrected solution. Use Markdown."
}
`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: 'You are the Final Judge. Your goal is to approve only reliable answers. You are a strict AI evaluator. Always respond in valid JSON matching the requested schema.',
      responseMimeType: 'application/json',
    }
  });
  
  if (!response.text) {
    throw new Error('No response from Gemini');
  }

  return JSON.parse(response.text) as FinalJudgment;
}
