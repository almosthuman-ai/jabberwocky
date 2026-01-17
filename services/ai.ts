import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Question, AISettings, VocabularyWord } from "../types";
import { generateWordPool, NonsenseWord } from "../utils/NonsenseGenerator";

export const getSettings = (): AISettings => {
  const saved = localStorage.getItem('ai_settings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse settings", e);
    }
  }
  // Default settings
  return {
    provider: 'google',
    googleKey: '',
    openaiKey: ''
  };
};

const getGoogleClient = (apiKey: string) => {
  if (!apiKey) throw new Error("Google API Key is missing. Please check your settings.");
  return new GoogleGenAI({ apiKey });
};

const getDifficultyDescription = (level: number): string => {
    switch (level) {
        case 1: return "Target Audience: CEFR A1 (Beginner/Elementary). Use very simple, short sentences and high-frequency basic vocabulary. Suitable for 3rd-4th grade EFL students.";
        case 3: return "Target Audience: CEFR B1 (Intermediate). Use compound sentences, varied sentence structures, and a wider range of vocabulary. Suitable for Junior High EFL students.";
        case 4: return "Target Audience: CEFR B2 (Upper Intermediate/TOEIC level). Use complex grammar (relative clauses, passive voice), formal tone, and academic/business vocabulary. Suitable for High School students (16-18 years old).";
        case 2:
        default: return "Target Audience: CEFR A2 (High Elementary). Use simple but varied sentences and common vocabulary. Suitable for 5th-6th grade EFL students (Taiwanese 5th grade level).";
    }
};

/**
 * Shuffles the options of a question and updates the correct answer index.
 * This ensures answers aren't always 'A' (index 0).
 */
const shuffleQuestions = (questions: Question[]): Question[] => {
    return questions.map(q => {
        // Create an array of indices [0, 1, 2, 3]
        const indices = q.options.map((_, i) => i);
        
        // Fisher-Yates Shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // Map old options to new positions
        const newOptions = indices.map(i => q.options[i]);
        
        // Find where the correct answer moved to
        // The old correct index was q.correctAnswerIndex.
        // We need to find which *new* index contains the *old* index value.
        // Actually simpler: The 'indices' array tells us: indices[newPos] = oldPos.
        // So we look for the newPos where indices[newPos] === oldCorrectIndex.
        const newCorrectIndex = indices.indexOf(q.correctAnswerIndex || 0);

        return {
            ...q,
            options: newOptions,
            correctAnswerIndex: newCorrectIndex === -1 ? 0 : newCorrectIndex
        };
    });
};

// --- Generators ---

