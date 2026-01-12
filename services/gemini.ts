import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Question } from "../types";

const parseQuestions = (text: string): Question[] => {
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const json = JSON.parse(cleanedText);
    if (Array.isArray(json)) return json;
    if (json.questions && Array.isArray(json.questions)) return json.questions;
    return [];
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
};

export const generateQuestionsFromPassage = async (passage: string): Promise<Question[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question text" },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of 4 possible answers",
            },
          },
          required: ["text", "options"],
        },
      },
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate 8 multiple-choice reading comprehension questions based on the following passage. 
      Each question must have 4 options. The questions should test understanding of the text.
      
      Passage:
      "${passage}"
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const output = response.text;
    if (!output) return [];

    const parsed = parseQuestions(output);
    
    // Add IDs to questions
    return parsed.map((q: any, index: number) => ({
      id: `generated-${Date.now()}-${index}`,
      text: q.text,
      options: q.options
    }));

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const parseRawTestContent = async (rawText: string): Promise<{ readingPassage: string, questions: Question[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      readingPassage: {
        type: Type.STRING,
        description: "The complete reading passage text. Ensure actual newlines are used for formatting, not literal \\n strings."
      },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question stem" },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "The 4 possible answers"
            },
          },
          required: ["text", "options"]
        }
      }
    },
    required: ["readingPassage", "questions"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are an educational content formatter. 
      Analyze the following text which contains a reading comprehension test (Passage + Questions).
      
      1. Extract the Reading Passage. 
         - Keep the original paragraph structure. 
         - Use actual newline characters for line breaks.
         - Preserve Markdown formatting (bold, italics).
      2. Extract the Multiple Choice Questions.
      3. Ensure exactly 4 options per question.
      
      Input Text:
      "${rawText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text);
    
    // Clean up reading passage: replace literal "\n" sequences with real newlines if the model escaped them
    let cleanPassage = data.readingPassage || "";
    cleanPassage = cleanPassage.replace(/\\n/g, '\n');

    const questions: Question[] = (data.questions || []).map((q: any, i: number) => ({
        id: `parsed-${Date.now()}-${i}`,
        text: q.text,
        options: q.options || []
    }));

    return {
        readingPassage: cleanPassage,
        questions
    };

  } catch (e) {
    console.error("Parse Error", e);
    throw e;
  }
};