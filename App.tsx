import React, { useState, useEffect, useMemo, useRef, createContext, useContext, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import ReactMarkdown from 'react-markdown';
import * as Icons from './components/Icons';
import { Pet, LogEntry, ExpenseEntry, LogType, Species, AnalysisResult, Photo, ChatMessage, MemoEntry } from './types';
import * as Storage from './services/storage';
import * as GeminiService from './services/geminiService';
import { translations } from './translations';

// --- Language Context ---

type Language = 'en' | 'zh';
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

const useLanguage = () => useContext(LanguageContext);

// --- Helper Functions ---

const compressImage = (
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDimension = options.maxDimension ?? 800;
        const quality = options.quality ?? 0.7;
        const MAX_WIDTH = maxDimension;
        const MAX_HEIGHT = maxDimension;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality)); // Compress to JPEG quality
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

const toLocalYYYYMMDD = (isoStringOrDate: string | Date): string => {
  const d = typeof isoStringOrDate === 'string' ? new Date(isoStringOrDate) : isoStringOrDate;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday
  // Adjust to get Monday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// --- Helper Components ---

const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = "", onClick }) => (
  <div 
    onClick={onClick}
    className={`bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] min-w-0 ${className}`}
  >
    {children}
  </div>
);

const Button: React.FC<{ 
  onClick?: () => void; 
  children: React.ReactNode; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; 
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}> = ({ onClick, children, variant = 'primary', className = "", disabled, type = 'button' }) => {
  const baseStyles = "px-5 py-3 rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 text-sm tracking-wide";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm disabled:bg-slate-50 disabled:text-slate-400",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
  };
  return (
    <button 
      type={type}
      onClick={onClick} 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const LanguageToggle: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  return (
    <button 
      onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      className="p-2 rounded-full bg-white shadow-sm border border-slate-100 text-slate-600 hover:text-teal-600 hover:bg-teal-50 transition-colors flex items-center gap-1"
    >
      <Icons.Globe className="w-4 h-4" />
      <span className="text-xs font-bold uppercase w-5 text-center">{language}</span>
    </button>
  );
};

const formatPetAge = (pet: Pet, language: Language) => {
  const years = pet.age || 0;
  const months = pet.ageMonths || 0;
  if (!years && !months) {
    return language === 'zh' ? '0岁' : '0 yr';
  }
  const parts: string[] = [];
  if (years) parts.push(language === 'zh' ? `${years}岁` : `${years} yr`);
  if (months) parts.push(language === 'zh' ? `${months}个月` : `${months} mo`);
  return language === 'zh' ? parts.join('') : parts.join(' ');
};

// --- Constants for Charts ---

const EXPENSE_COLORS: Record<string, string> = {
    'Food': '#d97706',      // Amber-600 (Warm/Organic)
    'Vet': '#be123c',       // Rose-700 (Alert/Medical)
    'Toys': '#7c3aed',      // Violet-600 (Playful)
    'Grooming': '#0d9488',  // Teal-600 (Clean)
    'Medicine': '#2563eb',  // Blue-600 (Clinical)
    'Other': '#64748b'      // Slate-500 (Neutral)
};

const EXPENSE_BG_COLORS: Record<string, string> = {
    'Food': 'bg-amber-50 text-amber-600',
    'Vet': 'bg-rose-50 text-rose-600',
    'Toys': 'bg-violet-50 text-violet-600',
    'Grooming': 'bg-teal-50 text-teal-600',
    'Medicine': 'bg-blue-50 text-blue-600',
    'Other': 'bg-slate-50 text-slate-500'
};

// --- Sub-Views ---