export const generateFullTest = async (topic: string, realVocab: VocabularyWord[], difficulty: number = 2): Promise<{ readingPassage: string, questions: Question[], writingPrompt: string, rawResponse: string }> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const difficultyDesc = getDifficultyDescription(difficulty);

    // 1. Generate A LARGE Nonsense Words Pool (40 words)
    // We generate many so the AI can pick the funniest ones.
    const nonsenseWords = generateWordPool(40);
    const nonsenseListString = nonsenseWords.map(w => `- ${w.word} (${w.partOfSpeech})`).join('\n');

    // 2. Format Real Words Context
    let realWordContext = "";
    if (realVocab && realVocab.length > 0) {
        realWordContext = `
    SECONDARY GOAL:
    Try to incorporate themes, contexts, or even the words themselves from this list of "Target Vocabulary":
    ${realVocab.map(v => `- ${v.word} (${v.pos}): ${v.definitions?.[0]?.text}`).join('\n')}
        `;
    }

    // Dynamic Persona based on Difficulty
    const persona = difficulty >= 3 
        ? "You are a TOEIC test writer creating content for EFL students." 
        : "You are a creative writer for Elementary School English reading materials.";

    const systemPrompt = `${persona}
    ${difficultyDesc}
    
    You must generate three things in one go based on the GENRE: "${topic}".
    
    1. READING PASSAGE (key: "readingPassage")
    Write a Reading Passage adhering to the selected genre/topic.
    
    CONSTRAINT - NONSENSE VOCABULARY:
    Below is a pool of 40 "nonsense" words. 
    Select 6-10 words from this list that sound the funniest or fit the rhythm of your story best.
    Treat them as real English words based on their Part of Speech.
    Do not explain the words within the text (e.g., do not write 'a glorp, which is a car'). Let the context imply their meaning.
    
    POOL:
    ${nonsenseListString}
    
    ${realWordContext}
    Length: Adjust significantly based on difficulty level, approximately 100-200 words for CEFR B1 level.
    
    2. QUESTIONS (key: "questions")
    Generate 8 multiple-choice questions based on the passage you just wrote.
    Each question object MUST follow this structure:
    {
      "text": "Question text here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0 // Integer 0-3 indicating the correct option index
    }
    
    MANDATORY QUESTION TYPES:
    a) You MUST include at least one "Negative Factual" question (e.g., "Which of the following is NOT mentioned?" or "All of the following are true EXCEPT...").
    b) You MUST include at least one "Syntactic Awareness" question that asks the student to identify the Part of Speech of a specific nonsense word used in the text (e.g., "What is the part of speech of the word 'semprini' in line 2?").

    3. WRITING PROMPT (key: "writingPrompt")
    Create a specific writing prompt based on the passage for a short paragraph response.

    Return the result in strict JSON format with keys: "readingPassage" (string), "questions" (array), "writingPrompt" (string).`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }],
                response_format: { type: "json_object" }
            })
        });
        const json = await response.json();
        const rawText = json.choices[0]?.message?.content || "";
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            const err = new Error("Failed to parse OpenAI JSON");
            (err as any).rawResponse = rawText;
            throw err;
        }

        return {
            readingPassage: extractPassage(data),
            questions: shuffleQuestions(mapQuestions(extractQuestions(data))),
            writingPrompt: extractPrompt(data),
            rawResponse: rawText
        };
    } else {
        const ai = getGoogleClient(apiKey);
        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                readingPassage: { type: Type.STRING, description: "The generated reading passage with nonsense words." },
                questions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctAnswerIndex: { type: Type.INTEGER }
                        },
                        required: ["text", "options", "correctAnswerIndex"]
                    }
                },
                writingPrompt: { type: Type.STRING, description: "The writing exercise prompt." }
            },
            required: ["readingPassage", "questions", "writingPrompt"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        const rawText = response.text || "{}";
        let jsonString = rawText;
        // Robust cleaning of markdown blocks
        jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");

        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (e) {
            console.error("JSON Parse Failed", e, jsonString);
            const err = new Error("Failed to parse the AI response. See debug log.");
            (err as any).rawResponse = rawText;
            throw err;
        }

        const readingPassage = extractPassage(data);
        const questions = extractQuestions(data);

        if (!readingPassage && (!questions || questions.length === 0)) {
             const err = new Error("AI returned empty content.");
             (err as any).rawResponse = rawText;
             throw err;
        }

        return {
            readingPassage: readingPassage,
            questions: shuffleQuestions(mapQuestions(questions)),
            writingPrompt: extractPrompt(data),
            rawResponse: rawText
        };
    }
};

// --- Helpers to extract data from potentially malformed JSON ---

const extractPassage = (data: any): string => {
    if (typeof data.readingPassage === 'string') return data.readingPassage;
    // Handle case where AI nests it under "PART 1..."
    if (data["PART 1: READING PASSAGE"]) {
        if (typeof data["PART 1: READING PASSAGE"] === 'string') return data["PART 1: READING PASSAGE"];
        if (data["PART 1: READING PASSAGE"].text) return data["PART 1: READING PASSAGE"].text;
    }
    // Fallback: look for any key containing "Passage"
    const key = Object.keys(data).find(k => k.toLowerCase().includes('passage'));
    if (key) {
         if (typeof data[key] === 'string') return data[key];
         if (data[key].text) return data[key].text;
    }
    return "";
};

const extractQuestions = (data: any): any[] => {
    if (Array.isArray(data.questions)) return data.questions;
    // Handle case where AI nests it under "PART 2..."
    if (data["PART 2: QUESTIONS"]) return data["PART 2: QUESTIONS"];
    // Fallback
    const key = Object.keys(data).find(k => k.toLowerCase().includes('question'));
    if (key && Array.isArray(data[key])) return data[key];
    return [];
};

const extractPrompt = (data: any): string => {
    if (typeof data.writingPrompt === 'string') return data.writingPrompt;
    // Handle case where AI nests it under "PART 3..."
    if (data["PART 3: WRITING PROMPT"]) {
        if (typeof data["PART 3: WRITING PROMPT"] === 'string') return data["PART 3: WRITING PROMPT"];
        if (data["PART 3: WRITING PROMPT"].prompt) return data["PART 3: WRITING PROMPT"].prompt;
        if (data["PART 3: WRITING PROMPT"].text) return data["PART 3: WRITING PROMPT"].text;
    }
    // Fallback
    const key = Object.keys(data).find(k => k.toLowerCase().includes('prompt') || k.toLowerCase().includes('writing'));
    if (key) {
        if (typeof data[key] === 'string') return data[key];
        if (data[key].prompt) return data[key].prompt;
        if (data[key].text) return data[key].text;
    }
    return "";
};

