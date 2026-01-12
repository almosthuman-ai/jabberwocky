import React, { useState, useEffect } from 'react';
import { TestData, Question, GeneratorStatus, BookData } from '../types';
import { generatePassageWithNonsense, generateQuestionsFromPassage, addReasoningHints, generateWritingPrompt, generateFullTest, verifyAndFixQuestions, getSettings } from '../services/ai';
import { getAvailableBooks } from '../utils/vocabLoader';
import { Loader2, Sparkles, ChevronDown, ChevronUp, HelpCircle, Lightbulb, CheckCircle2, PenLine, BookOpen, Dices, ShieldCheck, GraduationCap } from 'lucide-react';

interface EditorProps {
  data: TestData;
  onChange: (data: TestData) => void;
  onOpenSettings: () => void;
  status: GeneratorStatus;
  setStatus: (status: GeneratorStatus) => void;
  difficulty: number;
  setDifficulty: (diff: number) => void;
  onGenerateLogicGuide: () => void;
}

const GENRES = {
  "Formal / Academic (GEPT/TOEIC)": [
    "Business Memorandum / Office Email",
    "News Report / Journalism",
    "Product Advertisement / Sale Announcement",
    "Instruction Manual / Safety Protocol",
    "Event Invitation / RSVP"
  ],
  "Creative / Fun (Engagement)": [
    "Sci-Fi Ship Log / Captain's Diary",
    "Fantasy Quest Board Posting",
    "Superhero Origin Story",
    "Top 10 List / Blog Post",
    "Alien Sports Commentary",
    "Recipe for a Magical Potion"
  ]
};

const DEFAULT_TITLE = 'Weekly English Quiz';

