import { VocabularyWord, VocabularyDefinition, BookData } from "../types";
import { eow6Data } from "../data/eow6";

const parseCSVLine = (line: string): string[] => {
    // Simple CSV parser handling quotes
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
};

const parseCsvToBook = (bookName: string, csvContent: string): BookData => {
    const lines = csvContent.split('\n');
    const weeks: Record<string, VocabularyWord[]> = {};
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = parseCSVLine(line);
        // Columns: week,word,pos,def_a,trans_a,def_b,trans_b,def_c,trans_c
        // Index:   0    1    2   3     4       5     6       7     8
        
        const week = cols[0];
        const word = cols[1];
        const pos = cols[2];
        
        const defs: VocabularyDefinition[] = [];
        
        if (cols[3]) defs.push({ text: cols[3], translation: cols[4] || '' });
        if (cols[5]) defs.push({ text: cols[5], translation: cols[6] || '' });
        if (cols[7]) defs.push({ text: cols[7], translation: cols[8] || '' });

        if (!weeks[week]) {
            weeks[week] = [];
        }

        weeks[week].push({
            id: `csv-${bookName}-${week}-${word}`,
            word: word,
            pos: pos,
            definitions: defs
        });
    }

    return { name: bookName, weeks };
};

// Registry of books
export const getAvailableBooks = (): BookData[] => {
    const books: BookData[] = [];
    
    // Use the imported string directly
    if (eow6Data) {
        books.push(parseCsvToBook("EOW6", eow6Data));
    }
    
    return books;
};