const mapQuestions = (rawQuestions: any[]): Question[] => {
    return (rawQuestions || []).map((q: any, i: number) => {
        // Handle variations in key names (text vs question, correctAnswerIndex vs correct_answer_index)
        const text = q.text || q.question || "Question Text Missing";
        
        let correctAnswerIndex = 0;
        let found = false;

        // 1. Try to find a numeric index in known keys
        const numericKeys = ['correctAnswerIndex', 'correct_answer_index', 'answerIndex', 'answer_index', 'correctAnswer', 'answer'];
        for (const key of numericKeys) {
            if (typeof q[key] === 'number') {
                correctAnswerIndex = q[key];
                found = true;
                break;
            }
            // Handle string numbers "1"
            if (typeof q[key] === 'string' && !isNaN(parseInt(q[key])) && /^\d$/.test(q[key])) {
                correctAnswerIndex = parseInt(q[key]);
                found = true;
                break;
            }
        }

        // 2. If no number found, try parsing string content from 'answer' or 'correctAnswer'
        if (!found) {
            const ansStr = (q.correctAnswer || q.answer || "").toString().trim();
            if (ansStr) {
                // "A", "B"...
                if (/^[A-D]$/i.test(ansStr)) {
                    correctAnswerIndex = ansStr.toUpperCase().charCodeAt(0) - 65;
                }
                // "Option A"
                else if (/^Option [A-D]$/i.test(ansStr)) {
                    correctAnswerIndex = ansStr.split(' ')[1].toUpperCase().charCodeAt(0) - 65;
                }
                // "A. The red car"
                else if (/^[A-D]\.\s/.test(ansStr)) {
                    correctAnswerIndex = ansStr.charAt(0).toUpperCase().charCodeAt(0) - 65;
                }
                // Exact text match in options
                else if (q.options && Array.isArray(q.options)) {
                    const idx = q.options.findIndex((opt: string) => opt.trim() === ansStr);
                    if (idx !== -1) correctAnswerIndex = idx;
                }
            }
        }

        return {
            id: `gen-q-${Date.now()}-${i}`,
            text: text,
            options: q.options || [],
            correctAnswerIndex: correctAnswerIndex
        };
    });
};

export const generatePassageWithNonsense = async (topic: string, realVocab?: VocabularyWord[], difficulty: number = 2): Promise<string> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const difficultyDesc = getDifficultyDescription(difficulty);

    // 1. Generate Nonsense Words POOL (40 words)
    const nonsenseWords = generateWordPool(40);
    const nonsenseListString = nonsenseWords.map(w => `- ${w.word} (${w.partOfSpeech})`).join('\n');

    // 2. Format Real Words Context (if provided)
    let realWordContext = "";
    if (realVocab && realVocab.length > 0) {
        realWordContext = `
    SECONDARY GOAL:
    Try to incorporate themes, contexts, or even the words themselves from this list of "Target Vocabulary":
    ${realVocab.map(v => `- ${v.word} (${v.pos}): ${v.definitions?.[0]?.text}`).join('\n')}
    
    This helps connect the nonsense passage to the student's weekly learning.
        `;
    }

    const systemPrompt = `You are a TOEIC test writer creating content for EFL students.
    ${difficultyDesc}

    Write a Section 7 Reading Passage adhering to the GENRE: "${topic}".
    
    CONSTRAINT - NONSENSE VOCABULARY:
    Below is a pool of 40 "nonsense" words. 
    Select 6-10 words from this list that sound the funniest or fit the rhythm of your story best. 
    Treat them as real English words based on their Part of Speech. 
    Do not explain the words. Let the context imply their meaning.
    
    POOL:
    ${nonsenseListString}
    ${realWordContext}
    
    Length: Adjust significantly based on difficulty level, approximately 100-200 words for CEFR B1 level.
    Language Level: Adjust complexity according to target audience defined above.
    Return ONLY the reading passage text. Do not include questions.`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }]
            })
        });
        const json = await response.json();
        return json.choices[0]?.message?.content || "";
    } else {
        const ai = getGoogleClient(apiKey);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt
        });
        return response.text || "";
    }
};

