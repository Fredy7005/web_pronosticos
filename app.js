// ===================== CONFIGURACIÓN DE FIREBASE =====================

const firebaseConfig = {
  apiKey: "AIzaSyCqDo0GzIzXT-E3VPAkJVGg6wHiBBFb-Ac",
  authDomain: "sportpredicts.firebaseapp.com",
  projectId: "sportpredicts",
  storageBucket: "sportpredicts.firebasestorage.app",
  messagingSenderId: "147554075482",
  appId: "1:147554075482:web:2b2827b8699b8c37b0e963",
  measurementId: "G-CL8NTKKTNP"
};

// Inicializar Firebase de forma segura (evita errores si se carga dos veces)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// ===================== CONFIGURACIÓN GENERAL =====================

const UMBRAL_VALOR = 0.02;
const MAX_PARTIDOS = 15;

// Catálogo oficial de las 23 competiciones para títulos e iconos
const INFO_LIGAS = {
  'PD':  { nombre: 'La Liga', icono: '🇪🇸' },
  'SD':  { nombre: 'Segunda División', icono: '🇪🇸' },
  'PL':  { nombre: 'Premier League', icono: '🇬🇧' },
  'CL':  { nombre: 'Champions League', icono: '⭐' },
  'SA':  { nombre: 'Serie A', icono: '🇮🇹' },
  'BL':  { nombre: 'Bundesliga', icono: '🇩🇪' },
  'L1':  { nombre: 'Ligue 1', icono: '🇫🇷' },
  'EL':  { nombre: 'Europa League', icono: '🇪🇺' },
  'ECL': { nombre: 'Conference League', icono: '🇪🇺' },
  'ED':  { nombre: 'Eredivisie', icono: '🇳🇱' },
  'PPL': { nombre: 'Primeira Liga', icono: '🇵🇹' },
  'ELC': { nombre: 'Championship', icono: '🇬🇧' },
  'MLS': { nombre: 'MLS', icono: '🇺🇸' },
  'BR':  { nombre: 'Brasileirão', icono: '🇧🇷' },
  'MX':  { nombre: 'Liga MX', icono: '🇲🇽' },
  'ARG': { nombre: 'Liga Profesional Argentina', icono: '🇦🇷' },
  'BEL': { nombre: 'Jupiler Pro League', icono: '🇧🇪' },
  'TUR': { nombre: 'Süper Lig', icono: '🇹🇷' },
  'COL': { nombre: 'Copa Libertadores', icono: '🏆' },
  'URU': { nombre: 'Primera División Chile', icono: '🇨🇱' },
  'JPN': { nombre: 'J1 League', icono: '🇯🇵' },
  'KOR': { nombre: 'K League 1', icono: '🇰🇷' },
  'AUS': { nombre: 'A-League', icono: '🇦🇺' }
};

// ===================== ESCUDOS MANUALES =====================

const ESCUDOS_MANUALES = {
  'alaves': './Logos Equipos/La Liga/alaves.png',
  'athletic bilbao': './Logos Equipos/La Liga/athletic_club.png',
  'athletic club': './Logos Equipos/La Liga/athletic_club.png',
  'atletico madrid': './Logos Equipos/La Liga/atleti.png',
  'barcelona': './Logos Equipos/La Liga/barcelona.png',
  'real betis': './Logos Equipos/La Liga/betis.png',
  'celta de vigo': './Logos Equipos/La Liga/celta.png',
  'celta vigo': './Logos Equipos/La Liga/celta.png',
  'deportivo de la coruna': './Logos Equipos/La Liga/deportivo.png',
  'elche': './Logos Equipos/La Liga/elche.png',
  'espanyol': './Logos Equipos/La Liga/espanyol.png',
  'getafe': './Logos Equipos/La Liga/getafe.png',
  'levante': './Logos Equipos/La Liga/levante.png',
  'malaga': './Logos Equipos/La Liga/malaga.png',
  'osasuna': './Logos Equipos/La Liga/osasuna.png',
  'racing de santander': './Logos Equipos/La Liga/racing_santander.png',
  'rayo vallecano': './Logos Equipos/La Liga/Rayo_vallecano.png',
  'real madrid': './Logos Equipos/La Liga/real_madrid.png',
  'real sociedad': './Logos Equipos/La Liga/real_sociedad.png',
  'sevilla': './Logos Equipos/La Liga/sevilla.png',
  'valencia': './Logos Equipos/La Liga/valencia.png',
  'villarreal': './Logos Equipos/La Liga/villareal.png'
};

// ===================== ESTADO =====================

let ligaActual = 'PD';
let soloValor = false;
let ordenActual = 'fecha';
let modoHistorial = false;
let partidosAnalizados = [];
let dbEstatica = null;
let cargaId = 0;

// ===================== UTILIDADES =====================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const FECHA = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});
const media = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;

