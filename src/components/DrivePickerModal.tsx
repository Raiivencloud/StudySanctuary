import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Download, Loader2, ExternalLink, Upload, Plus, BrainCircuit } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string;
  webViewLink: string;
  size?: string;
}

interface DrivePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect?: (file: { name: string, data?: string, text?: string, mimeType: string }) => void;
}

export const DrivePickerModal: React.FC<DrivePickerModalProps> = ({ isOpen, onClose, onFileSelect }) => {
  const { googleAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'drive' | 'local'>('drive');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    if (activeTab !== 'drive') return;
    setIsLoading(true);
    try {
      // First try to sync token if we have it in context but not in session
      if (googleAccessToken) {
        await fetch('/api/auth/google/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: googleAccessToken })
        });
      }

      const response = await fetch('/api/drive/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files);
        setIsConnected(true);
      } else if (response.status === 401) {
        setIsConnected(false);
      } else {
        toast.error('Error', { description: 'No se encontraron archivos en Drive' });
      }
    } catch (error) {
      console.error('Drive fetch error:', error);
      toast.error('Error', { description: 'Could not connect to Google Drive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Éxito', { description: 'Archivo subido correctamente a Google Drive' });
        fetchFiles();
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error', { description: 'No se pudo subir el archivo' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      if (onFileSelect) {
        onFileSelect({
          name: file.name,
          data: base64,
          mimeType: file.type
        });
      }
      onClose();
      toast.success('Archivo seleccionado', { 
        description: `${file.name} listo para procesar en Herramientas IA`,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      if (!url) {
        toast.error('Configuración incompleta', { 
          description: 'Las credenciales de Google no están configuradas en el servidor.' 
        });
        return;
      }
      
      const authWindow = window.open(url, 'google_drive_auth', 'width=600,height=700');
      
      if (!authWindow) {
        toast.error('Error', { description: 'Please allow popups to connect to Google Drive' });
        return;
      }
    } catch (error) {
      console.error('Auth URL error:', error);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'drive') {
      fetchFiles();
    }

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'google') {
        fetchFiles();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, activeTab]);

  const handleSelect = async (file: DriveFile) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/drive/download/${file.id}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        if (onFileSelect) {
          onFileSelect({
            name: file.name,
            data: base64,
            mimeType: file.mimeType
          });
        }
        onClose();
      };
      
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Select error:', error);
      toast.error('Error', { description: 'No se pudo descargar el archivo para procesar' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (fileId: string, fileName: string) => {
    window.open(`/api/drive/download/${fileId}`, '_blank');
    toast.success('Download started', { description: `Downloading ${fileName}` });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-[95%] max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Upload size={24} />
            </div>
            <h3 className="text-xl font-bold font-headline">Subir</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-2 hover:bg-surface-container-low rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex px-6 border-b border-outline-variant/10">
          <button 
            onClick={() => setActiveTab('drive')}
            className={cn(
              "px-6 py-3 text-sm font-bold transition-all border-b-2",
              activeTab === 'drive' ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            Google Drive
          </button>
          <button 
            onClick={() => setActiveTab('local')}
            className={cn(
              "px-6 py-3 text-sm font-bold transition-all border-b-2",
              activeTab === 'local' ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            Subida Directa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'drive' ? (
            <>
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center text-on-surface-variant/30">
                    <img src="https://www.google.com/favicon.ico" className="w-10 h-10 grayscale opacity-50" alt="Google" />
                  </div>
                  <div className="space-y-2 max-w-xs">
                    <h4 className="font-bold text-on-surface">Conectar Google Drive</h4>
                    <p className="text-sm text-on-surface-variant">Conecta tu cuenta para acceder a tus materiales de estudio directamente.</p>
                  </div>
                  <button 
                    onClick={handleConnect}
                    className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-4 h-4 brightness-0 invert" alt="Google" />
                    {isConnected ? 'Reconectar' : 'Conectar'}
                  </button>
                </div>
              ) : isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 size={40} className="animate-spin text-primary opacity-40" />
                  <p className="text-sm font-medium text-on-surface-variant">Cargando archivos de Drive...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <p className="text-on-surface-variant">No se encontraron archivos en Drive</p>
                  <button onClick={fetchFiles} className="text-primary font-bold text-sm hover:underline">Actualizar</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex justify-end mb-2">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Subir a Drive
                    </button>
                  </div>
                  {files.map(file => (
                    <div key={file.name} className="group flex items-center gap-4 p-4 rounded-xl border border-outline-variant/10 hover:bg-surface-container-low transition-all">
                      <div className="p-2 bg-card rounded-lg shadow-sm">
                        <img src={file.iconLink} className="w-6 h-6" alt="icon" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-bold text-on-surface truncate">{file.name}</h5>
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-0.5">
                          {file.mimeType.split('.').pop()?.toUpperCase() || 'FILE'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleSelect(file)}
                          className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/90 transition-all"
                        >
                          Seleccionar
                        </button>
                        <a 
                          href={file.webViewLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                          title="Ver en Drive"
                        >
                          <ExternalLink size={18} />
                        </a>
                        <button 
                          onClick={() => handleDownload(file.id, file.name)}
                          className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                          title="Descargar"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-8">
              <div className="w-24 h-24 bg-primary/5 rounded-3xl flex items-center justify-center text-primary relative">
                <FileText size={48} />
                <div className="absolute -right-2 -bottom-2 bg-secondary text-white p-2 rounded-xl shadow-lg">
                  <Plus size={20} />
                </div>
              </div>
              <div className="space-y-2 max-w-sm">
                <h4 className="font-bold text-xl text-on-surface">Subida Directa</h4>
                <p className="text-sm text-on-surface-variant">Sube tus programas de estudio o materiales directamente para procesarlos con IA sin usar Google Drive.</p>
              </div>
              
              <div className="w-full max-w-md p-8 border-2 border-dashed border-outline-variant rounded-3xl flex flex-col items-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group" onClick={() => localFileInputRef.current?.click()}>
                <input 
                  type="file" 
                  ref={localFileInputRef} 
                  onChange={handleLocalFileUpload} 
                  accept=".pdf,.txt,.docx"
                  className="hidden" 
                />
                <div className="p-4 bg-primary/10 rounded-2xl text-primary group-hover:scale-110 transition-transform">
                  <Upload size={32} />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-on-surface">Seleccionar archivo local</p>
                  <p className="text-xs text-on-surface-variant">PDF, TXT o Word (.docx)</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low px-4 py-2 rounded-full">
                <BrainCircuit size={14} className="text-primary" />
                <span>Procesado instantáneo con Gemini AI</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-surface-container-low border-t border-outline-variant/10 flex justify-between items-center">
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
            {activeTab === 'drive' ? 'Google Drive API Integration' : 'Direct AI Processing'}
          </p>
          <button 
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
