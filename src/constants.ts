export const VERSION = '1.0.1'; // Increment this to force cache clear

export const SUBSCRIPTION_PLANS = {
  PRUEBA: {
    id: 'prueba',
    name: '7 DÍAS GRATIS',
    price: 0,
    credits: 15,
    description: '15 Créditos de IA de prueba'
  },
  MENSUAL: {
    id: 'mensual',
    name: 'Plan Mensual',
    price: 1200,
    credits: 300,
    description: '300 Créditos: Suficiente para resumir toda tu cursada'
  },
  TRIMESTRAL: {
    id: 'trimestral',
    name: 'Plan Trimestral',
    price: 4200,
    oldPrice: 7000,
    credits: 1000,
    description: '1.000 Créditos de IA ($2.800 de ahorro)'
  },
  ANUAL: {
    id: 'anual',
    name: 'Plan Anual',
    price: 12000,
    oldPrice: 18000,
    credits: 5000,
    description: '5.000 Créditos de IA ($6.000 de ahorro)'
  }
};

export const ARENA_BASE_CARDS = [
  { name: 'El Arquitecto', rarity: 'Fuego', description: 'Maestro de la estructura y el diseño.' },
  { name: 'Cerebro de Oro', rarity: 'Oro', description: 'Inteligencia pura y brillante.' },
  { name: 'La Tabla Prohibida', rarity: 'Plata', description: 'Conocimiento que no debería existir.' },
  { name: 'El Guardián del Código', rarity: 'Bronce', description: 'Protector de las líneas sagradas.' },
  { name: 'Lógica Infinita', rarity: 'Oro', description: 'Un bucle de razonamiento perfecto.' },
  { name: 'El Alquimista de Datos', rarity: 'Plata', description: 'Transforma bits en oro.' },
  { name: 'Sombra del Servidor', rarity: 'Bronce', description: 'Acecha en los tiempos de respuesta.' },
  { name: 'Fuego de la Creatividad', rarity: 'Fuego', description: 'Inspiración que quema todo a su paso.' },
  { name: 'El Oráculo Binario', rarity: 'Oro', description: 'Ve el futuro en ceros y unos.' },
  { name: 'Escudo de Firewall', rarity: 'Bronce', description: 'Defensa impenetrable.' },
  { name: 'El Viajero del Tiempo', rarity: 'Plata', description: 'Domina el historial de versiones.' },
  { name: 'Núcleo de Energía', rarity: 'Oro', description: 'Poder ilimitado para procesar.' },
  { name: 'El Hacker Ético', rarity: 'Plata', description: 'Encuentra la luz en la oscuridad.' },
  { name: 'Memoria de Cristal', rarity: 'Bronce', description: 'Recuerda cada detalle.' },
  { name: 'Tormenta de Ideas', rarity: 'Fuego', description: 'Un caos creativo imparable.' },
  { name: 'El Arquitecto de Nubes', rarity: 'Oro', description: 'Construye en lo más alto.' },
  { name: 'Luz de la Verdad', rarity: 'Plata', description: 'Revela lo oculto.' },
  { name: 'El Forjador de Sueños', rarity: 'Bronce', description: 'Crea realidades desde la nada.' },
  { name: 'Corazón de Silicio', rarity: 'Oro', description: 'Latido constante de la máquina.' },
  { name: 'El Maestro de la Arena', rarity: 'Fuego', description: 'Dominio total del santuario.' }
];