export const generateQuestionsFromPassage = async (passage: string, difficulty: number = 2): Promise<Question[]> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const difficultyDesc = getDifficultyDescription(difficulty);

    const systemPrompt = `You are a TOEIC test creator for ESL students. 
    ${difficultyDesc}
    
    Read the following passage and generate 8 multiple-choice questions.
    
    PASSAGE:
    "${passage}"
    
    REQUIREMENTS:
    1. Questions should test reading comprehension, vocabulary in context, and basic inference.
    2. Provide exactly 4 options per question.
    3. Keep questions and options short.
    4. Indicate the correct answer index (0 for A, 1 for B, 2 for C, 3 for D).
    
    MANDATORY QUESTION TYPES:
    a) You MUST include at least one "Negative Factual" question (e.g., "Which of the following is NOT mentioned?" or "All of the following are true EXCEPT...").
    b) You MUST include at least one "Syntactic Awareness" question that asks the student to identify the Part of Speech of a specific nonsense word found in the text (e.g., "What is the part of speech of the word '...'?").
    
    Return JSON format: { "questions": [{ "text": string, "options": string[], "correctAnswerIndex": number }] }`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }],
                response_format: { type: "json_object" }
            })
        });
        const json = await response.json();
        const data = JSON.parse(json.choices[0]?.message?.content);
        return shuffleQuestions(mapQuestions(data.questions));
    } else {
        const ai = getGoogleClient(apiKey);
        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                questions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctAnswerIndex: { type: Type.INTEGER, description: "Index of correct option (0-3)" }
                        },
                        required: ["text", "options", "correctAnswerIndex"]
                    }
                }
            },
            required: ["questions"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        let jsonString = response.text || "{}";
        jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        
        const data = JSON.parse(jsonString);
        return shuffleQuestions(mapQuestions(data.questions));
    }
};

export const verifyAndFixQuestions = async (passage: string, questions: Question[], difficulty: number): Promise<{ questions: Question[], verifiedPassage: string }> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const questionsJSON = JSON.stringify(questions.map((q, i) => ({
        index: i,
        id: q.id,
        text: q.text,
        options: q.options,
        markedCorrectIndex: q.correctAnswerIndex
    })), null, 2);

    const systemPrompt = `You are a strict QA Grader for an English Exam. 
    
    TASK:
    Analyze the reading passage and the list of questions/answers.
    Your goal is to identify and FIX any logical errors, ambiguities, or incorrect answer keys.
    
    CRITICAL FOCUS: PART OF SPEECH (POS) QUESTIONS
    If a question asks for the Part of Speech of a nonsense word (e.g., "What is the part of speech of 'ploachgloach'?"):
    1. Check if the word is acting as a **Noun Adjunct** (a noun modifying another noun, e.g., "The [ploachgloach] event").
       - THIS IS BAD. It creates ambiguity between Noun and Adjective.
    2. **FIX STRATEGY**: 
       - REWRITE the specific sentence in the "verifiedPassage" to make the grammatical role obvious.
       - Example Fix 1 (Make it Adjective): "The event was [ploachgloach]" or "The [ploachgloach-y] event".
       - Example Fix 2 (Make it Noun): "The [ploachgloach] started the event" or "The [ploachgloach] arrived".
    3. Update the Answer Key to match the fix.

    CHECK NEGATIVE QUESTIONS: If a question asks 'Which is NOT mentioned?', verify that the Correct Answer is ABSOLUTELY absent from the text, and the other 3 options are EXPLICITLY present. If ambiguous, rewrite the options.

    PASSAGE:
    "${passage}"
    
    QUESTIONS TO VERIFY:
    ${questionsJSON}
    
    INSTRUCTIONS:
    1. Verify every question against the text.
    2. If the text supports 'A' but key says 'B', fix the key.
    3. If the text is ambiguous, REWRITE THE SENTENCE IN THE "verifiedPassage" output to remove ambiguity.
    4. If a question is bad, rewrite it.
    
    Return JSON format:
    {
      "verifiedPassage": string, // The full passage text (with any necessary fixes applied)
      "questions": [{ "index": number, "text": string, "options": string[], "correctAnswerIndex": number }] 
    }`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }],
                response_format: { type: "json_object" }
            })
        });
        const json = await response.json();
        const data = JSON.parse(json.choices[0]?.message?.content);
        
        // Merge IDs back and SHUFFLE AGAIN to ensure randomness even after fix
        const fixedQuestions = mapQuestions(data.questions).map((q, i) => ({ ...q, id: questions[i]?.id || q.id }));
        return {
            questions: fixedQuestions, 
            verifiedPassage: data.verifiedPassage || passage
        };
    } else {
        const ai = getGoogleClient(apiKey);
        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                verifiedPassage: { type: Type.STRING, description: "The corrected reading passage text." },
                questions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctAnswerIndex: { type: Type.INTEGER }
                        },
                        required: ["text", "options", "correctAnswerIndex"]
                    }
                }
            },
            required: ["verifiedPassage", "questions"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        let jsonString = response.text || "{}";
        jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        
        const data = JSON.parse(jsonString);
        
        // Merge IDs back
        const fixedQuestions = mapQuestions(data.questions).map((q, i) => ({ ...q, id: questions[i]?.id || q.id }));
        return {
            questions: fixedQuestions,
            verifiedPassage: data.verifiedPassage || passage
        };
    }
};