const Editor: React.FC<EditorProps> = ({ 
    data, 
    onChange, 
    onOpenSettings, 
    status, 
    setStatus, 
    difficulty, 
    setDifficulty, 
    onGenerateLogicGuide 
}) => {
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [topic, setTopic] = useState("Business Memorandum / Office Email"); // Default to first option
  const [debugLog, setDebugLog] = useState<string>("");
  
  // Vocab Selection State
  const [books, setBooks] = useState<BookData[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [userTitleOverride, setUserTitleOverride] = useState(false);

  useEffect(() => {
    // Load available books on mount
    const loadedBooks = getAvailableBooks();
    setBooks(loadedBooks);
  }, []);

  const handleInputChange = (field: keyof TestData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleVocabChange = (index: number, val: string) => {
    const newVocab = [...data.vocabWords];
    newVocab[index] = { ...newVocab[index], word: val };
    handleInputChange('vocabWords', newVocab);
  };

  const handleBookChange = (bookName: string) => {
      setSelectedBook(bookName);
      setSelectedWeek(""); // Reset week when book changes
  };

  const handleWeekChange = (week: string) => {
      setSelectedWeek(week);
      const book = books.find(b => b.name === selectedBook);
      if (book && book.weeks[week]) {
          const newVocab = book.weeks[week];
          handleInputChange('vocabWords', newVocab);
          
          // Optionally auto-update title or date?
          // handleInputChange('title', `Weekly Quiz - Week ${week}`);
      }
  };

  useEffect(() => {
    if (!selectedBook || !selectedWeek) return;
    if (userTitleOverride) return;

    const trimmedWeek = selectedWeek.trim();
    const formattedWeek = /^week\b/i.test(trimmedWeek) ? trimmedWeek : `Week ${trimmedWeek}`;
    const computedTitle = `${selectedBook} ${formattedWeek}`.trim();

    if (data.title !== computedTitle) {
      handleInputChange('title', computedTitle);
    }
  }, [selectedBook, selectedWeek, userTitleOverride, data.title]);

  useEffect(() => {
    const trimmed = (data.title || '').trim();
    if (!trimmed || trimmed === DEFAULT_TITLE) {
      setUserTitleOverride(false);
    }
  }, [data.title]);

  const handleQuestionChange = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...data.questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    handleInputChange('questions', newQuestions);
  };

  const handleOptionChange = (qIndex: number, oIndex: number, val: string) => {
    const newQuestions = [...data.questions];
    const newOptions = [...newQuestions[qIndex].options];
    newOptions[oIndex] = val;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
    handleInputChange('questions', newQuestions);
  };

  const handleCorrectAnswerChange = (qIndex: number, oIndex: number) => {
      const newQuestions = [...data.questions];
      newQuestions[qIndex] = { ...newQuestions[qIndex], correctAnswerIndex: oIndex };
      handleInputChange('questions', newQuestions);
  };

  // --- Helper to enforce API Key presence ---
  const checkApiKey = (): boolean => {
      const settings = getSettings();
      const key = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
      
      if (!key || key.trim() === '') {
          // Trigger the modal in parent
          onOpenSettings();
          return false;
      }
      return true;
  };

  const handleFeelLucky = async () => {
    if (!checkApiKey()) return;

    if (!topic.trim()) {
        alert("Please select a genre first.");
        return;
    }
    setStatus(GeneratorStatus.GENERATING);
    setDebugLog(""); // Clear previous log
    try {
        // Generate everything in one go, passing difficulty
        const result = await generateFullTest(topic, data.vocabWords, difficulty);
        setDebugLog(result.rawResponse); // Log success too
        
        const newData = {
            ...data,
            readingPassage: result.readingPassage,
            questions: result.questions,
            writingPrompt: result.writingPrompt
        };
        
        onChange(newData);
        setStatus(GeneratorStatus.SUCCESS);
    } catch (e: any) {
        console.error(e);
        if (e.rawResponse) {
            setDebugLog(e.rawResponse);
        }
        alert(e.message || "Failed to generate full test.");
        setStatus(GeneratorStatus.ERROR);
    } finally {
        setStatus(GeneratorStatus.IDLE);
    }
  };

  const handleGeneratePassage = async () => {
    if (!checkApiKey()) return;

    if (!topic.trim()) {
      alert("Please select a genre first.");
      return;
    }
    setStatus(GeneratorStatus.GENERATING);
    try {
      // Pass the current vocabulary to the generator for context
      const passage = await generatePassageWithNonsense(topic, data.vocabWords, difficulty);
      handleInputChange('readingPassage', passage);
      setStatus(GeneratorStatus.SUCCESS);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to generate passage.");
      setStatus(GeneratorStatus.ERROR);
    } finally {
      setStatus(GeneratorStatus.IDLE);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!checkApiKey()) return;

    if (!data.readingPassage || data.readingPassage.length < 50) {
        alert("Please ensure there is a reading passage before generating questions.");
        return;
    }
    setStatus(GeneratorStatus.GENERATING);
    try {
        const questions = await generateQuestionsFromPassage(data.readingPassage, difficulty);
        
        // Ensure 8 questions
        const finalQuestions = questions.slice(0, 8);
        while (finalQuestions.length < 8) {
            finalQuestions.push({
                id: `pad-${Date.now()}-${finalQuestions.length}`,
                text: "Placeholder Question",
                options: ["A", "B", "C", "D"]
            });
        }
        handleInputChange('questions', finalQuestions);
        setStatus(GeneratorStatus.SUCCESS);
    } catch (e: any) {
        console.error(e);
        alert(e.message || "Failed to generate questions.");
        setStatus(GeneratorStatus.ERROR);
    } finally {
        setStatus(GeneratorStatus.IDLE);
    }
  };

  const handleVerifyQuestions = async () => {
    if (!checkApiKey()) return;

    if (!data.readingPassage || data.questions.length === 0) {
        alert("Nothing to verify.");
        return;
    }
    setStatus(GeneratorStatus.GENERATING);
    try {
        const { questions: fixedQuestions, verifiedPassage } = await verifyAndFixQuestions(data.readingPassage, data.questions, difficulty);
        
        const newData = { ...data, questions: fixedQuestions };
        // If the AI rewrote the passage to fix ambiguity, update it
        if (verifiedPassage && verifiedPassage !== data.readingPassage) {
            newData.readingPassage = verifiedPassage;
        }
        
        onChange(newData);
        setStatus(GeneratorStatus.SUCCESS);
        alert("Verification complete. Any logical errors or incorrect keys have been fixed.");
    } catch (e: any) {
        console.error(e);
        alert(e.message || "Failed to verify questions.");
        setStatus(GeneratorStatus.ERROR);
    } finally {
        setStatus(GeneratorStatus.IDLE);
    }
  };

  const handleAddHints = async () => {
     if (!checkApiKey()) return;

     if (!data.readingPassage || data.questions.length === 0) {
        alert("You need both a reading passage and questions to generate reasoning hints.");
        return;
     }
     setStatus(GeneratorStatus.GENERATING);
     try {
         const newPassage = await addReasoningHints(data.readingPassage, data.questions, difficulty);
         handleInputChange('readingPassage', newPassage);
         setStatus(GeneratorStatus.SUCCESS);
     } catch (e: any) {
         console.error(e);
         alert(e.message || "Failed to add hints.");
         setStatus(GeneratorStatus.ERROR);
     } finally {
         setStatus(GeneratorStatus.IDLE);
     }
  };

  const handleGeneratePrompt = async () => {
      if (!checkApiKey()) return;

      if (!data.readingPassage || data.readingPassage.length < 20) {
          alert("Please generate a reading passage first.");
          return;
      }
      setStatus(GeneratorStatus.GENERATING);
      try {
          const prompt = await generateWritingPrompt(data.readingPassage, difficulty);
          handleInputChange('writingPrompt', prompt);
          setStatus(GeneratorStatus.SUCCESS);
      } catch (e: any) {
          console.error(e);
          alert(e.message || "Failed to generate prompt.");
          setStatus(GeneratorStatus.ERROR);
      } finally {
          setStatus(GeneratorStatus.IDLE);
      }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-xl z-10 w-full md:w-[450px] overflow-y-auto no-print">
      <div className="p-6 space-y-8">
        
        {/* Header Info */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Test Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Title</label>
              <input
                type="text"
                value={data.title}
                onChange={(e) => {
                  const value = e.target.value;
                  handleInputChange('title', value);
                  const trimmed = value.trim();
                  setUserTitleOverride(trimmed.length > 0 && trimmed !== DEFAULT_TITLE);
                }}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition bg-gray-50 text-gray-900"
                placeholder="e.g. Weekly Test #4"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <input
                  type="text"
                  value={data.classLevel}
                  onChange={(e) => handleInputChange('classLevel', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition bg-gray-50 text-gray-900"
                  placeholder="e.g. Grade 5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="text"
                  value={data.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition bg-gray-50 text-gray-900"
                  placeholder="e.g. Oct 24, 2023"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Vocabulary Section */}
        <section>
          <div className="flex justify-between items-center mb-4 border-b pb-2">
             <h2 className="text-xl font-bold text-gray-800">Vocabulary</h2>
             <span className="text-xs text-gray-500">Page 1</span>
          </div>
          
          {/* Book/Week Selector */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-amber-600"/>
                  <span className="text-xs font-bold text-amber-800">Load from Book</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <select 
                    className="text-xs border border-gray-300 rounded p-2 bg-white"
                    value={selectedBook}
                    onChange={(e) => handleBookChange(e.target.value)}
                  >
                      <option value="">Select Book...</option>
                      {books.map(b => (
                          <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                  </select>
                  
                  <select
                     className="text-xs border border-gray-300 rounded p-2 bg-white"
                     value={selectedWeek}
                     onChange={(e) => handleWeekChange(e.target.value)}
                     disabled={!selectedBook}
                  >
                      <option value="">Select Week...</option>
                      {selectedBook && books.find(b => b.name === selectedBook)?.weeks && 
                         Object.keys(books.find(b => b.name === selectedBook)!.weeks).map(week => (
                             <option key={week} value={week}>Week {week}</option>
                         ))
                      }
                  </select>
              </div>
          </div>

          <p className="text-xs text-gray-500 mb-4">Edit words below manually if needed.</p>
          <div className="space-y-3">
            {data.vocabWords.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-400 w-6">{idx + 1}.</span>
                <div className="flex-1 flex flex-col gap-1">
                     <input
                      type="text"
                      value={item.word}
                      onChange={(e) => handleVocabChange(idx, e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition bg-gray-50 text-gray-900"
                      placeholder={`Word ${idx + 1}`}
                    />
                    {item.pos && <span className="text-[10px] text-gray-400 pl-1">{item.pos}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI Tools Section */}
        <section className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-indigo-600" />
               <h3 className="font-bold text-gray-800 text-sm">AI Generation Tools</h3>
             </div>
             {/* Difficulty Dropdown */}
             <select 
                className="text-xs border border-indigo-200 rounded px-2 py-1 bg-white text-indigo-900 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                value={difficulty}
                onChange={(e) => setDifficulty(parseInt(e.target.value))}
                title="Select difficulty level for AI generation"
             >
                 <option value={1}>Level 1: Easy (Beg)</option>
                 <option value={2}>Level 2: Normal (Elem)</option>
                 <option value={3}>Level 3: Hard (Int)</option>
                 <option value={4}>Level 4: TOEIC (Adv)</option>
             </select>
           </div>

           {/* Genre Dropdown */}
            <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1">Content Type</label>
                <select 
                    className="w-full text-xs border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                >
                    {Object.entries(GENRES).map(([category, items]) => (
                        <optgroup key={category} label={category}>
                            {items.map(item => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </div>
           
           <div className="space-y-4">
               {/* 0. I FEEL LUCKY */}
                <div>
                   <button
                     onClick={handleFeelLucky}
                     disabled={status === GeneratorStatus.GENERATING}
                     className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-2.5 rounded-md text-xs font-bold flex justify-center items-center gap-2 transition disabled:opacity-70 shadow-sm"
                   >
                     {status === GeneratorStatus.GENERATING ? <Loader2 className="w-4 h-4 animate-spin"/> : <Dices className="w-4 h-4"/>}
                     {status === GeneratorStatus.GENERATING ? "Working Magic..." : "I feel lucky (Generate All)"}
                   </button>
                   <p className="text-[10px] text-gray-500 mt-1 leading-tight text-center">
                       Creates nonsense passage, questions, answers, and writing prompt in one click.
                   </p>
               </div>

               <div className="border-t border-indigo-200"></div>

               {/* 1. Generate Passage */}
               <div>
                   <label className="block text-xs font-bold text-gray-600 mb-1">Generate Text Only</label>
                   <button
                     onClick={handleGeneratePassage}
                     disabled={status === GeneratorStatus.GENERATING}
                     className="w-full bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700 py-2 rounded-md text-xs font-medium transition disabled:opacity-70 whitespace-nowrap"
                   >
                     {status === GeneratorStatus.GENERATING ? <Loader2 className="w-4 h-4 animate-spin"/> : "Write Passage with Nonsense Words"}
                   </button>
                   {data.vocabWords.some(w => w.word) && (
                       <p className="text-[10px] text-indigo-600 mt-1">
                           * Uses {data.vocabWords.filter(w=>w.word).length} vocab words for context.
                       </p>
                   )}
               </div>

               <div className="border-t border-indigo-200"></div>

               {/* 2. Generate Questions */}
               <div>
                   <label className="block text-xs font-bold text-gray-600 mb-1">Generate Questions Only</label>
                   <button
                     onClick={handleGenerateQuestions}
                     disabled={status === GeneratorStatus.GENERATING}
                     className="w-full bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700 py-2 rounded-md text-xs font-medium flex justify-center items-center gap-2 transition disabled:opacity-70"
                   >
                     {status === GeneratorStatus.GENERATING ? <Loader2 className="w-4 h-4 animate-spin"/> : <HelpCircle className="w-4 h-4"/>}
                     {status === GeneratorStatus.GENERATING ? "Generating Questions..." : "Generate 8 Questions from Editor Text"}
                   </button>
               </div>

               <div className="border-t border-indigo-200"></div>

               {/* 3. Add Reasoning Hints */}
               <div>
                   <label className="block text-xs font-bold text-gray-600 mb-1">Add Deductive Reasoning Hints</label>
                   <button
                     onClick={handleAddHints}
                     disabled={status === GeneratorStatus.GENERATING}
                     className="w-full bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 py-2 rounded-md text-xs font-medium flex justify-center items-center gap-2 transition disabled:opacity-70"
                   >
                     {status === GeneratorStatus.GENERATING ? <Loader2 className="w-4 h-4 animate-spin"/> : <Lightbulb className="w-4 h-4"/>}
                     {status === GeneratorStatus.GENERATING ? "Analyzing..." : "Bold Evidence in Text"}
                   </button>
                   <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                       Bolds phrases in the text that act as evidence for the answers to the current questions.
                   </p>
               </div>

               <div className="border-t border-indigo-200"></div>

               {/* 4. Generate Writing Prompt */}
               <div>
                   <label className="block text-xs font-bold text-gray-600 mb-1">Generate Writing Prompt</label>
                   <button
                     onClick={handleGeneratePrompt}
                     disabled={status === GeneratorStatus.GENERATING}
                     className="w-full bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 py-2 rounded-md text-xs font-medium flex justify-center items-center gap-2 transition disabled:opacity-70"
                   >
                     {status === GeneratorStatus.GENERATING ? <Loader2 className="w-4 h-4 animate-spin"/> : <PenLine className="w-4 h-4"/>}
                     {status === GeneratorStatus.GENERATING ? "Creating..." : "Generate Specific Prompt"}
                   </button>
               </div>
           </div>
        </section>

        {/* Teacher's Logic Guide Editor (Moved Up) */}
        <section className="bg-yellow-50/50 p-4 rounded-lg border border-yellow-200">
          <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-yellow-600"/>
                  Teacher's Logic Guide (Page 4)
              </h3>
              <button
                onClick={onGenerateLogicGuide}
                disabled={status === GeneratorStatus.GENERATING}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded text-xs font-bold hover:bg-yellow-200 transition disabled:opacity-50"
                title="Generate step-by-step logic explanations"
              >
                 {status === GeneratorStatus.GENERATING ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5"/>}
                 Generate Guide
              </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">Visible only in Teacher Mode. Provides deductive reasoning for answers.</p>
          <textarea
              value={data.logicGuide || ""}
              onChange={(e) => handleInputChange('logicGuide', e.target.value)}
              className="w-full h-48 px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 outline-none transition text-sm leading-relaxed bg-white text-gray-900 font-mono"
              placeholder="Generate or write the teacher's guide here (Markdown supported)..."
          />
        </section>

        {/* Reading Section - Manual Editor */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 mt-4">Reading Editor (Page 2)</h2>
          
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">Reading Passage Text</label>
                <span className="text-xs text-gray-400">Markdown Supported</span>
            </div>
            <textarea
              value={data.readingPassage}
              onChange={(e) => handleInputChange('readingPassage', e.target.value)}
              className="w-full h-48 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition text-sm leading-relaxed resize-y bg-gray-50 text-gray-900 font-mono"
              placeholder="The passage text will appear here. You can write your own or generate one above..."
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end border-b pb-2">
               <div>
                   <h3 className="font-semibold text-gray-700">Questions (8 Total)</h3>
                   <p className="text-xs text-gray-500 mt-0.5">Mark correct answers using the circle.</p>
               </div>
               <button
                 onClick={handleVerifyQuestions}
                 disabled={status === GeneratorStatus.GENERATING}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs font-bold hover:bg-green-100 transition disabled:opacity-50"
                 title="AI will check logic and fix ambiguous questions"
               >
                 {status === GeneratorStatus.GENERATING ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <ShieldCheck className="w-3.5 h-3.5"/>}
                 Verify & Fix
               </button>
            </div>
            
            {data.questions.map((q, idx) => (
              <div key={q.id} className="border rounded-lg p-3 bg-gray-50">
                <div 
                  className="flex justify-between items-center cursor-pointer select-none"
                  onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-sm font-medium text-gray-800 truncate flex-1 pr-2">
                        {idx + 1}. {q.text || "Empty Question"}
                      </span>
                  </div>
                  {expandedQuestion === q.id ? <ChevronUp className="w-4 h-4 text-gray-500"/> : <ChevronDown className="w-4 h-4 text-gray-500"/>}
                </div>
                
                {expandedQuestion === q.id && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <textarea
                      value={q.text}
                      onChange={(e) => handleQuestionChange(idx, 'text', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900"
                      placeholder="Question text"
                      rows={2}
                    />
                    <div className="grid grid-cols-1 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          {/* Answer Key Selector */}
                          <button 
                            onClick={() => handleCorrectAnswerChange(idx, oIdx)}
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${q.correctAnswerIndex === oIdx ? 'bg-green-100 border-green-500 text-green-600' : 'border-gray-300 text-gray-300 hover:border-gray-400'}`}
                            title="Mark as correct answer"
                          >
                             {q.correctAnswerIndex === oIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-transparent"/>}
                          </button>

                          <span className="text-xs font-bold text-gray-400 w-4">{(oIdx + 10).toString(36).toUpperCase()}.</span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleOptionChange(idx, oIdx, e.target.value)}
                            className="flex-1 px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900"
                            placeholder={`Option ${oIdx + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Writing Prompt Editor */}
          <div className="mt-8 pt-6 border-t">
              <h3 className="font-bold text-gray-800 mb-2 border-b pb-2">Writing Exercise (Page 3)</h3>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Instructions</label>
              <textarea
                  value={data.writingPrompt || ""}
                  onChange={(e) => handleInputChange('writingPrompt', e.target.value)}
                  className="w-full h-24 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition text-sm leading-relaxed bg-gray-50 text-gray-900"
                  placeholder="Enter the instructions for the writing assignment..."
              />
          </div>

          {/* Debug Section */}
          <section className="border-t pt-4">
             <details className="group">
                 <summary className="text-xs font-bold text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
                     <span className="group-open:rotate-90 transition-transform">▶</span> Debug Log (Last AI Response)
                 </summary>
                 <div className="mt-2 bg-gray-800 text-green-400 p-3 rounded text-[10px] font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                     {debugLog || "No logs yet."}
                 </div>
             </details>
          </section>

        </section>

        <div className="h-12"></div> {/* Spacer */}
      </div>
    </div>
  );
};

export default Editor;