const ChatModal: React.FC<{ 
  pet: Pet;
  logs: LogEntry[];
  analysis: AnalysisResult | null;
  onClose: () => void; 
}> = ({ pet, logs, analysis, onClose }) => {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await GeminiService.getHealthChatResponse(
        pet,
        logs,
        analysis,
        messages,
        userMsg.text,
        language
      );
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: t('error_processing') }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-slide-up">
        <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-full text-teal-600">
              <Icons.MessageCircle className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-slate-800">{t('chat_with_ai')}</h3>
                <p className="text-xs text-slate-400">{pet.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.length === 0 && (
                <div className="text-center mt-10 text-slate-400 text-sm px-6">
                    <Icons.Sparkles className="w-8 h-8 mx-auto mb-3 text-teal-200" />
                    <p>{t('tap_to_analyze', { name: pet.name })}</p>
                    <p className="mt-2 text-xs opacity-75">{t('chat_placeholder')}</p>
                </div>
            )}
            {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-br-none' 
                        : 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-bl-none'
                    }`}>
                        {msg.role === 'user' ? (
                            msg.text
                        ) : (
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown
                                    components={{
                                        p: ({node, ...props}) => <p className="mb-2 last:mb-0 text-slate-700" {...props} />,
                                        ul: ({node, ...props}) => <ul className="mb-2 last:mb-0 ml-4 list-disc text-slate-700" {...props} />,
                                        ol: ({node, ...props}) => <ol className="mb-2 last:mb-0 ml-4 list-decimal text-slate-700" {...props} />,
                                        li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                        strong: ({node, ...props}) => <strong className="font-semibold text-slate-800" {...props} />,
                                        em: ({node, ...props}) => <em className="italic" {...props} />,
                                        h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 text-slate-800" {...props} />,
                                        h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 text-slate-800" {...props} />,
                                        h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1 text-slate-800" {...props} />,
                                        code: ({node, ...props}) => <code className="bg-slate-100 px-1 py-0.5 rounded text-xs" {...props} />,
                                    }}
                                >
                                    {msg.text}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex justify-start">
                     <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                     </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100">
            <div className="relative">
                <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('chat_placeholder')}
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm"
                />
                <button 
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600 transition-colors"
                >
                    <Icons.Send className="w-4 h-4" />
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

const SmartEntryModal: React.FC<{ onClose: () => void; onSuccess: () => void; petId: string }> = ({ onClose, onSuccess, petId }) => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const { t, language } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsProcessing(true);
    setError('');

    try {
      const result = await GeminiService.parsePetCommand(input);

      if (result.intent === 'LOG' && result.logDetails) {
        const detectedType = result.logDetails.type || LogType.NOTE;
        await Storage.addLog(petId, {
          type: detectedType,
          value: result.logDetails.value ? String(result.logDetails.value) : '',
          notes: result.logDetails.notes ? String(result.logDetails.notes) : '',
          date: new Date().toISOString()
        });
        onSuccess();
        onClose();
      } else if (result.intent === 'EXPENSE' && result.expenseDetails) {
        await Storage.addExpense(petId, {
          category: result.expenseDetails.category || 'Other',
          amount: result.expenseDetails.amount || 0,
          notes: result.expenseDetails.notes || '',
          date: new Date().toISOString()
        });
        onSuccess();
        onClose();
      } else if (result.intent === 'MEMO' && result.memoDetails) {
        await Storage.addMemo(petId, {
          title: result.memoDetails.title || input,
          notes: result.memoDetails.notes || '',
          dueDate: result.memoDetails.dueDate || null,
          done: false,
          source: 'ai'
        });
        onSuccess();
        onClose();
      } else {
        setError(t('error_understanding'));
      }
    } catch (err) {
      console.error(err);
      setError(t('error_processing'));
    } finally {
      setIsProcessing(false);
    }
  };

  const hints = [t('hint_fed'), t('hint_bought'), t('hint_slept'), t('hint_reminder')];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-slide-up">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-full text-teal-600">
                <Icons.Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-800">{t('ai_assistant')}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            {t('describe_hint')}
          </p>
          
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative group">
                <textarea
                className="w-full p-5 pr-14 rounded-2xl bg-white border border-slate-200 text-slate-800 shadow-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all resize-none text-base"
                rows={4}
                placeholder={t('placeholder_hint')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                />
                <button 
                type="submit" 
                disabled={isProcessing || !input.trim()}
                className="absolute bottom-3 right-3 p-2.5 bg-slate-900 text-white rounded-xl hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-md"
                >
                {isProcessing ? <Icons.Activity className="w-5 h-5 animate-spin" /> : <Icons.Send className="w-5 h-5" />}
                </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50/50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-start gap-3 animate-fade-in">
              <Icons.Activity className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-8">
             <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('try_saying')}</p>
             <div className="flex flex-wrap gap-2 text-sm">
                {hints.map((hint, i) => (
                    <button key={i} onClick={() => setInput(hint)} className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-slate-600 hover:border-teal-200 hover:text-teal-600 transition-colors">
                        "{hint}"
                    </button>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PetForm: React.FC<{ onSave: () => void; onCancel: () => void; initialData?: Pet }> = ({ onSave, onCancel, initialData }) => {
  const { t } = useLanguage();
  const [name, setName] = useState(initialData?.name || '');
  const [species, setSpecies] = useState<Species>(initialData?.species || Species.DOG);
  const [age, setAge] = useState(initialData?.age?.toString() || '');
  const [ageMonths, setAgeMonths] = useState(initialData?.ageMonths?.toString() || '');
  const [weight, setWeight] = useState(initialData?.weight?.toString() || '');
  const [breed, setBreed] = useState(initialData?.breed || '');
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        try {
            const base64 = await compressImage(file, { maxDimension: 400, quality: 0.6 });
            setPhotoUrl(base64);
        } catch (err) {
            console.error("Image processing failed", err);
            alert("Failed to load image. Try a smaller file.");
        }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const defaultPhoto = species === Species.DOG 
        ? `https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=150&q=80` 
        : `https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80`;
    const monthsValue = Math.min(11, Math.max(0, Number(ageMonths) || 0));

    setIsSaving(true);
    try {
      await Storage.savePet({
        ...(initialData ? { id: initialData.id } : {}),
        name,
        species,
        age: Number(age),
        ageMonths: monthsValue,
        weight: Number(weight),
        breed,
        photoUrl: photoUrl || defaultPhoto
      });
      onSave();
    } catch (error) {
      console.error('Failed to save pet', error);
      alert(t('error_processing'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-fade-in bg-white">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">{initialData ? t('edit_profile') : t('new_profile')}</h2>
        <p className="text-slate-500">{initialData ? t('edit_details') : t('create_details')}</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto no-scrollbar pb-10">
        
        <div className="flex flex-col items-center">
            <div 
                className="w-28 h-28 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden relative cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
            >
                {photoUrl ? (
                    <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <Icons.Camera className="w-8 h-8" />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-bold">{t('change_photo')}</span>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">{t('upload_hint')}</p>
            <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange} 
            />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('name')}</label>
          <input required className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all" 
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Buddy" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
           <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('species')}</label>
            <div className="relative">
                <select className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white appearance-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
                value={species} onChange={e => setSpecies(e.target.value as Species)}>
                {Object.values(Species).map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Icons.ChevronLeft className="-rotate-90 w-4 h-4" />
                </div>
            </div>
          </div>
           <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('breed')}</label>
            <input className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
              value={breed} onChange={e => setBreed(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('age_years')}</label>
            <input required type="number" className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
              value={age} onChange={e => setAge(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('age_months')}</label>
            <input type="number" min={0} max={11} className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
              value={ageMonths} onChange={e => setAgeMonths(e.target.value)} placeholder="0-11" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('weight_kg')}</label>
            <input required type="number" className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
              value={weight} onChange={e => setWeight(e.target.value)} />
          </div>
        </div>

        <div className="pt-6 grid grid-cols-2 gap-4">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>{t('cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{initialData ? t('save') : t('create')}</Button>
        </div>
      </form>
    </div>
  );
};

const LogForm: React.FC<{ petId: string; onSave: () => void; onCancel: () => void; initialLog?: LogEntry | null }> = ({ petId, onSave, onCancel, initialLog }) => {
  const { t } = useLanguage();
  const [type, setType] = useState<LogType>(initialLog?.type || LogType.ACTIVITY);
  const [value, setValue] = useState(initialLog?.value || '');
  const [notes, setNotes] = useState(initialLog?.notes || '');
  const [logDate, setLogDate] = useState(() => toLocalYYYYMMDD(initialLog?.date || new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    setType(initialLog?.type || LogType.ACTIVITY);
    setValue(initialLog?.value || '');
    setNotes(initialLog?.notes || '');
    setLogDate(toLocalYYYYMMDD(initialLog?.date || new Date()));
  }, [initialLog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        type,
        value,
        notes,
        date: logDate ? new Date(logDate).toISOString() : new Date().toISOString()
      };
      if (initialLog) {
        await Storage.updateLog(petId, initialLog.id, payload);
      } else {
        await Storage.addLog(petId, payload);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save log', error);
      alert(t('error_processing'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-fade-in bg-white">
      <h2 className="text-2xl font-bold mb-6 text-slate-900">{initialLog ? t('edit') : t('log_activity')}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('log_date')}</label>
          <button
            type="button"
            onClick={() => setShowDatePicker(true)}
            className="w-full p-4 rounded-2xl bg-white border-2 border-dashed border-slate-200 text-left flex items-center justify-between text-slate-700"
          >
            <span>{new Date(logDate).toLocaleDateString()}</span>
            <Icons.Calendar className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">{t('activity_type')}</label>
          <div className="grid grid-cols-3 gap-3">
            {Object.values(LogType).map(tKey => (
              <button 
                key={tKey}
                type="button"
                onClick={() => setType(tKey)}
                className={`p-3 text-sm font-medium rounded-2xl border transition-all ${
                    type === tKey 
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md transform scale-[1.02]' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t(tKey)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('details_opt')}</label>
          <input className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
            value={value} onChange={e => setValue(e.target.value)} placeholder="e.g., 30 mins, 200g" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('notes')}</label>
          <textarea className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
            value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>{t('cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{t('save_log')}</Button>
        </div>
      </form>

      {showDatePicker && (
        <DatePickerModal
          value={logDate}
          onClose={() => setShowDatePicker(false)}
          onSelect={(iso) => {
            setLogDate(iso);
            setShowDatePicker(false);
          }}
        />
      )}
    </div>
  );
};