export const generateWritingPrompt = async (passage: string, difficulty: number = 2): Promise<string> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const difficultyDesc = getDifficultyDescription(difficulty);

    const systemPrompt = `You are a teacher creating a writing task for EFL students.
    ${difficultyDesc}
    
    PASSAGE:
    "${passage}"
    
    TASK:
    Create a specific writing prompt based on this passage.
    
    CONSTRAINTS:
    1. The prompt should lead to a paragraph suitable for the target difficulty level.
    2. Be specific (e.g., "Describe how X felt when Y happened", "Explain why Z is important").
    3. Avoid generic instructions like "Summarize the passage".
    4. Keep the language of the prompt simple and encouraging.
    
    Return ONLY the prompt text string.`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }]
            })
        });
        const json = await response.json();
        return json.choices[0]?.message?.content || "";
    } else {
        const ai = getGoogleClient(apiKey);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt
        });
        return response.text || "";
    }
};

export const addReasoningHints = async (passage: string, questions: Question[], difficulty: number = 2): Promise<string> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const questionsText = questions.map((q, i) => `${i+1}. ${q.text} [Options: ${q.options.join(', ')}]`).join('\n');

    const systemPrompt = `You are an expert EFL teacher focusing on deductive reasoning skills.
    
    TASK:
    Analyze the provided Reading Passage and the Questions. Identify the specific words, phrases, or sentence structures in the passage that provide the evidence or context clues needed to answer the questions correctly.
    
    ACTION:
    Return the EXACT same reading passage, but apply Markdown bolding (**text**) to the specific clues you identified.
    
    RULES:
    1. Do NOT rewrite the text. Only add asterisks (**).
    2. Focus on grammar cues (e.g., if a question asks about a verb, bold the auxiliary verb or subject that proves it).
    3. Focus on context cues (e.g., if a nonsense word means "expensive", bold the words "costs a lot" or "high price" nearby).
    4. Do not bold the entire text. Only bold the specific evidence.
    
    PASSAGE:
    ${passage}
    
    QUESTIONS:
    ${questionsText}
    
    Return JSON format: { "annotatedPassage": string }`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }],
                response_format: { type: "json_object" }
            })
        });
        const json = await response.json();
        const data = JSON.parse(json.choices[0]?.message?.content);
        return data.annotatedPassage || passage;
    } else {
        const ai = getGoogleClient(apiKey);
        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                annotatedPassage: { type: Type.STRING }
            },
            required: ["annotatedPassage"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        let jsonString = response.text || "{}";
        jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        
        const data = JSON.parse(jsonString);
        return data.annotatedPassage || passage;
    }
};

