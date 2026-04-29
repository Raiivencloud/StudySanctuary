import React, { useState } from 'react';
import { FileText, Upload, Trash2, Search, File as FileIcon, FileImage, FileVideo, Music, Download, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCourses } from '../contexts/CourseContext';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export const FilesView: React.FC = () => {
  const { userFiles, addGeneralFile, removeGeneralFile } = useCourses();
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState<'all' | 'document' | 'image' | 'video' | 'audio'>('all');

  const filteredFiles = userFiles.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || file.type.includes(filter);
    return matchesSearch && matchesFilter;
  });

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Max resolution to stay under 1MB easily
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1080;

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

          // Initial quality
          let quality = 0.8;
          const getBlob = (q: number): Promise<Blob | null> => 
            new Promise(res => canvas.toBlob(res, 'image/jpeg', q));

          const tryCompress = async (q: number): Promise<File> => {
            const blob = await getBlob(q);
            if (!blob) throw new Error('Compression failed');
            
            // If still > 1MB and quality > 0.1, try again with lower quality
            if (blob.size > 1024 * 1024 && q > 0.1) {
              return tryCompress(q - 0.1);
            }
            
            return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
          };

          tryCompress(quality).then(resolve).catch(reject);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        let fileToUpload = files[i];
        
        // Compress if it's an image
        if (fileToUpload.type.startsWith('image/')) {
          try {
            fileToUpload = await compressImage(fileToUpload);
          } catch (err) {
            console.error('Compression error:', err);
            // Fallback to original if compression fails
          }
        }

        await addGeneralFile(fileToUpload, (progress) => {
          setUploadProgress(Math.round(progress));
        });
      }
      toast.success(language === 'es' ? 'Archivos subidos correctamente' : 'Files uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(language === 'es' ? 'Error al subir archivos' : 'Error uploading files');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (e.target) e.target.value = '';
    }
  };

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <FileImage className="text-blue-500" />;
    if (type.includes('video')) return <FileVideo className="text-purple-500" />;
    if (type.includes('audio')) return <Music className="text-green-500" />;
    if (type.includes('pdf') || type.includes('word') || type.includes('text')) return <FileText className="text-orange-500" />;
    return <FileIcon className="text-gray-500" />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '---';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="responsive-container space-y-8">
      {/* Header & Upload */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tight">
            {language === 'es' ? 'Mis Archivos' : 'My Files'}
          </h1>
          <p className="text-on-surface-variant font-medium opacity-70">
            {language === 'es' ? 'Gestiona tus documentos y archivos persistentes' : 'Manage your persistent documents and files'}
          </p>
        </div>
        
        <label className={cn(
          "flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20",
          isUploading && "opacity-50 cursor-wait"
        )}>
          {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
          Subir material de estudio
          <input 
            type="file" 
            multiple 
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            className="hidden" 
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </label>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={20} />
          <input
            type="text"
            placeholder={language === 'es' ? "Buscar archivos..." : "Search files..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {(['all', 'document', 'image', 'video', 'audio'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
                filter === f 
                  ? "bg-primary text-white" 
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Files Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredFiles.map((file) => (
            <motion.div
              key={file.name}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group bg-card border border-outline-variant/10 rounded-3xl p-4 hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <div className="aspect-square bg-surface-container-low rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden">
                {file.type.includes('image') ? (
                  <img 
                    src={file.url} 
                    alt={file.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="scale-150">
                    {getFileIcon(file.type)}
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <a 
                    href={file.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform"
                  >
                    <Download size={18} />
                  </a>
                  <button 
                    onClick={() => removeGeneralFile(file.id)}
                    className="p-2 bg-error text-white rounded-full hover:scale-110 transition-transform"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="font-bold text-sm truncate text-on-surface" title={file.name}>
                  {file.name}
                </h3>
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
                  <span>{file.type.split('/')[1] || 'FILE'}</span>
                  <span>{formatSize(file.size)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredFiles.length === 0 && !isUploading && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-on-surface-variant/40 space-y-4">
            <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center">
              <FileText size={40} />
            </div>
            <p className="font-bold">
              {language === 'es' ? 'No se encontraron archivos' : 'No files found'}
            </p>
          </div>
        )}

        {isUploading && (
          <div className="bg-surface-container-low border-2 border-dashed border-primary/20 rounded-3xl p-4 flex flex-col items-center justify-center space-y-3 animate-pulse">
            <div className="relative flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={48} />
              <span className="absolute text-[10px] font-bold text-primary">{uploadProgress}%</span>
            </div>
            <div className="w-full max-w-[150px] h-1 bg-primary/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-primary">
              {language === 'es' ? `Subiendo... ${uploadProgress}%` : `Uploading... ${uploadProgress}%`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
