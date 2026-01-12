import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { TestData, ViewMode, GeneratorStatus } from './types';
import Editor from './components/Editor';
import A4Preview, { A4PreviewHandle } from './components/A4Preview';
import SettingsModal from './components/SettingsModal';
import { Printer, PenTool, ImageDown, Save, Settings, AlertTriangle, GraduationCap, User, ZoomIn, ZoomOut, Maximize2, RefreshCcw, Trash2, X, CheckSquare, Square } from 'lucide-react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generateLogicGuide, getSettings } from './services/ai';

const INITIAL_DATA: TestData = {
  title: "Weekly English Quiz",
  classLevel: "",
  date: "",
  vocabWords: Array.from({ length: 4 }, (_, i) => ({ id: `v-${i}`, word: "" })),
  readingPassage: "",
  questions: Array.from({ length: 8 }, (_, i) => ({
    id: `q-${i}`,
    text: "Question " + (i + 1),
    options: ["Option A", "Option B", "Option C", "Option D"]
  })),
  writingPrompt: "Based on the reading passage, write a paragraph of at least 3 sentences. You can summarize the main idea, explain what you learned, or describe the most interesting part of the text."
};

const App: React.FC = () => {
  const [data, setData] = useState<TestData>(INITIAL_DATA);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [savedTests, setSavedTests] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('student');
  const [zoomMode, setZoomMode] = useState<'fitWidth' | 'manual'>('fitWidth');
  const [manualZoom, setManualZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [pageWidth, setPageWidth] = useState<number | null>(null);

  // Hoisted AI State
  const [status, setStatus] = useState<GeneratorStatus>(GeneratorStatus.IDLE);
  const [difficulty, setDifficulty] = useState<number>(2);

  // Confirmation Modal State
  const [pendingAction, setPendingAction] = useState<'print' | 'download' | null>(null);
  const [skipWarning, setSkipWarning] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('skip_print_warning') === '1';
  });
  const [dialogDontShow, setDialogDontShow] = useState(false);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [availablePages, setAvailablePages] = useState<{ id: string; label: string; role: 'student' | 'teacher' }[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<A4PreviewHandle | null>(null);

  const MIN_ZOOM = 0.75;
  const MAX_ZOOM = 1.6;
  const ZOOM_STEP = 0.1;
  const HORIZONTAL_PADDING = 64; // scroll-area padding (p-8) => 32px each side

  // Load list of saved tests on mount
  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('weekly_test_'));
    const titles = keys.map(k => k.replace('weekly_test_', ''));
    setSavedTests(titles.sort());
  }, []);

  const handleSave = () => {
    if (!data.title.trim()) {
      alert("Please enter a title for the test before saving.");
      return;
    }
    try {
      localStorage.setItem(`weekly_test_${data.title}`, JSON.stringify(data));
      if (!savedTests.includes(data.title)) {
        setSavedTests(prev => [...prev, data.title].sort());
      }
      alert(`Test "${data.title}" saved successfully!`);
    } catch (e) {
      console.error(e);
      alert("Failed to save test. Local storage might be full.");
    }
  };

  const handleLoad = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const title = e.target.value;
    if (!title) return;

    try {
      const savedData = localStorage.getItem(`weekly_test_${title}`);
      if (savedData) {
        // Confirm before overwriting if user has made changes? 
        // For simplicity, we just load.
        setData(JSON.parse(savedData));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to load test.");
    }
  };

  const executePrint = () => {
    // The CSS @media print handles the layout changes automatically
    window.print();
  };

  const mapPages = useCallback(() => {
    const element = document.getElementById('preview-content');
    if (!element) return [] as { id: string; label: string; role: 'student' | 'teacher' }[];
    const nodeList = Array.from(element.querySelectorAll<HTMLElement>('.a4-page'));
    return nodeList
      .filter((node) => node.getAttribute('data-page-downloadable') !== 'false')
      .map((node, index) => {
        const id = node.dataset.pageId || `page-${index + 1}`;
        const label = node.dataset.pageLabel || `Page ${index + 1}`;
        const role = (node.dataset.pageRole as 'student' | 'teacher') || 'student';
        return { id, label, role };
      });
  }, []);

  const captureSelectedPages = useCallback(
    async (pageIds: string[]) => {
      const element = document.getElementById('preview-content');
      if (!element) return [] as { id: string; canvas: HTMLCanvasElement }[];

      const wrapper = previewWrapperRef.current;
      const previousTransform = wrapper?.style.transform;
      const previousOrigin = wrapper?.style.transformOrigin;

      if (wrapper) {
        wrapper.style.transform = 'scale(1)';
        wrapper.style.transformOrigin = 'top center';
      }

      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const pages = Array.from(element.querySelectorAll<HTMLElement>('.a4-page'));
        const filtered = pages.filter((page) => pageIds.includes(page.dataset.pageId || ''));
        const results: { id: string; canvas: HTMLCanvasElement }[] = [];
        for (const page of filtered) {
          const pageId = page.dataset.pageId || 'page';
          try {
            const canvas = await html2canvas(page, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff'
            });
            results.push({ id: pageId, canvas });
          } catch (e) {
            console.error('Error generating image', e);
            alert('Could not generate image for page ' + (page.dataset.pageLabel || pageId));
          }
        }
        return results;
      } finally {
        if (wrapper) {
          wrapper.style.transform = previousTransform ?? '';
          wrapper.style.transformOrigin = previousOrigin ?? 'top center';
        }
      }
    },
    []
  );

  const executeDownloadPNG = useCallback(
    async (pageIds: string[]) => {
      if (!pageIds.length) return;
      setIsDownloading(true);
      try {
        const captures = await captureSelectedPages(pageIds);
        if (!captures.length) return;
        const zip = new JSZip();
        const folder = zip.folder('pages') || zip;
        const sanitizedTitle = data.title.trim() ? data.title.trim().replace(/[^a-z0-9-_]+/gi, '_') : 'Test';
        captures.forEach(({ canvas }, index) => {
          const baseName = `${sanitizedTitle}_Page_${index + 1}`;
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.split(',')[1];
          folder.file(`${baseName}.png`, base64, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const zipName = `${sanitizedTitle || 'Test'}.zip`;
        saveAs(blob, zipName);
      } finally {
        setIsDownloading(false);
      }
    },
    [captureSelectedPages, data.title]
  );

  const beginAction = useCallback(
    (action: 'print' | 'download') => {
      if (skipWarning) {
        if (action === 'print') {
          executePrint();
        } else {
          const pages = mapPages();
          setAvailablePages(pages);
          setSelectedPageIds(pages.map((p) => p.id));
          setDownloadModalOpen(true);
        }
        return;
      }
      setDialogDontShow(false);
      setPendingAction(action);
    },
    [skipWarning, executePrint, mapPages]
  );

  const handlePrintRequest = useCallback(() => beginAction('print'), [beginAction]);
  const handleDownloadRequest = useCallback(() => beginAction('download'), [beginAction]);

  const confirmPendingAction = () => {
      if (dialogDontShow) {
        localStorage.setItem('skip_print_warning', '1');
        setSkipWarning(true);
      }
      if (pendingAction === 'print') executePrint();
      if (pendingAction === 'download') {
        const pages = mapPages();
        setAvailablePages(pages);
        setSelectedPageIds(pages.map((p) => p.id));
        setDownloadModalOpen(true);
      }
      setPendingAction(null);
  };

  const handleFixLayout = useCallback(() => {
    previewRef.current?.fixLayout();
  }, []);

  const handleClearTest = useCallback(() => {
    setData({
      ...INITIAL_DATA,
      vocabWords: Array.from({ length: 5 }, (_, i) => ({ id: `v-${i}`, word: '', pos: '', definitions: [] })),
      questions: Array.from({ length: 8 }, (_, i) => ({
        id: `q-${i}`,
        text: '',
        options: ['', '', '', ''],
        correctAnswerIndex: 0,
      })),
      readingPassage: '',
      logicGuide: '',
    });
    previewRef.current?.fixLayout();
  }, []);

  // --- Zoom & Measurement Logic ---

  useLayoutEffect(() => {
    const firstPage = document.querySelector('.a4-page') as HTMLElement | null;
    if (firstPage) {
      const measuredWidth = firstPage.offsetWidth;
      if (measuredWidth && Math.abs(measuredWidth - (pageWidth ?? 0)) > 0.5) {
        setPageWidth(measuredWidth);
      }
    }
  }, [data, viewMode]);

  useEffect(() => {
    if (!scrollAreaRef.current) {
      return;
    }

    const node = scrollAreaRef.current;
    const initialWidth = node.clientWidth;
    setContainerWidth(initialWidth);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect?.width) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitWidthScale = useMemo(() => {
    if (!containerWidth || !pageWidth) {
      return 1;
    }
    const availableWidth = Math.max(containerWidth - HORIZONTAL_PADDING, 0);
    const raw = availableWidth / pageWidth;
    if (!Number.isFinite(raw) || raw <= 0) {
      return 1;
    }
    return Math.min(MAX_ZOOM, Math.max(1, raw));
  }, [containerWidth, pageWidth]);

  const clampedManualZoom = useMemo(
    () => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, manualZoom)),
    [manualZoom]
  );

  const baseZoom = zoomMode === 'fitWidth' ? fitWidthScale : clampedManualZoom;
  const targetZoom = baseZoom;
  const responsiveZoom = targetZoom * (showPreviewMobile ? 0.5 : 1);

  useEffect(() => {
    if (zoomMode !== 'manual') return;
    if (clampedManualZoom !== manualZoom) {
      setManualZoom(clampedManualZoom);
    }
  }, [clampedManualZoom, manualZoom, zoomMode]);

  const updateManualZoom = useCallback(
    (delta: number) => {
      setZoomMode('manual');
      setManualZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((prev + delta).toFixed(2))));
        return next;
      });
    },
    [MAX_ZOOM, MIN_ZOOM]
  );

  const handleZoomIn = () => updateManualZoom(ZOOM_STEP);
  const handleZoomOut = () => updateManualZoom(-ZOOM_STEP);
  const handleFitToWidth = () => {
    setZoomMode('fitWidth');
    setManualZoom(fitWidthScale);
  };

  const zoomPercent = Math.round(targetZoom * 100);
  const isZoomOutDisabled = zoomMode === 'manual' && clampedManualZoom <= MIN_ZOOM + 1e-3;
  const isZoomInDisabled = zoomMode === 'manual' && clampedManualZoom >= MAX_ZOOM - 1e-3;

  // --- Shared AI Handlers ---

  const checkApiKey = (): boolean => {
      const settings = getSettings();
      const key = settings.provider === 'google' ? settings.googleKey : settings.openaiKey;
      
      if (!key || key.trim() === '') {
          setShowSettings(true);
          return false;
      }
      return true;
  };

  const handleGenerateLogicGuide = async () => {
      if (!checkApiKey()) return;

      if (!data.readingPassage || data.questions.length === 0) {
          alert("Please have a reading passage and questions ready first.");
          return;
      }
      setStatus(GeneratorStatus.GENERATING);
      try {
          const guide = await generateLogicGuide(data.readingPassage, data.questions, difficulty);
          setData(prev => ({ ...prev, logicGuide: guide }));
          setStatus(GeneratorStatus.SUCCESS);
      } catch (e: any) {
          console.error(e);
          alert(e.message || "Failed to generate logic guide.");
          setStatus(GeneratorStatus.ERROR);
      } finally {
          setStatus(GeneratorStatus.IDLE);
      }
  };

  return (
    <div id="app-container" className="flex h-screen w-full bg-gray-100 overflow-hidden font-sans text-slate-900 notranslate">
      
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 bg-amber-100 p-3 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Review Content Before Export</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    AI-generated content may contain factual errors, ambiguous logic, or incorrect answer keys.
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed mt-3 font-medium bg-amber-50 p-2 rounded border border-amber-200">
                    Please verify the questions and answer key logic before administering this test to students.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
              <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
                <input
                  type="checkbox"
                  checked={dialogDontShow}
                  onChange={(e) => setDialogDontShow(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Don't show this again
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingAction(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:text-gray-900 border border-gray-300 rounded-md shadow-sm transition-colors"
                >
                  Cancel & Verify
                </button>
                <button
                  onClick={confirmPendingAction}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors flex items-center gap-2"
                >
                  {pendingAction === 'print' ? <Printer className="w-4 h-4" /> : <ImageDown className="w-4 h-4" />}
                  Proceed to {pendingAction === 'print' ? 'Print' : 'Download'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {downloadModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ImageDown className="w-5 h-5 text-indigo-600" />
                Select Pages to Export
              </h3>
              <button
                onClick={() => {
                  setDownloadModalOpen(false);
                  setSelectedPageIds([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Pages</span>
                <div className="flex gap-2">
                  <button
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    onClick={() => setSelectedPageIds(availablePages.map((p) => p.id))}
                  >
                    Select All
                  </button>
                  <button
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                    onClick={() => setSelectedPageIds([])}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {availablePages.map((page) => {
                  const checked = selectedPageIds.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={`flex items-center justify-between border rounded-md px-3 py-2 text-sm transition ${checked ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center gap-3">
                        {checked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                        <span className="font-medium text-gray-800">{page.label}</span>
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPageIds((prev) => [...prev, page.id]);
                          } else {
                            setSelectedPageIds((prev) => prev.filter((id) => id !== page.id));
                          }
                        }}
                      />
                      <span className={`text-xs uppercase tracking-wide ${page.role === 'teacher' ? 'text-amber-600' : 'text-indigo-600'}`}>
                        {page.role === 'teacher' ? 'Teacher' : 'Student'}
                      </span>
                    </label>
                  );
                })}
                {availablePages.length === 0 && (
                  <div className="text-sm text-gray-500 italic">No pages detected.</div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setDownloadModalOpen(false);
                  setSelectedPageIds([]);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await executeDownloadPNG(selectedPageIds);
                  setDownloadModalOpen(false);
                  setSelectedPageIds([]);
                }}
                disabled={!selectedPageIds.length || isDownloading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm disabled:opacity-50"
              >
                {isDownloading ? 'Preparing...' : 'Download ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Editor (Hidden on Print) */}
      <div className={`
        fixed inset-0 z-50 transform transition-transform duration-300 md:relative md:transform-none md:z-0
        ${showPreviewMobile ? 'translate-x-full' : 'translate-x-0'}
        md:flex md:w-auto no-print
      `}>
        <Editor 
          data={data} 
          onChange={setData} 
          onOpenSettings={() => setShowSettings(true)}
          status={status}
          setStatus={setStatus}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onGenerateLogicGuide={handleGenerateLogicGuide}
        />
      </div>

      {/* Main Preview Area */}
      <div id="main-area" className="flex-1 flex flex-col h-full relative overflow-hidden bg-gray-200/50">
        
        {/* Top Toolbar */}
        <div className="h-16 bg-white border-b border-gray-200 flex justify-between items-center px-6 shadow-sm z-20 no-print">
          <div className="font-bold text-lg text-indigo-900 flex items-center gap-2">
            <PenTool className="w-5 h-5" />
            <span>TestGenerator</span>
          </div>

          <div className="flex items-center gap-3">
             {/* Load Dropdown */}
             {savedTests.length > 0 && (
               <select 
                 className="text-sm border border-gray-300 rounded-md px-2 py-2 bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none max-w-[130px]"
                 onChange={handleLoad}
                 value=""
               >
                 <option value="" disabled>Load Saved...</option>
                 {savedTests.map(title => (
                   <option key={title} value={title}>{title}</option>
                 ))}
               </select>
             )}

              {/* Save Button */}
              <button
                onClick={handleSave}
                className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors"
                title="Save to Browser Storage"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <button
                onClick={handleFixLayout}
                className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors"
                title="Recompute layout pagination"
              >
                <RefreshCcw className="w-4 h-4" />
                <span className="hidden lg:inline">Fix Layout</span>
              </button>

              <button
                onClick={handleClearTest}
                className="flex items-center gap-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 px-3 py-2 rounded-md font-medium text-sm shadow-sm transition-colors"
                title="Clear current test content"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden xl:inline">Clear Test</span>
              </button>

              <div className="h-6 w-px bg-gray-300 mx-1"></div>
            
             {/* View Mode Toggle */}
             <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                <button
                    onClick={() => setViewMode('student')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <User className="w-4 h-4" />
                    <span className="hidden xl:inline">Student</span>
                </button>
                <button
                    onClick={() => setViewMode('teacher')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'teacher' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <GraduationCap className="w-4 h-4" />
                    <span className="hidden xl:inline">Teacher</span>
                </button>
             </div>

             <div className="h-6 w-px bg-gray-300 mx-1"></div>

              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                title="AI Settings"
              >
                 <Settings className="w-5 h-5" />
              </button>

              {/* Zoom Toolbar */}
              <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-md px-2 py-1 shadow-inner">
                <button
                  onClick={handleZoomOut}
                  disabled={isZoomOutDisabled}
                  className="p-2 rounded-md text-gray-600 hover:text-indigo-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="min-w-[60px] text-center text-xs font-semibold text-gray-700">
                  {zoomPercent}%
                </div>
                <button
                  onClick={handleZoomIn}
                  disabled={isZoomInDisabled}
                  className="p-2 rounded-md text-gray-600 hover:text-indigo-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-gray-300" />
                <button
                  onClick={handleFitToWidth}
                  className={`p-2 rounded-md text-xs font-semibold flex items-center gap-1 transition ${zoomMode === 'fitWidth' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-indigo-600 hover:bg-white'}`}
                  title="Fit to width"
                >
                  <Maximize2 className="w-4 h-4" />
                  Fit
                </button>
              </div>

              {/* Mobile Toggle */}
              <button 
                 onClick={() => setShowPreviewMobile(!showPreviewMobile)}
                 className="md:hidden px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
             >
                 {showPreviewMobile ? "Edit" : "Preview"}
            </button>

            <button
              onClick={handleDownloadRequest}
              disabled={isDownloading}
              className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md font-medium shadow-sm transition-colors disabled:opacity-50 text-sm"
            >
              <ImageDown className="w-4 h-4" />
              <span className="hidden lg:inline">{isDownloading ? "Saving..." : "Download PNG"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintRequest}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md font-medium shadow-sm transition-colors text-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Scrollable Preview Canvas */}
        <div
          id="scroll-area"
          ref={scrollAreaRef}
          className="flex-1 overflow-auto p-8 flex justify-center items-start"
        >
            <div
              ref={previewWrapperRef}
              className="transition-transform duration-300 origin-top"
              style={{
                transform: `scale(${responsiveZoom})`,
                transformOrigin: 'top center',
                width: pageWidth ? `${pageWidth}px` : undefined,
              }}
            >
                  {/* ID used for targeting PNG generation and Print CSS scope */}
                  <div id="preview-content">
                     <A4Preview 
                       data={data} 
                       viewMode={viewMode} 
                       ref={previewRef}
                       onGenerateLogicGuide={handleGenerateLogicGuide}
                       isGenerating={status === GeneratorStatus.GENERATING}
                    />
                 </div>
            </div>
        </div>
      </div>
      
    </div>
  );
};

export default App;
