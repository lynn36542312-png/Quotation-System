import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertCircle, CheckCircle2, FileText, Clock, Info } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  status?: string;
  sourceFiles?: string[];
  citations?: string[];
  updatedAt?: string;
  ruleResult?: string;
}

export default function SalesPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    role: 'bot',
    content: '你好！我是報價小幫手。你可以問我關於產品的報價、優惠資訊或負責的 PM。',
    status: '已找到',
    ruleResult: 'exact match'
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content })
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Chat failed with status ${res.status}: ${text.substring(0, 100)}`);
      }
      
      const data = await res.json();
      
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: data.answer,
        status: data.status,
        sourceFiles: data.sourceFiles,
        citations: data.citations,
        updatedAt: data.updatedAt,
        ruleResult: data.ruleResult
      };
      
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: '抱歉，系統發生錯誤，請稍後再試。',
        status: '錯誤',
        ruleResult: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAsk = (text: string) => {
    setInput(text);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 max-w-4xl mx-auto p-4">
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-emerald-600 mr-3'}`}>
                  {msg.role === 'user' ? <User size={18} className="text-white" /> : <Bot size={18} className="text-white" />}
                </div>
                
                <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  
                  {/* Metadata Card for Bot Responses */}
                  {msg.role === 'bot' && msg.id !== 'welcome' && (
                    <div className="mt-2 bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 shadow-sm w-full">
                      <div className="flex items-center mb-2">
                        {msg.status === '已找到' && <CheckCircle2 size={14} className="text-emerald-500 mr-1" />}
                        {msg.status === '查無資料' && <AlertCircle size={14} className="text-amber-500 mr-1" />}
                        {msg.status === '資料衝突' && <AlertCircle size={14} className="text-red-500 mr-1" />}
                        <span className="font-medium mr-3">Status: {msg.status}</span>
                        <span className="text-gray-400">Rule: {msg.ruleResult}</span>
                      </div>
                      
                      {msg.sourceFiles && msg.sourceFiles.length > 0 && (
                        <div className="flex items-start mt-1">
                          <FileText size={12} className="mt-0.5 mr-1 text-gray-400" />
                          <span>Source: {msg.sourceFiles.join(', ')}</span>
                        </div>
                      )}
                      
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex items-start mt-1">
                          <Info size={12} className="mt-0.5 mr-1 text-gray-400" />
                          <span>Citation: {msg.citations.join('; ')}</span>
                        </div>
                      )}
                      
                      {msg.updatedAt && (
                        <div className="flex items-start mt-1">
                          <Clock size={12} className="mt-0.5 mr-1 text-gray-400" />
                          <span>Updated: {new Date(msg.updatedAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex flex-row max-w-[80%]">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-600 mr-3 flex items-center justify-center">
                  <Bot size={18} className="text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-gray-100 text-gray-800 rounded-tl-none flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex space-x-2 overflow-x-auto">
          <button onClick={() => handleQuickAsk('iPhone 15 報價多少？')} className="whitespace-nowrap px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors">iPhone 15 報價多少？</button>
          <button onClick={() => handleQuickAsk('MacBook Pro 有什麼優惠？')} className="whitespace-nowrap px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors">MacBook Pro 有什麼優惠？</button>
          <button onClick={() => handleQuickAsk('iPad Air 的 PM 是誰？')} className="whitespace-nowrap px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors">iPad Air 的 PM 是誰？</button>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200">
          <form onSubmit={handleSend} className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="詢問產品報價、優惠或 PM..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