const DatePickerModal: React.FC<{
  value: string;
  onClose: () => void;
  onSelect: (isoDate: string) => void;
}> = ({ value, onClose, onSelect }) => {
  const { t } = useLanguage();
  const initialDate = new Date(value);
  const [year, setYear] = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth() + 1);
  const [day, setDay] = useState(initialDate.getDate());

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, idx) => currentYear - idx);
  const months = Array.from({ length: 12 }, (_, idx) => idx + 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, idx) => idx + 1);

  useEffect(() => {
    if (day > daysInMonth) {
      setDay(daysInMonth);
    }
  }, [daysInMonth, day]);

  const confirm = () => {
    const iso = new Date(Date.UTC(year, month - 1, day)).toISOString().split('T')[0];
    onSelect(iso);
  };

  const renderColumn = (items: number[], selected: number, onChange: (val: number) => void, labelFormatter?: (val: number) => string) => (
    <div className="flex-1">
      <div className="text-center text-xs text-slate-400 mb-2">{labelFormatter ? labelFormatter(selected) : selected}</div>
      <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-100">
        {items.map((val) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`w-full py-3 text-sm font-semibold ${selected === val ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {labelFormatter ? labelFormatter(val) : val}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-700">{t('choose_date')}</p>
          <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => {
            const today = new Date();
            setYear(today.getFullYear());
            setMonth(today.getMonth() + 1);
            setDay(today.getDate());
          }}>
            {t('log_date')}
          </button>
        </div>
        <div className="flex gap-4">
          {renderColumn(years, year, setYear)}
          {renderColumn(months, month, setMonth, (val) => val.toString().padStart(2, '0'))}
          {renderColumn(days, day, setDay, (val) => val.toString().padStart(2, '0'))}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={confirm}>{t('save')}</Button>
        </div>
      </div>
    </div>
  );
};

const ExpenseForm: React.FC<{ petId: string; onSave: () => void; onCancel: () => void; initialExpense?: ExpenseEntry | null }> = ({ petId, onSave, onCancel, initialExpense }) => {
  const { t } = useLanguage();
  const [category, setCategory] = useState(initialExpense?.category || 'Food');
  const [amount, setAmount] = useState(initialExpense ? initialExpense.amount.toString() : '');
  const [notes, setNotes] = useState(initialExpense?.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCategory(initialExpense?.category || 'Food');
    setAmount(initialExpense ? initialExpense.amount.toString() : '');
    setNotes(initialExpense?.notes || '');
  }, [initialExpense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        category,
        amount: parseFloat(amount),
        notes,
        date: initialExpense?.date || new Date().toISOString()
      };
      if (initialExpense) {
        await Storage.updateExpense(petId, initialExpense.id, payload);
      } else {
        await Storage.addExpense(petId, payload);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save expense', error);
      alert(t('error_processing'));
    } finally {
      setIsSaving(false);
    }
  };

  const categories = ['Food', 'Vet', 'Toys', 'Grooming', 'Medicine', 'Other'];

  return (
    <div className="p-6 h-full flex flex-col animate-fade-in bg-white">
      <h2 className="text-2xl font-bold mb-6 text-slate-900">{initialExpense ? t('edit') : t('add_expense')}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('category')}</label>
          <div className="relative">
            <select className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white appearance-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
                value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{t(c)}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <Icons.ChevronLeft className="-rotate-90 w-4 h-4" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('amount')}</label>
          <input required type="number" step="0.01" className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none font-mono text-lg" 
            value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('notes')}</label>
          <textarea className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" 
            value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>{t('cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{t('save_expense')}</Button>
        </div>
      </form>
    </div>
  );
};

const MemoForm: React.FC<{ petId: string; onSave: () => void; onCancel: () => void; initialMemo?: MemoEntry | null }> = ({ petId, onSave, onCancel, initialMemo }) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState(initialMemo?.title || '');
  const [notes, setNotes] = useState(initialMemo?.notes || '');
  const [dueDate, setDueDate] = useState(initialMemo?.dueDate ? toLocalYYYYMMDD(initialMemo.dueDate) : '');
  const [done, setDone] = useState(Boolean(initialMemo?.done));
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    setTitle(initialMemo?.title || '');
    setNotes(initialMemo?.notes || '');
    setDueDate(initialMemo?.dueDate ? toLocalYYYYMMDD(initialMemo.dueDate) : '');
    setDone(Boolean(initialMemo?.done));
  }, [initialMemo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim() || t('memo_title'),
        notes,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        done,
        source: initialMemo?.source || 'manual'
      };
      if (initialMemo) {
        await Storage.updateMemo(petId, initialMemo.id, payload);
      } else {
        await Storage.addMemo(petId, payload);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save memo', error);
      alert(t('error_processing'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-fade-in bg-white">
      <h2 className="text-2xl font-bold mb-6 text-slate-900">{initialMemo ? t('edit') : t('add_memo')}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('memo_title')}</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
            placeholder={t('memo_title')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('memo_due')}</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDatePicker(true)}
              className="flex-1 p-4 rounded-2xl bg-white border-2 border-dashed border-slate-200 text-left flex items-center justify-between text-slate-700"
            >
              <span>{dueDate ? new Date(dueDate).toLocaleDateString() : t('choose_date')}</span>
              <Icons.Calendar className="w-4 h-4 text-slate-400" />
            </button>
            {dueDate && (
              <Button variant="ghost" onClick={() => setDueDate('')} type="button" className="px-3">
                {t('delete')}
              </Button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('notes')}</label>
          <textarea
            className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="memo-done"
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="memo-done" className="text-sm font-semibold text-slate-700">
            {done ? t('mark_undone') : t('mark_done')}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>{t('cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{t('save_memo')}</Button>
        </div>
      </form>

      {showDatePicker && (
        <DatePickerModal
          value={dueDate || toLocalYYYYMMDD(new Date())}
          onClose={() => setShowDatePicker(false)}
          onSelect={(iso) => {
            setDueDate(iso);
            setShowDatePicker(false);
          }}
        />
      )}
    </div>
  );
};

// --- Main Views ---

const Dashboard: React.FC<{
  pet: Pet; 
  onBack: () => void;
  onAddLog: () => void;
  onAddExpense: () => void;
  onAddMemo: () => void;
  onEditProfile: () => void;
  onEditLog: (log: LogEntry) => void;
  onEditExpense: (expense: ExpenseEntry) => void;
  onEditMemo: (memo: MemoEntry) => void;
  initialTab: 'overview' | 'logs' | 'expenses' | 'memos' | 'gallery';
}> = ({ pet, onBack, onAddLog, onAddExpense, onAddMemo, onEditProfile, onEditLog, onEditExpense, onEditMemo, initialTab }) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'expenses' | 'memos' | 'gallery'>(initialTab || 'overview');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [memos, setMemos] = useState<MemoEntry[]>([]);
  const [gallery, setGallery] = useState<Photo[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showSmartEntry, setShowSmartEntry] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [chartWeekStart, setChartWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [swipedLogId, setSwipedLogId] = useState<string | null>(null);
  const [swipedExpenseId, setSwipedExpenseId] = useState<string | null>(null);
  const [swipedMemoId, setSwipedMemoId] = useState<string | null>(null);
  const logTouchStartRef = useRef<number | null>(null);
  const expenseTouchStartRef = useRef<number | null>(null);
  const memoTouchStartRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveTab(initialTab || 'overview');
  }, [initialTab]);

  const refreshData = useCallback(async () => {
    try {
      const [logData, expenseData, memoData, petData] = await Promise.all([
        Storage.getLogs(pet.id),
        Storage.getExpenses(pet.id),
        Storage.getMemos(pet.id),
        Storage.getPet(pet.id)
      ]);
      setLogs(logData);
      setExpenses(expenseData);
      setMemos(memoData);
      setGallery(petData.gallery || []);
    } catch (error) {
      console.error('Failed to load pet data', error);
    }
  }, [pet.id]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await GeminiService.analyzePetHealth(pet, logs, expenses, language);
      setAnalysis(result);
    } catch (err) {
      console.error(err);
      setAnalysisError(t('error_processing'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        try {
            const base64 = await compressImage(file);
            const newPhoto = {
                url: base64,
                date: new Date().toISOString()
            };
            await Storage.addPhotoToGallery(pet.id, newPhoto);
            await refreshData();
        } catch (err) {
            console.error("Photo upload failed", err);
        }
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if(window.confirm("Delete this photo?")) {
        await Storage.removePhotoFromGallery(pet.id, photoId);
        await refreshData();
    }
  };

  const closeAllSwipes = () => {
    setSwipedLogId(null);
    setSwipedExpenseId(null);
    setSwipedMemoId(null);
  };

  const toggleLogActions = (logId: string) => {
    setSwipedLogId(prev => (prev === logId ? null : logId));
    setSwipedExpenseId(null);
  };

  const toggleExpenseActions = (expenseId: string) => {
    setSwipedExpenseId(prev => (prev === expenseId ? null : expenseId));
    setSwipedLogId(null);
    setSwipedMemoId(null);
  };

  const toggleMemoActions = (memoId: string) => {
    setSwipedMemoId(prev => (prev === memoId ? null : memoId));
    setSwipedLogId(null);
    setSwipedExpenseId(null);
  };

  const handleLogTouchStart = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    logTouchStartRef.current = e.touches[0].clientX;
  };

  const handleLogTouchEnd = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    if (logTouchStartRef.current === null) return;
    const delta = e.changedTouches[0].clientX - logTouchStartRef.current;
    if (delta < -40) {
      setSwipedLogId(id);
      setSwipedExpenseId(null);
    } else if (delta > 40 && swipedLogId === id) {
      setSwipedLogId(null);
    }
    logTouchStartRef.current = null;
  };

  const handleExpenseTouchStart = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    expenseTouchStartRef.current = e.touches[0].clientX;
  };

  const handleExpenseTouchEnd = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    if (expenseTouchStartRef.current === null) return;
    const delta = e.changedTouches[0].clientX - expenseTouchStartRef.current;
    if (delta < -40) {
      setSwipedExpenseId(id);
      setSwipedLogId(null);
      setSwipedMemoId(null);
    } else if (delta > 40 && swipedExpenseId === id) {
      setSwipedExpenseId(null);
    }
    expenseTouchStartRef.current = null;
  };

  const handleMemoTouchStart = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    memoTouchStartRef.current = e.touches[0].clientX;
  };

  const handleMemoTouchEnd = (e: React.TouchEvent<HTMLDivElement>, id: string) => {
    if (memoTouchStartRef.current === null) return;
    const delta = e.changedTouches[0].clientX - memoTouchStartRef.current;
    if (delta < -40) {
      setSwipedMemoId(id);
      setSwipedExpenseId(null);
      setSwipedLogId(null);
    } else if (delta > 40 && swipedMemoId === id) {
      setSwipedMemoId(null);
    }
    memoTouchStartRef.current = null;
  };

  useEffect(() => {
    closeAllSwipes();
  }, [activeTab]);

  const triggerEditLog = (log: LogEntry) => {
    closeAllSwipes();
    onEditLog(log);
  };

  const triggerEditExpense = (expense: ExpenseEntry) => {
    closeAllSwipes();
    onEditExpense(expense);
  };

  const triggerEditMemo = (memo: MemoEntry) => {
    closeAllSwipes();
    onEditMemo(memo);
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm(`${t('delete')}?`)) return;
    try {
      await Storage.deleteLog(pet.id, logId);
      await refreshData();
    } catch (error) {
      console.error('Failed to delete log', error);
      alert(t('error_processing'));
    } finally {
      closeAllSwipes();
    }
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (!window.confirm(`${t('delete')}?`)) return;
    try {
      await Storage.deleteMemo(pet.id, memoId);
      await refreshData();
    } catch (error) {
      console.error('Failed to delete memo', error);
      alert(t('error_processing'));
    } finally {
      closeAllSwipes();
    }
  };

  const handleToggleMemoDone = async (memo: MemoEntry) => {
    try {
      await Storage.updateMemo(pet.id, memo.id, {
        title: memo.title,
        notes: memo.notes,
        dueDate: memo.dueDate || null,
        done: !memo.done,
        source: memo.source || 'manual'
      });
      await refreshData();
    } catch (error) {
      console.error('Failed to update memo', error);
      alert(t('error_processing'));
    } finally {
      closeAllSwipes();
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!window.confirm(`${t('delete')}?`)) return;
    try {
      await Storage.deleteExpense(pet.id, expenseId);
      await refreshData();
    } catch (error) {
      console.error('Failed to delete expense', error);
      alert(t('error_processing'));
    } finally {
      closeAllSwipes();
    }
  };

  const handlePrevWeek = () => {
    setChartWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setChartWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const isCurrentWeek = useMemo(() => {
      const currentMonday = getStartOfWeek(new Date());
      return chartWeekStart.getTime() === currentMonday.getTime();
  }, [chartWeekStart]);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(chartWeekStart);
      d.setDate(d.getDate() + i);
      const dateKey = toLocalYYYYMMDD(d);
      const count = logs.filter(l => toLocalYYYYMMDD(l.date) === dateKey).length;
      
      data.push({
        day: d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }),
        date: d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }),
        fullDate: d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        count: count,
        isToday: dateKey === toLocalYYYYMMDD(new Date())
      });
    }
    return data;
  }, [logs, chartWeekStart, language]);

  const expenseData = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach(e => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    return Array.from(map.entries()).map(([key, value]) => ({ 
        key, // Keep raw key for color mapping
        name: t(key), 
        value 
    }));
  }, [expenses, language, t]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  return (
    <div className="pb-28 relative min-h-screen bg-[#f8fafc]">
      {/* Transparent Blur Header */}
      <div className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-slate-100/50 transition-all">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
            <Icons.ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-bold text-lg text-slate-800 tracking-tight">{pet.name}</h1>
        </div>
        <div className="flex items-center gap-3">
            <LanguageToggle />
            <button 
            onClick={onEditProfile}
            className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm relative group active:scale-95 transition-transform"
            >
            {pet.photoUrl && <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <Icons.Pencil className="w-4 h-4 text-white drop-shadow-md" />
            </div>
            </button>
        </div>
      </div>

      {/* Floating Tabs */}
      <div className="px-6 py-4 sticky top-[73px] z-10 bg-[#f8fafc]/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 p-1 bg-slate-200/50 rounded-2xl shadow-inner gap-1">
          {['overview', 'logs', 'expenses', 'memos', 'gallery'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all duration-300 ${
                activeTab === tab 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="px-6 min-h-[300px]">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="flex flex-col items-center justify-center py-8 bg-gradient-to-br from-white to-slate-50">
                <span className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">{t('weight')}</span>
                <span className="text-3xl font-bold text-slate-800 tracking-tight">{pet.weight} <span className="text-sm font-medium text-slate-400">kg</span></span>
              </Card>
              <Card className="flex flex-col items-center justify-center py-8 bg-gradient-to-br from-white to-slate-50">
                <span className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">{t('age')}</span>
                <span className="text-2xl font-bold text-slate-800 tracking-tight">{formatPetAge(pet, language)}</span>
              </Card>
            </div>

            {/* AI Analysis Card */}
            <Card className="border-teal-100 bg-gradient-to-br from-teal-50/60 to-emerald-50/50 relative overflow-hidden group">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-teal-200/30 rounded-full blur-3xl group-hover:bg-teal-300/30 transition-all"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white rounded-xl shadow-sm text-teal-600">
                        <Icons.Sparkles className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">{t('health_insights')}</h3>
                    </div>
                    <div className="flex gap-2">
                      {analysis && (
                        <button 
                          onClick={() => setShowChat(true)}
                          className="p-2 bg-white/80 rounded-lg text-teal-700 hover:bg-white shadow-sm transition-all"
                        >
                          <Icons.MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                      <Button 
                          variant="primary" 
                          className="text-xs px-4 py-1.5 h-auto min-h-0 rounded-lg bg-slate-900 shadow-none hover:bg-slate-800" 
                          onClick={handleAnalyze} 
                          disabled={isAnalyzing}
                      >
                      {isAnalyzing ? t('thinking') : t('analyze')}
                      </Button>
                    </div>
                </div>
                
                {isAnalyzing ? (
                    <div className="space-y-3 animate-pulse mt-2">
                    <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-2 bg-slate-200 rounded w-full"></div>
                    <div className="h-2 bg-slate-200 rounded w-5/6"></div>
                    </div>
                ) : analysisError ? (
                    <div className="text-sm text-red-600 bg-red-50/50 p-3 rounded-xl border border-red-100/50">
                    {analysisError}
                    </div>
                ) : analysis ? (
                    <div className="space-y-4 text-sm animate-fade-in">
                    <p className="text-slate-700 leading-relaxed font-medium">{analysis.summary}</p>
                    
                {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
                        <div className="bg-red-50 p-4 rounded-2xl border border-red-100/50">
                        <p className="font-bold text-red-800 mb-2 text-xs uppercase tracking-wider flex items-center gap-1">
                            <Icons.Activity className="w-3 h-3" /> {t('risks')}
                        </p>
                        <ul className="text-red-700 space-y-1.5 pl-1">
                            {analysis.risks.map((risk, i) => <li key={i} className="flex gap-2 items-start"><span className="mt-1.5 w-1 h-1 rounded-full bg-red-400 flex-shrink-0"/>{risk}</li>)}
                        </ul>
                        </div>
                    )}
                    {Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50">
                        <p className="font-bold text-emerald-800 mb-2 text-xs uppercase tracking-wider flex items-center gap-1">
                            <Icons.Dog className="w-3 h-3" /> {t('tips')}
                        </p>
                        <ul className="text-emerald-700 space-y-1.5 pl-1">
                            {analysis.suggestions.map((sug, i) => <li key={i} className="flex gap-2 items-start"><span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0"/>{sug}</li>)}
                        </ul>
                        </div>
                    )}
                    <div className="flex justify-end items-center gap-2 mt-2">
                      <button onClick={() => setShowChat(true)} className="text-xs font-bold text-teal-700 flex items-center gap-1 hover:underline">
                         {t('chat_with_ai')} <Icons.ChevronLeft className="w-3 h-3 rotate-180"/>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right uppercase tracking-widest font-bold mt-1">
                        {t('updated')} {new Date(analysis.lastUpdated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                    </div>
                ) : (
                    <p className="text-slate-500 text-sm">{t('tap_to_analyze', { name: pet.name })}</p>
                )}
              </div>
            </Card>

             {/* Activity Chart */}
             <Card className="overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="font-bold text-slate-700 text-sm tracking-wide uppercase">{t('activity_history')}</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1">
                            {chartData[0].date} - {chartData[6].date}
                        </p>
                    </div>
                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                        <button onClick={handlePrevWeek} className="p-1 hover:bg-white rounded-md text-slate-500 transition-colors"><Icons.ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-xs font-bold text-slate-600 px-2 w-16 text-center">
                            {isCurrentWeek ? t('this_wk') : t('past_wk')}
                        </span>
                        <button onClick={handleNextWeek} disabled={isCurrentWeek} className="p-1 hover:bg-white rounded-md text-slate-500 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"><Icons.ChevronLeft className="w-4 h-4 rotate-180" /></button>
                    </div>
                </div>
                <div className="h-48 w-full -ml-2 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey="day" 
                                tick={{fontSize: 11, fill: '#94a3b8', fontWeight: 500}} 
                                axisLine={false} 
                                tickLine={false} 
                                dy={10} 
                            />
                            <Tooltip 
                                cursor={{fill: '#f1f5f9', radius: 4}} 
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-slate-900 text-white text-xs rounded-xl py-2 px-3 shadow-xl border border-slate-700/50">
                                                <p className="font-bold mb-1 text-slate-200">{data.fullDate}</p>
                                                <p className="font-medium">
                                                    <span className="text-teal-300 text-lg font-bold mr-1">{data.count}</span> 
                                                    {t('activities')}
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar 
                                dataKey="count" 
                                fill="#2dd4bf" 
                                radius={[6, 6, 6, 6]} 
                                barSize={24}
                                activeBar={{ fill: '#0d9488' }}
                            >
                                {
                                    chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.isToday ? '#0d9488' : '#5eead4'} />
                                    ))
                                }
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </Card>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6 animate-slide-up">
            <Button onClick={onAddLog} className="w-full py-4 text-base shadow-lg shadow-slate-200">
              <Icons.Plus className="w-5 h-5" /> {t('log_activity')}
            </Button>
            
            {logs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                <Icons.Activity className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">{t('no_logs')}</p>
              </div>
            ) : (
              <>
                <p className="text-center text-xs text-slate-400">{t('swipe_hint')}</p>
                {logs.map((log, idx) => (
                  <div key={log.id} className="relative overflow-hidden" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div
                      className="absolute inset-y-0 right-3 flex items-center gap-2 z-10 transition-opacity duration-200"
                      style={{ opacity: swipedLogId === log.id ? 1 : 0, pointerEvents: swipedLogId === log.id ? 'auto' : 'none' }}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); triggerEditLog(log); }}
                        className="px-3 py-2 rounded-2xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                        className="px-3 py-2 rounded-2xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600"
                      >
                        {t('delete')}
                      </button>
                    </div>
                    <div
                      className="bg-white p-5 rounded-3xl border border-slate-100 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex gap-4 items-start transition-transform duration-300"
                      style={{ transform: swipedLogId === log.id ? 'translateX(-140px)' : 'translateX(0px)' }}
                      onTouchStart={(e) => handleLogTouchStart(e, log.id)}
                      onTouchEnd={(e) => handleLogTouchEnd(e, log.id)}
                    >
                      <div className={`p-3 rounded-2xl flex-shrink-0 ${
                        log.type === LogType.FEEDING ? 'bg-orange-50 text-orange-500' :
                        log.type === LogType.ACTIVITY ? 'bg-teal-50 text-teal-500' :
                        log.type === LogType.SLEEP ? 'bg-slate-100 text-slate-500' :
                        'bg-rose-50 text-rose-500'
                      }`}>
                        {log.type === LogType.FEEDING ? <Icons.Utensils size={20}/> :
                          log.type === LogType.ACTIVITY ? <Icons.Activity size={20}/> :
                          log.type === LogType.SLEEP ? <Icons.Moon size={20}/> :
                          <Icons.Stethoscope size={20}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <div>
                            <h4 className="font-bold text-slate-800">{t(log.type)}</h4>
                            <span className="text-xs font-medium text-slate-400">{new Date(log.date).toLocaleDateString()}</span>
                          </div>
                          <button
                            type="button"
                            className="p-1 text-slate-300 hover:text-slate-600"
                            onClick={(e) => { e.stopPropagation(); toggleLogActions(log.id); }}
                          >
                            <Icons.MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-slate-700 font-medium text-sm truncate">{log.value}</p>
                        {log.notes && <p className="text-slate-400 text-sm mt-1 line-clamp-2 leading-relaxed">{log.notes}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'expenses' && (
            <div className="space-y-6 animate-slide-up">
                <Button onClick={onAddExpense} className="w-full py-4 text-base bg-white text-slate-900 border border-slate-200 hover:bg-slate-50" variant="secondary">
                 <Icons.DollarSign className="w-5 h-5" /> {t('add_expense')}
                </Button>

                {expenseData.length > 0 && (
                     <Card className="flex justify-center py-6 bg-white">
                        <div className="h-48 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={expenseData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" cornerRadius={6}>
                                        {expenseData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[entry.key] || EXPENSE_COLORS['Other']} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.1)'}} />
                                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-800 text-xl font-bold" style={{ fontSize: '24px' }}>
                                        ${totalExpenses.toFixed(0)}
                                    </text>
                                    <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-xs font-bold uppercase tracking-wider">
                                        {t('total')}
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                )}

                {expenses.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                    <Icons.DollarSign className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400">{t('no_expenses')}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-center text-xs text-slate-400">{t('swipe_hint')}</p>
                    {expenses.map((exp, idx) => (
                      <div key={exp.id} className="relative overflow-hidden" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div
                      className="absolute inset-y-0 right-3 flex items-center gap-2 z-10 transition-opacity duration-200"
                      style={{ opacity: swipedExpenseId === exp.id ? 1 : 0, pointerEvents: swipedExpenseId === exp.id ? 'auto' : 'none' }}
                    >
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); triggerEditExpense(exp); }}
                            className="px-3 py-2 rounded-2xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            {t('edit')}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id); }}
                            className="px-3 py-2 rounded-2xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600"
                          >
                            {t('delete')}
                          </button>
                        </div>
                        <div
                          className="bg-white p-5 rounded-3xl border border-slate-100 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex justify-between items-center transition-transform duration-300"
                          style={{ transform: swipedExpenseId === exp.id ? 'translateX(-140px)' : 'translateX(0px)' }}
                          onTouchStart={(e) => handleExpenseTouchStart(e, exp.id)}
                          onTouchEnd={(e) => handleExpenseTouchEnd(e, exp.id)}
                        >
                          <div className="flex gap-4 items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${EXPENSE_BG_COLORS[exp.category] || EXPENSE_BG_COLORS['Other']}`}>
                              <Icons.DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800">{t(exp.category)}</p>
                              <p className="text-xs text-slate-400">{new Date(exp.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <p className="font-bold text-slate-900 text-lg">-${exp.amount.toFixed(2)}</p>
                              <button
                                type="button"
                                className="p-1 text-slate-300 hover:text-slate-600"
                                onClick={(e) => { e.stopPropagation(); toggleExpenseActions(exp.id); }}
                              >
                                <Icons.MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                            {exp.notes && <p className="text-xs text-slate-400 max-w-[140px] truncate">{exp.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
            </div>
        )}

        {activeTab === 'memos' && (
          <div className="space-y-6 animate-slide-up">
            <Button onClick={onAddMemo} className="w-full py-4 text-base bg-slate-900 text-white shadow-lg shadow-slate-200">
              <Icons.Plus className="w-5 h-5" /> {t('add_memo')}
            </Button>

            {memos.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                <Icons.Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">{t('no_memos')}</p>
              </div>
            ) : (
              <>
                <p className="text-center text-xs text-slate-400">{t('swipe_hint')}</p>
                {memos.map((memo, idx) => {
                  const due = memo.dueDate ? new Date(memo.dueDate) : null;
                  const isOverdue = due ? due.getTime() < Date.now() && !memo.done : false;
                  const statusColor = memo.done ? 'bg-emerald-50 text-emerald-700' : isOverdue ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700';
                  return (
                    <div key={memo.id} className="relative overflow-hidden" style={{ animationDelay: `${idx * 50}ms` }}>
                      <div
                        className="absolute inset-y-0 right-3 flex items-center gap-2 z-10 transition-opacity duration-200"
                        style={{ opacity: swipedMemoId === memo.id ? 1 : 0, pointerEvents: swipedMemoId === memo.id ? 'auto' : 'none' }}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); triggerEditMemo(memo); }}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          {t('edit')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleMemoDone(memo); }}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          {memo.done ? t('mark_undone') : t('mark_done')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteMemo(memo.id); }}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600"
                        >
                          {t('delete')}
                        </button>
                      </div>
                      <div
                        className="bg-white p-5 rounded-3xl border border-slate-100 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex gap-4 items-start transition-transform duration-300"
                        style={{ transform: swipedMemoId === memo.id ? 'translateX(-200px)' : 'translateX(0px)' }}
                        onTouchStart={(e) => handleMemoTouchStart(e, memo.id)}
                        onTouchEnd={(e) => handleMemoTouchEnd(e, memo.id)}
                      >
                        <div className={`p-3 rounded-2xl flex-shrink-0 ${memo.done ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Icons.Calendar className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-800 break-words">{memo.title}</h4>
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                                  {memo.source === 'ai' ? t('memo_source_ai') : t('memo_source_manual')}
                                </span>
                              </div>
                              {memo.notes && <p className="text-slate-500 text-sm leading-relaxed break-words">{memo.notes}</p>}
                            </div>
                            <div className="text-right">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold ${statusColor}`}>
                                {memo.done ? t('mark_done') : isOverdue ? t('overdue') : t('due')}
                              </span>
                              {due && (
                                <p className="text-[11px] text-slate-400 font-medium mt-1">
                                  {due.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {activeTab === 'gallery' && (
            <div className="animate-slide-up py-2">
                <div className="grid grid-cols-3 gap-1">
                    <button 
                        onClick={() => galleryInputRef.current?.click()}
                        className="aspect-square bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                    >
                        <Icons.Camera className="w-8 h-8 mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">{t('add')}</span>
                    </button>
                    <input 
                        ref={galleryInputRef} 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleAddPhoto} 
                    />

                    {gallery.map((photo) => (
                        <div key={photo.id} className="aspect-square relative group overflow-hidden rounded-lg bg-slate-100">
                            <img src={photo.url} alt="Gallery" className="w-full h-full object-cover" />
                            <button 
                                onClick={() => handleDeletePhoto(photo.id)}
                                className="absolute top-1 right-1 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                                <Icons.Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                {gallery.length === 0 && (
                    <div className="mt-10 text-center">
                        <p className="text-slate-400 text-sm">{t('capture_moments', { name: pet.name })}</p>
                    </div>
                )}
            </div>
        )}
      </div>
      
      <button 
        onClick={() => setShowSmartEntry(true)}
        className="fixed bottom-8 right-5 group z-30 flex items-center justify-center"
      >
        <div className="absolute inset-0 rounded-full bg-teal-400 opacity-30 animate-pulse-soft"></div>
        <div className="relative bg-slate-900 text-white px-5 py-4 rounded-full shadow-2xl shadow-teal-500/40 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:bg-slate-800 hover:shadow-teal-500/60">
            <Icons.Sparkles className="w-5 h-5 text-teal-300" />
            <span className="font-semibold text-sm tracking-wide">{t('ai_assist')}</span>
        </div>
      </button>

      {showSmartEntry && (
        <SmartEntryModal 
          petId={pet.id} 
          onClose={() => setShowSmartEntry(false)} 
          onSuccess={() => { refreshData(); }}
        />
      )}

      {showChat && (
        <ChatModal 
            pet={pet}
            logs={logs}
            analysis={analysis}
            onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
};

// --- Main App Controller ---

const PetList: React.FC<{ pets: Pet[]; onSelect: (pet: Pet) => void; onAdd: () => void }> = ({ pets, onSelect, onAdd }) => {
    const { t, language } = useLanguage();
    return (
    <div className="p-6 min-h-screen flex flex-col bg-[#f8fafc]">
        <header className="mt-6 mb-10 px-2 flex justify-between items-start">
            <div>
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-2">{t('app_name')}</h1>
                <p className="text-slate-500 font-medium">{t('welcome')}</p>
            </div>
            <LanguageToggle />
        </header>
        
        <div className="grid gap-5">
        {pets.map((pet, idx) => (
            <div key={pet.id} onClick={() => onSelect(pet)} className="group bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex items-center gap-5 cursor-pointer hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300" style={{animationDelay: `${idx * 100}ms`}}>
            <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden flex-shrink-0 shadow-inner relative">
                {pet.photoUrl ? <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <Icons.Dog className="m-6 text-slate-300"/>}
            </div>
            <div className="flex-1">
                <h3 className="font-bold text-xl text-slate-800 mb-1">{pet.name}</h3>
                <p className="text-slate-500 text-sm font-medium">{t(pet.species)} · {formatPetAge(pet, language)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                <Icons.ChevronLeft className="rotate-180 w-5 h-5" />
            </div>
            </div>
        ))}
        </div>

        <button onClick={onAdd} className="w-full mt-8 py-6 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/50 transition-all flex flex-col items-center justify-center gap-2 group">
            <div className="p-3 bg-slate-50 rounded-full group-hover:bg-white group-hover:shadow-sm transition-all">
                <Icons.Plus className="w-6 h-6" />
            </div>
            <span className="font-semibold text-sm">{t('add_profile')}</span>
        </button>
    </div>
    );
};

const AppContent: React.FC = () => {
  const [view, setView] = useState<'list' | 'detail' | 'create-pet' | 'edit-pet' | 'create-log' | 'create-expense' | 'create-memo' | 'edit-log' | 'edit-expense' | 'edit-memo'>('list');
  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [activeExpense, setActiveExpense] = useState<ExpenseEntry | null>(null);
  const [activeMemo, setActiveMemo] = useState<MemoEntry | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'logs' | 'expenses' | 'memos' | 'gallery'>('overview');

  useEffect(() => {
    let isMounted = true;
    const loadPets = async () => {
      try {
        const data = await Storage.getPets();
        if (!isMounted) return;
        setPets(data);
        if (activePet) {
          const updated = data.find(p => p.id === activePet.id);
          if (updated) {
            setActivePet(updated);
          }
        }
      } catch (error) {
        console.error('Failed to load pets', error);
      }
    };
    loadPets();
    return () => {
      isMounted = false;
    };
  }, [view, activePet?.id]);

  const handlePetSelect = (pet: Pet) => {
    setActivePet(pet);
    setDetailTab('overview');
    setView('detail');
  };

  const handleSave = () => {
    setActiveLog(null);
    setActiveExpense(null);
    setActiveMemo(null);
    setView(activePet ? 'detail' : 'list');
  };

  return (
    <div className="min-h-screen max-w-md mx-auto shadow-2xl shadow-slate-200/50 overflow-hidden bg-[#f8fafc] border-x border-slate-50 sm:my-8 sm:rounded-[40px]">
      {view === 'list' && <PetList pets={pets} onSelect={handlePetSelect} onAdd={() => { setActivePet(null); setView('create-pet'); }} />}
      
      {view === 'create-pet' && <PetForm onSave={() => setView('list')} onCancel={() => setView('list')} />}
      
      {view === 'edit-pet' && activePet && (
        <PetForm 
          initialData={activePet}
          onSave={() => setView('detail')} 
          onCancel={() => setView('detail')} 
        />
      )}

      {view === 'detail' && activePet && (
        <Dashboard 
          pet={activePet} 
          onBack={() => setView('list')} 
          onAddLog={() => { setActiveLog(null); setDetailTab('logs'); setView('create-log'); }}
          onAddExpense={() => { setActiveExpense(null); setDetailTab('expenses'); setView('create-expense'); }}
          onAddMemo={() => { setActiveMemo(null); setDetailTab('memos'); setView('create-memo'); }}
          onEditProfile={() => setView('edit-pet')}
          onEditLog={(log) => { setActiveLog(log); setDetailTab('logs'); setView('edit-log'); }}
          onEditExpense={(expense) => { setActiveExpense(expense); setDetailTab('expenses'); setView('edit-expense'); }}
          onEditMemo={(memo) => { setActiveMemo(memo); setDetailTab('memos'); setView('edit-memo'); }}
          initialTab={detailTab}
        />
      )}

      {view === 'create-log' && activePet && (
        <LogForm petId={activePet.id} onSave={handleSave} onCancel={() => { setActiveLog(null); setView('detail'); }} />
      )}

      {view === 'create-expense' && activePet && (
        <ExpenseForm petId={activePet.id} onSave={handleSave} onCancel={() => { setActiveExpense(null); setView('detail'); }} />
      )}

      {view === 'create-memo' && activePet && (
        <MemoForm petId={activePet.id} onSave={handleSave} onCancel={() => { setActiveMemo(null); setView('detail'); }} />
      )}

      {view === 'edit-log' && activePet && activeLog && (
        <LogForm
          petId={activePet.id}
          initialLog={activeLog}
          onSave={handleSave}
          onCancel={() => { setActiveLog(null); setView('detail'); }}
        />
      )}

      {view === 'edit-expense' && activePet && activeExpense && (
        <ExpenseForm
          petId={activePet.id}
          initialExpense={activeExpense}
          onSave={handleSave}
          onCancel={() => { setActiveExpense(null); setView('detail'); }}
        />
      )}

      {view === 'edit-memo' && activePet && activeMemo && (
        <MemoForm
          petId={activePet.id}
          initialMemo={activeMemo}
          onSave={handleSave}
          onCancel={() => { setActiveMemo(null); setView('detail'); }}
        />
      )}
    </div>
  );
};

export default function App() {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: string, params?: Record<string, string>) => {
    let text = (translations[language] as any)[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      <AppContent />
    </LanguageContext.Provider>
  );
}
