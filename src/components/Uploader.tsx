/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeFinancialText } from '../services/ai';

interface UploaderProps {
  onUploadStarted: () => void;
  onAnalysisComplete: (result: any) => void;
  onError: (msg: string) => void;
}

export default function Uploader({ onUploadStarted, onAnalysisComplete, onError }: UploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'extracting' | 'analyzing'>('idle');
  const [options, setOptions] = useState<string[]>(['highlights', 'risks', 'esg', 'competitors']);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableOptions = [
    { id: 'highlights', label: 'Investment Highlights' },
    { id: 'risks', label: 'Strategic Risks' },
    { id: 'esg', label: 'ESG Summary' },
    { id: 'competitors', label: 'Competitor Analysis' },
  ];

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      onError('Please upload a PDF file.');
      return;
    }
    if (options.length === 0) {
      onError('Please select at least one analysis option.');
      return;
    }

    setIsUploading(true);
    setStatus('extracting');
    onUploadStarted();

    const formData = new FormData();
    formData.append('report', file);

    try {
      // 1. Extract text via backend
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!extractRes.ok) {
        let errorMessage = 'Failed to extract text from PDF';
        const contentType = extractRes.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await extractRes.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await extractRes.text();
          if (text.includes('<title>Cookie check</title>') || text.includes('Cookie check') || text.includes('goog-auth')) {
            errorMessage = 'Preview environment interrupted the request. Please click the "Open in New Tab" button at the top right to verify your identity and try again.';
          } else {
            errorMessage = `Server Error (${extractRes.status}): Please check if the backend is running.`;
            console.error('Server returned non-JSON error:', text.substring(0, 500));
          }
        }
        onError(errorMessage);
        return;
      }

      const contentType = extractRes.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const htmlText = await extractRes.text();
        
        let finalError = '';
        if (htmlText.includes('<title>Cookie check</title>') || htmlText.includes('Cookie check') || htmlText.includes('goog-auth')) {
          finalError = 'Preview environment interrupted the request. Please click the "Open in New Tab" button at the top right to verify your identity and try again.';
        } else {
          console.error('Expected JSON but got HTML. First 500 chars:', htmlText.substring(0, 500));
          finalError = `Server Error (${extractRes.status}): The API returned HTML instead of data. This usually happens if the backend is restarting or blocked by security settings.`;
        }
        onError(finalError);
        return;
      }

      const { text } = await extractRes.json();
      
      // 2. Analyze via Gemini (Frontend)
      setStatus('analyzing');
      try {
        const analysis = await analyzeFinancialText(text, options);
        onAnalysisComplete(analysis);
      } catch (aiErr: any) {
        console.error("AI Error:", aiErr);
        if (aiErr.message?.includes('API key') || aiErr.message?.includes('auth') || aiErr.message?.includes('401') || aiErr.message?.includes('403')) {
          onError('API认证失败，请检查API key是否正确配置');
        } else {
          onError(aiErr.message || 'AI analysis failed');
        }
        return;
      }
    } catch (err: any) {
      console.error(err);
      onError(err.message || 'An error occurred during analysis. Please try again.');
    } finally {
      setIsUploading(false);
      setStatus('idle');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <motion.div
        id="uploader-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative group cursor-pointer border-2 border-dashed rounded-2xl p-12
          transition-all duration-300 flex flex-col items-center justify-center gap-4
          ${isDragging 
            ? 'border-blue-500 bg-blue-50/50' 
            : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
          }
          ${isUploading ? 'pointer-events-none' : ''}
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
          accept="application/pdf"
        />

        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="loading"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {status === 'extracting' ? 'Reading Document' : 'AI Analysis In Progress'}
                </h3>
                <p className="text-sm text-slate-500">
                  {status === 'extracting' 
                    ? 'Processing PDF and extracting text layers...' 
                    : 'Gemini is extracting deep financial insights...'}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Upload Financial Report</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Drag and drop your PDF here, or click to browse
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                <FileText className="w-3 h-3" />
                <span>PDF Documents only</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Extraction Options UI */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Analysis Options</h3>
            <p className="text-xs text-slate-500">Select the insights you want the AI to extract</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setOptions(availableOptions.map(o => o.id))}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button 
              onClick={() => setOptions([])}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {availableOptions.map((opt) => {
            const isChecked = options.includes(opt.id);
            return (
              <label 
                key={opt.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  isChecked 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:border-blue-300 bg-white'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={isChecked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setOptions([...options, opt.id]);
                    } else {
                      setOptions(options.filter(id => id !== opt.id));
                    }
                  }}
                />
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  isChecked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                }`}>
                  {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className={`text-sm font-semibold ${isChecked ? 'text-blue-900' : 'text-slate-700'}`}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
