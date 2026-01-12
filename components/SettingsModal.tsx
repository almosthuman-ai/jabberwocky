import React, { useState, useEffect, useRef } from 'react';
import { AISettings, AIProvider } from '../types';
import { X, Check, Key } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'google',
    googleKey: '',
    openaiKey: ''
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ai_settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSave = () => {
    localStorage.setItem('ai_settings', JSON.stringify(settings));
    setSaveStatus('saved');
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      saveTimeoutRef.current = null;
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-600" />
            AI Configuration
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          
          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700">Select Provider</label>
            <div className="grid grid-cols-2 gap-4">
              <label className={`
                cursor-pointer border rounded-md p-3 flex items-center gap-3 transition
                ${settings.provider === 'google' ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:border-gray-300'}
              `}>
                <input 
                  type="radio" 
                  name="provider" 
                  value="google" 
                  checked={settings.provider === 'google'}
                  onChange={() => setSettings({ ...settings, provider: 'google' })}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-900">Google Gemini</div>
                  <div className="text-xs text-gray-500">Fast & Free Tier Available</div>
                </div>
                {settings.provider === 'google' && <Check className="w-4 h-4 text-indigo-600" />}
              </label>

              <label className={`
                cursor-pointer border rounded-md p-3 flex items-center gap-3 transition
                ${settings.provider === 'openai' ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:border-gray-300'}
              `}>
                <input 
                  type="radio" 
                  name="provider" 
                  value="openai" 
                  checked={settings.provider === 'openai'}
                  onChange={() => setSettings({ ...settings, provider: 'openai' })}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-900">OpenAI</div>
                  <div className="text-xs text-gray-500">GPT-4o / GPT-3.5</div>
                </div>
                {settings.provider === 'openai' && <Check className="w-4 h-4 text-indigo-600" />}
              </label>
            </div>
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            <div className={`space-y-2 ${settings.provider !== 'google' ? 'opacity-50' : ''}`}>
              <label className="block text-sm font-medium text-gray-700">Google API Key</label>
              <input
                type="password"
                value={settings.googleKey}
                onChange={(e) => setSettings({ ...settings, googleKey: e.target.value })}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900"
              />
              <p className="text-[10px] text-gray-500">
                Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Google AI Studio</a>.
              </p>
            </div>

            <div className={`space-y-2 ${settings.provider !== 'openai' ? 'opacity-50' : ''}`}>
              <label className="block text-sm font-medium text-gray-700">OpenAI API Key</label>
              <input
                type="password"
                value={settings.openaiKey}
                onChange={(e) => setSettings({ ...settings, openaiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900"
              />
              <p className="text-[10px] text-gray-500">
                Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">OpenAI Platform</a>.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 border-t">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="w-4 h-4" />
              Saved
            </span>
          )}
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