function buscarEscudo(nombre) {
  if (!nombre) return 'https://cdn-icons-png.flaticon.com/512/53/53283.png';
  const nombreLimpio = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  for (const [equipo, ruta] of Object.entries(ESCUDOS_MANUALES)) {
    if (nombreLimpio.includes(equipo) && ruta.trim() !== '') {
      return encodeURI(ruta);
    }
  }
  return 'https://cdn-icons-png.flaticon.com/512/53/53283.png';
}

// ===================== CAPA DE DATOS (100% LOCAL Y SEGURA) =====================

async function cargarArchivoEstatico() {
  if (dbEstatica) return dbEstatica;

  // 1. Intentar leer datos-ligas.json (estructura por ligas)
  try {
    const res = await fetch(`datos-ligas.json?t=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      if (json && (json.ligas || Array.isArray(json))) {
        dbEstatica = json;
        return dbEstatica;
      }
    }
  } catch (e) {
    console.warn('datos-ligas.json no disponible, probando partidos.json...');
  }

  // 2. Respaldo: intentar leer partidos.json si existe
  try {
    const resAlt = await fetch(`partidos.json?t=${Date.now()}`);
    if (resAlt.ok) {
      const jsonAlt = await resAlt.json();
      dbEstatica = jsonAlt;
      return dbEstatica;
    }
  } catch (e) {
    console.warn('No se encontraron archivos JSON locales.');
  }

  return null;
}

async function obtenerDatosLiga(codigoLiga) {
  const estatico = await cargarArchivoEstatico();
  if (!estatico) {
    return { partidos: [], restantes: null, origen: 'sin_jornada' };
  }

  // Si viene estructurado por ligas (datos-ligas.json)
  if (estatico.ligas && Array.isArray(estatico.ligas[codigoLiga])) {
    return {
      partidos: estatico.ligas[codigoLiga],
      restantes: estatico.restantes ?? null,
      origen: 'robot'
    };
  }

  // Si viene como array plano (partidos.json)
  if (Array.isArray(estatico)) {
    return {
      partidos: estatico,
      restantes: null,
      origen: 'robot'
    };
  }

  return { partidos: [], restantes: null, origen: 'sin_jornada' };
}

// Obtener todos los partidos de todas las ligas para la Calculadora
async function AlimentarCalculadoraSiExiste() {
  if (typeof renderizarPartidosCalculadora !== 'function') return;

  const estatico = await cargarArchivoEstatico();
  let todos = [];

  if (estatico && estatico.ligas) {
    for (const [cod, lista] of Object.entries(estatico.ligas)) {
      if (Array.isArray(lista)) {
        const nombreLiga = INFO_LIGAS[cod]?.nombre || cod;
        lista.forEach((p, idx) => {
          const analizado = analizarPartido(p, idx);
          if (analizado) {
            todos.push({
              local: analizado.local,
              visitante: analizado.visitante,
              liga: nombreLiga,
              hora: FECHA.format(analizado.fecha),
              cuota1: analizado.cuotasOriginales.local.toFixed(2),
              cuotaX: analizado.cuotasOriginales.empate.toFixed(2),
              cuota2: analizado.cuotasOriginales.visitante.toFixed(2),
              prob1: analizado.justa.local,
              probX: analizado.justa.empate,
              prob2: analizado.justa.visitante
            });
          }
        });
      }
    }
  } else if (Array.isArray(estatico)) {
    todos = estatico;
  }

  renderizarPartidosCalculadora(todos.slice(0, 30));
}

// ===================== MOTOR DE ANÁLISIS =====================

function analizarPartido(partido, index) {
  const claves = ['local', 'empate', 'visitante'];
  let cuotasSeleccionadas = null;
  let nombreCasa = partido.casa || 'Bet365';

  const localNombre = partido.home_team || partido.local || 'Equipo Local';
  const visitanteNombre = partido.away_team || partido.visitante || 'Equipo Visitante';

  if (partido.cuotas && Number.isFinite(partido.cuotas.local)) {
    cuotasSeleccionadas = partido.cuotas;
  } else if (partido.bookmakers && partido.bookmakers.length > 0) {
    const bet365Book = partido.bookmakers.find(b => (b.title || '').toLowerCase() === 'bet365');
    const casas = bet365Book ? [bet365Book, ...partido.bookmakers] : partido.bookmakers;

    for (const casa of casas) {
      const mercado = (casa.markets || []).find(m => m.key === 'h2h');
      if (mercado && Array.isArray(mercado.outcomes)) {
        const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price;
        const q = {
          local: precio(localNombre),
          empate: precio('Draw'),
          visitante: precio(visitanteNombre)
        };
        if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) {
          cuotasSeleccionadas = q;
          nombreCasa = casa.title || 'Bet365';
          break;
        }
      }
    }
  }

  if (!cuotasSeleccionadas && (partido.cuota1 || partido.cuotaX || partido.cuota2)) {
    cuotasSeleccionadas = {
      local: parseFloat(partido.cuota1) || 1.85,
      empate: parseFloat(partido.cuotaX) || 3.40,
      visitante: parseFloat(partido.cuota2) || 4.10
    };
  }

  if (!cuotasSeleccionadas) return null;

  const inversas = claves.map(k => 1 / cuotasSeleccionadas[k]);
  const suma = inversas.reduce((a, b) => a + b, 0);
  const justa = {};
  claves.forEach((k, i) => { justa[k] = inversas[i] / suma; });

  const mejor = {
    local: { cuota: cuotasSeleccionadas.local, casa: nombreCasa },
    empate: { cuota: cuotasSeleccionadas.empate, casa: nombreCasa },
    visitante: { cuota: cuotasSeleccionadas.visitante, casa: nombreCasa }
  };

  const ventaja = {};
  claves.forEach((k) => { ventaja[k] = mejor[k].cuota * justa[k] - 1; });
  const claveValor = claves.reduce((a, b) => (ventaja[b] > ventaja[a] ? b : a));

  const valor = ventaja[claveValor] >= UMBRAL_VALOR
    ? { clave: claveValor, cuota: mejor[claveValor].cuota, casa: nombreCasa }
    : null;

  const orden = [...claves].sort((a, b) => justa[b] - justa[a]);
  const probable = { clave: orden[0], prob: justa[orden[0]] };

  let etiquetaConfianza = "Partido muy igualado";
  if (probable.prob >= 0.60) etiquetaConfianza = "Favorito muy claro";
  else if (probable.prob >= 0.48) etiquetaConfianza = "Leve favorito";

  const probOver25 = probabilidadGeneral(partido, 'totals', 'Over', 2.5);
  const probOver15 = probabilidadGeneral(partido, 'totals', 'Over', 1.5);
  let tendenciaGoles = partido.tendenciaGoles || "Más de 1.5 Goles (Alta seguridad)";
  if (probOver25 !== null && probOver25 >= 0.55) {
    tendenciaGoles = `Más de 2.5 Goles (${Math.round(probOver25 * 100)}% prob.)`;
  } else if (probOver15 !== null && probOver15 < 0.60) {
    tendenciaGoles = "Menos de 2.5 Goles (Partido táctico)";
  }

  const probBttsYes = probabilidadGeneral(partido, 'btts', 'Yes');
  let ambosMarcanTexto = partido.ambosMarcanTexto || "No concluyente";
  if (probBttsYes !== null) {
    ambosMarcanTexto = probBttsYes >= 0.52 ? `SÍ - Ambos Marcan (${Math.round(probBttsYes * 100)}%)` : "NO - Difícil que anoten ambos";
  } else if (!partido.ambosMarcanTexto) {
    ambosMarcanTexto = (probable.prob < 0.50) ? "SÍ (Alta probabilidad ofensiva)" : "NO (Partido cerrado)";
  }

  const tendenciaCorners = partido.tendenciaCorners || (probable.prob > 0.55 ? "Más de 8.5 Córners (Ritmo alto)" : "Más de 9.5 Córners (Partido abierto)");
  const fechaPartido = new Date(partido.commence_time || partido.fecha || Date.now() + 3600000);

  return {
    id: index,
    local: localNombre,
    visitante: visitanteNombre,
    fecha: isNaN(fechaPartido.getTime()) ? new Date(Date.now() + 3600000) : fechaPartido,
    valor,
    probable,
    justa,
    cuotasOriginales: cuotasSeleccionadas,
    etiquetaConfianza,
    mejorCuota: mejor[valor ? valor.clave : probable.clave],
    resultadoSugerido: valor ? valor.clave : probable.clave,
    esOportunidadTop: !!valor,
    probabilidadAcierto: probable.prob,
    tendenciaGoles,
    ambosMarcanTexto,
    tendenciaCorners
  };
}

function probabilidadGeneral(partido, tipoMercado, nombreSalida, punto = null) {
  const probs = [];
  for (const casa of partido.bookmakers || []) {
    const mercado = (casa.markets || []).find((m) => m.key === tipoMercado);
    if (!mercado || !Array.isArray(mercado.outcomes)) continue;
    const itemPrincipal = mercado.outcomes.find((o) => o.name === nombreSalida && (punto === null || o.point === punto));
    if (itemPrincipal && itemPrincipal.price > 1) {
      probs.push(1 / itemPrincipal.price);
    }
  }
  return probs.length ? media(probs) : null;
}

// ===================== RENDERIZADO =====================

function actualizarEncabezadoLiga(codigoLiga) {
  const info = INFO_LIGAS[codigoLiga] || { nombre: 'Competición Oficial', icono: '⚽' };
  const tituloEl = document.getElementById('liga-titulo');
  const iconoEl = document.getElementById('liga-icono');
  if (tituloEl)
