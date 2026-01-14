import React, { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Question, TestData, ViewMode } from '../types';

interface A4PreviewProps {
  data: TestData;
  viewMode?: ViewMode;
  onGenerateLogicGuide?: () => void;
  isGenerating?: boolean;
}

export interface A4PreviewHandle {
  fixLayout: () => void;
}

interface LogicGuideItem {
  questionIndex: number;
  logicContent: string;
}

const LOGIC_BLOCKS_PER_PAGE = 4;

const parseInlineStyles = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) {
    return <span className="italic text-gray-400">No content available.</span>;
  }

  const normalized = content.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
  const paragraphs = normalized.split(/\n\s*\n/);

  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        if (!para.trim()) return null;
        if (para.trim().startsWith('###')) {
          return (
            <h3
              key={i}
              className="mt-2 text-[12px] font-semibold tracking-tight text-gray-900"
            >
              {para.replace(/^###\s*/, '')}
            </h3>
          );
        }

        if (para.trim().startsWith('*')) {
          const listItems = para
            .split('\n')
            .filter((line) => line.trim().startsWith('*'));
          return (
            <ul key={i} className="space-y-1 pl-5 list-disc">
              {listItems.map((item, idx) => (
                <li key={idx} className="text-[11px] leading-[1.45] text-gray-900">
                  {parseInlineStyles(item.replace(/^\*\s*/, ''))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            className="whitespace-pre-wrap text-justify text-[11px] leading-[1.5] text-gray-900"
          >
            {parseInlineStyles(para)}
          </p>
        );
      })}
    </div>
  );
};

const QuestionsGrid: React.FC<{
  questions: Question[];
  startIndex: number;
  showAnswerKey?: boolean;
}> = ({ questions, startIndex, showAnswerKey }) => (
  <div className="content-start grid grid-cols-2 gap-x-5 gap-y-4">
    {questions.map((q, i) => (
      <div key={q.id} className="break-inside-avoid">
        <div className="mb-1.5 flex gap-2">
          <span className="text-[12px] font-bold text-gray-900">{startIndex + i + 1}.</span>
          <p className="text-[12px] font-semibold leading-[1.35] text-gray-900">{q.text}</p>
        </div>
        <div className="space-y-1 pl-5">
          {q.options.map((opt, optIndex) => {
            const isCorrect = q.correctAnswerIndex === optIndex;
            const highlight = showAnswerKey && isCorrect;
            return (
              <div key={optIndex} className="flex items-start gap-2">
                <div
                  className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${highlight ? 'border-black bg-black' : 'border-gray-400'}`}
                />
                <span
                  className={`text-[10px] leading-snug ${highlight ? 'font-bold text-red-600' : 'text-gray-700'}`}
                >
                  {opt}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const parseLogicGuide = (markdown: string): LogicGuideItem[] => {
  if (!markdown) return [];

  const items: LogicGuideItem[] = [];
  const regex = /### Question (\d+)([\s\S]*?)(?=### Question \d+|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const index = parseInt(match[1], 10);
    const content = match[2].trim();
    if (content) {
      items.push({ questionIndex: index, logicContent: content });
    }
  }

  if (items.length === 0 && markdown.trim()) {
    items.push({ questionIndex: 1, logicContent: markdown });
  }

  return items;
};

const chunkLogicGuide = (items: LogicGuideItem[], perPage: number) => {
  if (!items.length || perPage <= 0) return [];
  const pages: LogicGuideItem[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  return pages;
};

const LogicGuideBlock: React.FC<{ item: LogicGuideItem; question?: Question }> = ({
  item,
  question,
}) => {
  if (!question) return null;
  return (
    <div className="flex h-full flex-col rounded border border-yellow-200 bg-yellow-50/50 p-3">
      <div className="flex items-start gap-3 border-b border-yellow-200 pb-2">
        <span className="text-[12px] font-semibold uppercase tracking-tight text-yellow-900">
          Q{item.questionIndex}
        </span>
        <div className="flex-1">
          <p className="text-[11px] font-semibold leading-[1.35] text-gray-900">{question.text}</p>
          <p className="mt-1 text-[10px] font-semibold text-green-700">
            Correct: {question.options[question.correctAnswerIndex || 0]}
          </p>
        </div>
      </div>
      <div className="flex-1 pt-2">
        <MarkdownRenderer content={item.logicContent} />
      </div>
    </div>
  );
};

const LogicGuidePage: React.FC<{ items: LogicGuideItem[]; questions: Question[] }> = ({
  items,
  questions,
}) => {
  const slots = Array.from({ length: LOGIC_BLOCKS_PER_PAGE });
  return (
    <div className="grid h-full grid-rows-4 gap-3">
      {slots.map((_, slotIndex) => {
        const item = items[slotIndex];
        if (!item) {
          return (
            <div
              key={`placeholder-${slotIndex}`}
              className="rounded border border-dashed border-yellow-200 bg-yellow-50/20"
            />
          );
        }
        const question = questions[item.questionIndex - 1];
        return <LogicGuideBlock key={item.questionIndex} item={item} question={question} />;
      })}
    </div>
  );
};

const A4Preview = forwardRef<A4PreviewHandle, A4PreviewProps>(({ data, viewMode = 'student', onGenerateLogicGuide, isGenerating }, ref) => {
  const isTeacherMode = viewMode === 'teacher';
  const [isSplit, setIsSplit] = useState(false);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const page2Ref = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    fixLayout: () => {
      setIsSplit(false);
      setLayoutNonce((n) => n + 1);
    },
  }), []);

  useLayoutEffect(() => {
    setIsSplit(false);
    setLayoutNonce((n) => n + 1);
  }, [data.readingPassage, data.logicGuide, data.questions]);

  useLayoutEffect(() => {
    if (!isSplit && page2Ref.current) {
      const hasOverflow = page2Ref.current.scrollHeight > page2Ref.current.clientHeight + 5;
      if (hasOverflow) {
        setIsSplit(true);
      }
    }
  }, [isSplit, layoutNonce, data.questions.length, data.readingPassage, data.logicGuide]);

  const questionsPage2 = isSplit ? data.questions.slice(0, 4) : data.questions;
  const questionsPage3 = isSplit ? data.questions.slice(4) : [];
  const showPage3 = !isTeacherMode || questionsPage3.length > 0;

  const parsedLogicGuide = useMemo(
    () => parseLogicGuide(data.logicGuide || ''),
    [data.logicGuide],
  );

  const teacherGuidePages = useMemo(() => {
    if (!isTeacherMode) return [];
    if (parsedLogicGuide.length === 0) return [];
    return chunkLogicGuide(parsedLogicGuide, LOGIC_BLOCKS_PER_PAGE);
  }, [isTeacherMode, parsedLogicGuide]);

  const teacherHasContent = parsedLogicGuide.length > 0;
  const teacherPagesToRender = teacherHasContent ? teacherGuidePages : [];

  const studentPageCount = showPage3 ? 3 : 2;
  const teacherPageCount = isTeacherMode ? (teacherHasContent ? teacherPagesToRender.length : 1) : 0;
  const totalPageCount = studentPageCount + teacherPageCount;
  const page3Number = showPage3 ? 3 : null;
  const teacherPageNumbers = Array.from({ length: teacherPageCount }, (_, idx) => studentPageCount + idx + 1);

  const writingLinesCount = questionsPage3.length > 0 ? 10 : 16;
  const displayPrompt =
    data.writingPrompt ||
    'Based on the reading passage, write a paragraph of at least 3 sentences. You can summarize the main idea, explain what you learned, or describe the most interesting part of the text.';

  return (
    <div className="flex flex-col gap-8 print:gap-0">
      {/* Page 1: Vocabulary */}
      <div
        className="a4-page relative flex flex-col"
        data-page-id="student-1"
        data-page-role="student"
        data-page-label="Page 1: Vocabulary"
      >
        <div className="mb-4 border-b-2 border-black pb-2">
          <h1 className="mb-2 text-[28px] font-bold tracking-tight text-gray-900">{data.title}</h1>
          <div className="flex items-end justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Vocabulary Assessment {isTeacherMode ? '(Answer Key)' : ''}
            </p>
            <div className="flex items-end gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-gray-900">Class:</span>
                <div className="min-w-[3rem] border-b border-gray-400 px-1 text-center text-xs">
                  {data.classLevel}
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-gray-900">Name:</span>
                <div className="min-w-[6rem] border-b border-gray-400 px-1 text-center text-xs">&nbsp;</div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-gray-900">Date:</span>
                <div className="min-w-[5rem] border-b border-gray-400 px-1 text-center text-xs">{data.date}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <p className="text-xs italic leading-tight text-gray-600">
            Instructions: Listen to the teacher. Spell the vocabulary word, write the Part of Speech (POS), and write two definitions or sentences.
          </p>
        </div>

        <div className="flex flex-col gap-4 pb-6">
          {data.vocabWords.slice(0, 5).map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr] gap-3 rounded-sm border border-gray-700 p-3"
            >
              <div className="text-xl font-bold text-gray-400 leading-none self-start pt-0.5">{i + 1}</div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-3 border-b border-gray-300 pb-1.5">
                  {isTeacherMode ? (
                    <span className="font-serif text-[30px] font-bold tracking-tight text-gray-900 leading-tight">
                      {item.word || ''}
                    </span>
                  ) : (
                    <span className="min-h-[2.25rem] min-w-[10rem] border-b border-dashed border-gray-300" />
                  )}
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                      Part of Speech
                    </span>
                    <span className="text-xl font-semibold text-red-700 leading-tight">
                      {isTeacherMode ? item.pos || '' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {isTeacherMode ? (
                    item.definitions && item.definitions.length > 0 ? (
                      item.definitions.map((def, dIdx) => {
                        if (!def.text && !def.translation) {
                          return null;
                        }
                        const primary = def.text?.trim();
                        const secondary = def.translation?.trim();
                        const line = [primary, secondary].filter(Boolean).join(': ');
                        return (
                          <p key={dIdx} className="text-xl leading-relaxed text-gray-900">
                            {line || `Definition ${dIdx + 1}`}
                          </p>
                        );
                      })
                    ) : (
                      <div className="text-base italic text-gray-400">No definitions loaded.</div>
                    )
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Definition / Sentence 1
                        </span>
                        <div className="h-8 w-full border-b-2 border-dashed border-gray-200" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Definition / Sentence 2
                        </span>
                        <div className="h-8 w-full border-b-2 border-dashed border-gray-200" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-8 left-0 w-full text-center">
          <span className="text-xs text-gray-400">Page 1 of {totalPageCount}</span>
        </div>
      </div>

      {/* Page 2: Reading Comprehension */}
      <div
        ref={page2Ref}
        className="a4-page relative flex flex-col"
        data-page-id="student-2"
        data-page-role="student"
        data-page-label="Page 2: Reading"
      >
        <div className="mb-4 border-b-2 border-black pb-2">
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">Reading Comprehension</h2>
        </div>

        <div className="flex flex-1 flex-col gap-5 pb-12">
          <div className="shrink-0 rounded-sm border border-gray-200 bg-gray-50 p-5 shadow-sm">
            <div className="serif-font text-[13px] leading-[1.6] text-gray-900">
              <MarkdownRenderer content={data.readingPassage} />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="mb-3 border-b border-gray-300 pb-1 text-xs font-bold uppercase tracking-wide text-gray-800">
              Questions (Part 1)
            </h3>
            <QuestionsGrid questions={questionsPage2} startIndex={0} showAnswerKey={isTeacherMode} />
          </div>
        </div>

        <div className="absolute bottom-8 left-0 w-full text-center">
          <span className="text-xs text-gray-400">Page 2 of {totalPageCount}</span>
        </div>
      </div>

      {/* Page 3: Writing Exercise & overflow questions */}
      {showPage3 && (
        <div
          className="a4-page relative flex flex-col"
          data-page-id="student-3"
          data-page-role="student"
          data-page-label="Page 3: Writing"
        >
          <div className="mb-6 border-b-2 border-black pb-2">
            <h1 className="mb-2 text-[28px] font-bold tracking-tight text-gray-900">{data.title}</h1>
            <div className="flex items-end justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Writing Exercise {isTeacherMode ? '(Answer Key)' : ''}
              </p>
              <div className="flex items-end gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-gray-900">Name:</span>
                  <div className="min-w-[6rem] border-b border-gray-400 px-1 text-center text-xs">&nbsp;</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-gray-900">Date:</span>
                  <div className="min-w-[5rem] border-b border-gray-400 px-1 text-center text-xs">{data.date}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6 pb-12">
            {questionsPage3.length > 0 && (
              <div>
                <h3 className="mb-3 border-b border-gray-300 pb-1 text-xs font-bold uppercase tracking-wide text-gray-800">
                  Questions (Part 2)
                </h3>
                <QuestionsGrid questions={questionsPage3} startIndex={4} showAnswerKey={isTeacherMode} />
              </div>
            )}

            {!isTeacherMode ? (
              <>
                <div>
                  <div className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 p-4">
                    <span className="font-bold text-gray-900">Prompt:</span>
                    <p className="serif-font text-[13px] italic leading-relaxed text-gray-800">{displayPrompt}</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col pt-4">
                  {Array.from({ length: writingLinesCount }).map((_, i) => (
                    <div key={i} className="flex-1 min-h-[1.8rem] border-b border-gray-300" />
                  ))}
                  <div className="h-6" />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm italic text-gray-400">
                {questionsPage3.length > 0 ? (
                  <span>(Writing Section Omitted for Answer Key)</span>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>

          <div className="absolute bottom-8 left-0 w-full text-center">
            <span className="text-xs text-gray-400">
              Page {page3Number} of {totalPageCount}
            </span>
          </div>
        </div>
      )}

      {/* Teacher Logic Guide Pages */}
      {isTeacherMode && teacherHasContent &&
        teacherPagesToRender.map((pageItems, index) => {
          const pageNumber = teacherPageNumbers[index] ?? studentPageCount + index + 1;
          const isFirst = index === 0;
          const headerSubtitle = isFirst
            ? "Teacher's Logic Guide (教師詳解指南)"
            : "Teacher's Logic Guide (Continued)";

          return (
            <div
              key={`teacher-guide-${index}`}
              className="a4-page relative flex flex-col"
              data-page-id={`teacher-${index + 1}`}
              data-page-role="teacher"
              data-page-label={`Teacher Guide Page ${index + 1}`}
            >
              <div className="mb-5 flex items-end justify-between border-b-2 border-yellow-600 pb-2">
                <div className="flex flex-col">
                  <h1 className="text-[24px] font-semibold tracking-tight text-gray-900">{data.title}</h1>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-yellow-700">
                    {headerSubtitle}
                  </p>
                </div>
                <span className="rounded bg-yellow-100 px-3 py-1 text-[10px] font-bold uppercase text-yellow-800">
                  Teacher Only
                </span>
              </div>

              <div className="flex-1 overflow-hidden pb-12">
                <LogicGuidePage items={pageItems} questions={data.questions} />
              </div>

              <div className="absolute bottom-8 left-0 w-full text-center">
                <span className="text-xs text-gray-400">
                  Page {pageNumber} of {totalPageCount} (Teacher's Guide)
                </span>
              </div>
            </div>
          );
        })}

      {isTeacherMode && !teacherHasContent && (
        <div
          className="a4-page relative flex flex-col"
          data-page-downloadable="false"
        >
          <div className="mb-5 flex items-end justify-between border-b-2 border-yellow-600 pb-2">
            <div className="flex flex-col">
              <h1 className="text-[24px] font-semibold tracking-tight text-gray-900">{data.title}</h1>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-yellow-700">
                Teacher's Logic Guide
              </p>
            </div>
            <span className="rounded bg-yellow-100 px-3 py-1 text-[10px] font-bold uppercase text-yellow-800">
              Teacher Only
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden pb-12 text-center text-gray-400">
            <div className="flex flex-col items-center gap-4">
              <div>
                <p className="mb-1 italic text-gray-500">No logic guide generated yet.</p>
                <p className="text-xs text-gray-400">Generate to view detailed rationales for each question.</p>
              </div>
              {onGenerateLogicGuide && (
                <button
                  onClick={onGenerateLogicGuide}
                  disabled={isGenerating}
                  className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-100 px-4 py-2 text-sm font-bold text-yellow-800 shadow-sm transition hover:bg-yellow-200 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating Guide...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate Logic Guide Now
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="absolute bottom-8 left-0 w-full text-center">
            <span className="text-xs text-gray-400">
              Page {teacherPageNumbers[0] ?? studentPageCount + 1} of {totalPageCount} (Teacher's Guide)
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

A4Preview.displayName = 'A4Preview';

export default A4Preview;