export const generateLogicGuide = async (passage: string, questions: Question[], difficulty: number = 2): Promise<string> => {
    const settings = getSettings();
    const apiKey = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
    if (!apiKey) throw new Error(`${settings.provider.toUpperCase()} API Key is missing.`);

    const questionsJSON = JSON.stringify(questions.map((q, i) => ({
        index: i + 1,
        text: q.text,
        options: q.options,
        correctAnswer: q.options[q.correctAnswerIndex || 0]
    })), null, 2);

    const systemPrompt = `You are a Senior EFL Teacher in Taiwan (台灣英文老師). 
    Your task is to create a "Teacher's Logic Guide" (教師詳解指南) for the following reading comprehension test.
    
    TARGET AUDIENCE: 
    Taiwanese 5th-8th Grade EFL Students and their local teachers.
    
    INPUT:
    Passage: "${passage}"
    Questions: ${questionsJSON}
    
    OUTPUT FORMAT (Markdown):
    Return a Markdown string. For each question, provide detailed pedagogical logic.
    DO NOT repeat the Question text.
    DO NOT repeat the Correct Answer text.
    
    REQUIRED STRUCTURE per Question:
    ### Question [Number]
    *   **Logic (EN):** [Direct deductive explanation: How do we know the answer from the text?]
    *   **Key Concept (EN):** [Brief linguistic explanation. Why does this nonsense word work here? E.g., "The suffix '-tion' indicates a noun," or "Word order S-V-O shows this is the subject," or "Context clues like 'but' show contrast."]
    *   **解析 (TW):** [Write a unique, natural explanation in Taiwanese Mandarin. Do not simply translate the English text. Write as if you are a Taiwanese teacher explaining the concept to a student in class.]
    
    CRITICAL LOCALIZATION RULES:
    1. **Script:** MUST use Traditional Chinese (繁體中文). Do NOT use Simplified Chinese.
    2. **Vocabulary Blacklist (STRICT):**
       - **NEVER** use the word "單詞" (dāncí). You MUST use "單字" (dānzì) or "這個字". If you detect "單詞", correct it immediately.
       - **NEVER** use the word "語法" (yǔfǎ). You MUST use "文法" (wénfǎ).
       - **NEVER** use PRC terms (e.g., avoid "信息" use "資訊"; avoid "質量" use "品質"; avoid "解釋" when "解析" fits better for exam review).
    3. **Terminology (Taiwan Standard):**
       - Part of Speech -> 詞性
       - Noun -> 名詞, Verb -> 動詞, Adjective -> 形容詞, Adverb -> 副詞
       - Grammar -> 文法
       - Context -> 上下文 / 語境
    
    TONE & STYLE:
    - **Active & Helpful:** Use phrases like "這裡的字尾告訴我們..." instead of passive voice like "單字被識別為...".
    - **Natural Teaching Voice:** Explain *how* to solve the question using clues in the text.
    - OPTIONAL: If there is a common distractor (wrong answer) that students usually pick, briefly explain why that specific trap is wrong in the 解析 section. (e.g., "很多同學會選 A, 但注意看這裡的時態...")
    
    Start directly with ### Question 1.`;

    if (settings.provider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.2-2025-12-11",
                messages: [{ role: "system", content: systemPrompt }]
            })
        });
        const json = await response.json();
        return json.choices[0]?.message?.content || "";
    } else {
        const ai = getGoogleClient(apiKey);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: systemPrompt
        });
        return response.text || "";
    }
};

// --- Legacy Parser (Optional, kept for backward compatibility if needed) ---

export const parseRawTestContent = async (rawText: string): Promise<{ readingPassage: string, questions: Question[] }> => {
  const settings = getSettings();
  
  if (settings.provider === 'openai') {
    return parseWithOpenAI(rawText, settings.openaiKey);
  } else {
    return parseWithGoogle(rawText, settings.googleKey);
  }
};

const parseWithGoogle = async (rawText: string, apiKey: string) => {
    const ai = getGoogleClient(apiKey);
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        readingPassage: { type: Type.STRING },
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswerIndex: { type: Type.INTEGER }
            },
            required: ["text", "options"]
          }
        }
      },
      required: ["readingPassage", "questions"]
    };
  
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract reading passage and questions from: "${rawText}". Infer correct answer index if possible.`,
      config: { responseMimeType: "application/json", responseSchema: schema },
    });
  
    let jsonString = response.text || "{}";
    jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    const data = JSON.parse(jsonString);

    return {
        readingPassage: (data.readingPassage || "").replace(/\\n/g, '\n'),
        questions: shuffleQuestions(mapQuestions(data.questions))
    };
};

const parseWithOpenAI = async (rawText: string, apiKey: string) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: "gpt-5.2-2025-12-11",
            messages: [{ role: "system", content: "Extract reading passage and questions. Return JSON {readingPassage, questions: [{text, options, correctAnswerIndex}]}" }, { role: "user", content: rawText }],
            response_format: { type: "json_object" }
        })
    });
    const json = await response.json();
    const data = JSON.parse(json.choices[0].message.content);
    return {
        readingPassage: (data.readingPassage || "").replace(/\\n/g, '\n'),
        questions: shuffleQuestions(mapQuestions(data.questions))
    };
};