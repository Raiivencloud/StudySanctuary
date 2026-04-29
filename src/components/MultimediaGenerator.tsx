import React, { useState, useEffect, useCallback } from 'react';
import { 
  Globe, 
  Moon as MoonIcon, 
  Sun, 
  Layers, 
  Navigation2, 
  MapPin,
  Search,
  Loader2,
  X,
  Clock,
  CloudSun,
  Sparkles,
  Zap,
  Info,
  AlertCircle
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { identifyLocation, searchLocation } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getUserCredits, consumeCredit } from '../services/userService';
import { UsageLimitModal } from './UsageLimitModal';
import { isTrafficLimitReached } from '../lib/trafficMonitor';

// --- Leaflet Fix for Marker Icons ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom animated marker icon
const animatedIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="w-8 h-8 bg-cyan-500/30 rounded-full flex items-center justify-center animate-pulse border-2 border-cyan-400">
          <div class="w-2 h-2 bg-cyan-400 rounded-full"></div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// --- Map Resize Component ---
const MapResize = () => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map]);
  return null;
};

// --- Map Controller Component ---
const MapController = ({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 1 });
  }, [center, zoom, map]);
  return null;
};

// --- Map Events Component ---
const MapEvents = ({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const MultimediaGenerator: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [mapMode, setMapMode] = useState<'day' | 'night'>('day');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0]);
  const [mapZoom, setMapZoom] = useState(3);
  const [credits, setCredits] = useState(0);
  const [showLimitModal, setShowLimitModal] = useState(false);

  // Load credits on mount
  useEffect(() => {
    if (user) {
      getUserCredits(user.uid).then(data => setCredits(data.credits));
    }
  }, [user]);

  // --- LocalStorage Cache Logic ---
  const getCachedLocation = (key: string) => {
    const cached = localStorage.getItem(`map_cache_${key}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache valid for 24 hours
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    }
    return null;
  };

  const setCachedLocation = (key: string, data: any) => {
    localStorage.setItem(`map_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    // Check credits before calling AI
    const { credits: currentCredits } = await getUserCredits(user.uid);
    if (currentCredits <= 0) {
      setShowLimitModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const result = await searchLocation(user.uid, searchQuery, language);
      if (result) {
        const trafficReached = isTrafficLimitReached();
        setMapCenter([result.lat, result.lon]);
        setMapZoom(10);
        setSelectedLocation({
          ...result,
          image: trafficReached 
            ? "" // Don't load image if traffic limit reached
            : `https://picsum.photos/seed/${result.name.replace(/\s+/g, '')}/400/200`
        });
        // Update credits after successful call
        await consumeCredit(user.uid);
        getUserCredits(user.uid).then(data => setCredits(data.credits));
      } else {
        toast.error('Ubicación no encontrada');
      }
    } catch (error: any) {
      if (error.message === 'INSUFFICIENT_CREDITS') {
        setShowLimitModal(true);
      } else {
        toast.error('Error al buscar');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMapClick = async (lat: number, lon: number) => {
    if (!user) return;

    const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = getCachedLocation(cacheKey);
    
    if (cached) {
      setSelectedLocation(cached);
      setMapCenter([lat, lon]);
      return;
    }

    // Check credits before calling AI
    const { credits: currentCredits } = await getUserCredits(user.uid);
    if (currentCredits <= 0) {
      setShowLimitModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const result = await identifyLocation(user.uid, lat, lon, language);
      if (result) {
        const trafficReached = isTrafficLimitReached();
        const locationData = {
          ...result,
          lat,
          lon,
          image: trafficReached
            ? "" // Don't load image if traffic limit reached
            : `https://picsum.photos/seed/${result.name.replace(/\s+/g, '')}/400/200`
        };
        setSelectedLocation(locationData);
        setCachedLocation(cacheKey, locationData);
        setMapCenter([lat, lon]);
        // Update credits
        await consumeCredit(user.uid);
        getUserCredits(user.uid).then(data => setCredits(data.credits));
      }
    } catch (error: any) {
      if (error.message === 'INSUFFICIENT_CREDITS') {
        setShowLimitModal(true);
      } else if (error.message === 'AI_SUSPENDED_FREE') {
        toast.error('Estamos realizando tareas de mantenimiento en el motor de IA. Regresaremos pronto.', {
          duration: 5000,
          icon: <AlertCircle className="text-red-500" />
        });
      } else {
        console.error("Error identifying location", error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-120px)] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl bg-[#020617]">
      {/* --- Interactive Map --- */}
      <div className="absolute inset-0 z-0 flex w-full h-full">
        <MapContainer 
          center={mapCenter} 
          zoom={3}
          zoomSnap={0.5}
          style={{ 
            height: '100%', 
            width: '100%', 
            background: '#0b0e14'
          }}
          zoomControl={false}
          attributionControl={false}
          worldCopyJump={true}
          maxBounds={[[-90, -180], [90, 180]]}
          minZoom={2.5}
          className={cn("transition-opacity duration-1000", mapMode === 'night' ? 'leaflet-night' : 'leaflet-day')}
        >
          <MapResize />
          <TileLayer
            url={mapMode === 'day' 
              ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              : "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/2012-01-26/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"
            }
            noWrap={true}
            bounds={[[-90, -180], [90, 180]]}
          />
          <MapController center={mapCenter} zoom={mapZoom} />
          <MapEvents onMapClick={handleMapClick} />
          
          {selectedLocation && (
            <Marker position={[selectedLocation.lat, selectedLocation.lon]} icon={animatedIcon}>
              <Popup className="custom-popup">
                <div className="p-0 overflow-hidden rounded-xl bg-slate-900 text-white min-w-[200px]">
                  {selectedLocation.image && (
                    <img 
                      src={selectedLocation.image} 
                      alt={selectedLocation.name}
                      className="w-full h-24 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="p-3">
                    <h3 className="font-bold text-cyan-400 mb-1">{selectedLocation.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-white/70 mb-1">
                      <CloudSun size={12} />
                      <span>{selectedLocation.weather}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/70">
                      <Clock size={12} />
                      <span>{selectedLocation.localTime}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
        {/* Vignette Effect */}
        <div className="absolute inset-0 z-10 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
      </div>

      {/* --- UI Overlays --- */}
      
      {/* Header Controls */}
      <div className="absolute top-6 left-6 right-6 z-20 flex flex-col md:flex-row gap-4 pointer-events-none">
        <div className="flex-1 max-w-md pointer-events-auto">
          <form onSubmit={handleSearch} className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="BUSCAR PAÍS, CIUDAD, MONUMENTO..."
              className="w-full h-14 pl-12 pr-4 bg-[#0b0e14]/80 backdrop-blur-[10px] border border-white/10 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan-400 transition-colors" size={20} />
            <button 
              type="submit"
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-cyan-500 text-white rounded-xl text-xs font-bold hover:bg-cyan-600 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : 'EXPLORADOR'}
            </button>
          </form>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => setMapMode(mapMode === 'day' ? 'night' : 'day')}
            className="h-14 px-6 bg-[#0b0e14]/80 backdrop-blur-[10px] border border-white/10 rounded-2xl text-white flex items-center gap-3 hover:bg-white/5 transition-all group"
          >
            {mapMode === 'day' ? (
              <>
                <Sun size={20} className="text-yellow-400" />
                <span className="text-xs font-bold uppercase tracking-widest">MODO DÍA</span>
              </>
            ) : (
              <>
                <MoonIcon size={20} className="text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-widest">MODO NOCHE</span>
              </>
            )}
          </button>
          
          <div className="h-14 px-6 bg-[#0b0e14]/80 backdrop-blur-[10px] border border-white/10 rounded-2xl text-white flex items-center gap-3">
            <Zap size={20} className={cn(credits > 0 ? "text-amber-400" : "text-red-400")} />
            <span className="text-xs font-bold uppercase tracking-widest">{credits} CRÉDITOS</span>
          </div>
        </div>
      </div>

      {/* Info Card - Floating */}
      <AnimatePresence>
        {selectedLocation && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-24 md:bottom-8 right-6 z-20 w-full max-w-xs pointer-events-auto"
          >
            <div className="bg-[#0b0e14]/80 backdrop-blur-[10px] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="relative h-32">
                {selectedLocation.image ? (
                  <img 
                    src={selectedLocation.image} 
                    alt={selectedLocation.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <Info size={24} className="text-white/20" />
                  </div>
                )}
                <button 
                  onClick={() => setSelectedLocation(null)}
                  className="absolute top-3 right-3 p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-all"
                >
                  <X size={16} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedLocation.name}</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest mb-1">CLIMA</p>
                    <p className="text-sm font-medium text-white">{selectedLocation.weather}</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest mb-1">HORA LOCAL</p>
                    <p className="text-sm font-medium text-white">{selectedLocation.localTime}</p>
                  </div>
                </div>

                <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    <p className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest">DATO CURIOSO</p>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed italic">
                    "{selectedLocation.funFact}"
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls for Mobile */}
      <div className="absolute bottom-6 left-6 z-10 md:hidden pointer-events-auto">
        <button
          onClick={() => {
            setMapCenter([20, 0]);
            setMapZoom(3);
          }}
          className="w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/5 transition-all"
        >
          <Globe size={20} />
        </button>
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
              <p className="text-cyan-400 font-bold text-xs uppercase tracking-[0.3em]">ANALIZANDO...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UsageLimitModal isOpen={showLimitModal} onClose={() => setShowLimitModal(false)} />

      <style>{`
        .custom-popup .leaflet-popup-content-wrapper {
          background: transparent;
          padding: 0;
          box-shadow: none;
        }
        .custom-popup .leaflet-popup-content {
          margin: 0;
        }
        .custom-popup .leaflet-popup-tip {
          background: #0f172a;
        }
        .leaflet-container {
          font-family: inherit;
          margin: 0;
          padding: 0;
          transition: opacity 1s ease-in-out;
        }
        .leaflet-tile-pane {
          transition: opacity 1s ease-in-out;
        }
        .leaflet-container * {
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  );
};
