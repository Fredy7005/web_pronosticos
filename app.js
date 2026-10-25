// ===================== CONFIGURACIÓN =====================

const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27';

const LIGAS_ODDS = {
  'PD': 'soccer_spain_la_liga',
  'PL': 'soccer_epl',
  'CL': 'soccer_uefa_champs_league',
  'SA': 'soccer_italy_serie_a',
  'BL': 'soccer_germany_bundesliga',
  'L1': 'soccer_france_ligue_one',
  'EL': 'soccer_uefa_europa_league',
  'ECL': 'soccer_uefa_europa_conference_league',
  'ED': 'soccer_netherlands_eredivisie',
  'PPL': 'soccer_portugal_primeira_liga',
  'ELC': 'soccer_efl_champ',
  'MLS': 'soccer_usa_mls',
  'BR': 'soccer_brazil_campeonato',
  'MX': 'soccer_mexico_ligamx',              // Liga MX (México)
  'ARG': 'soccer_argentina_primera_division'  // Liga Profesional (Argentina)
};

const UMBRAL_VALOR = 0.02;
const MAX_PARTIDOS = 12;
const TTL_CUOTAS_MIN = 15;

// ===================== 🟢 TUS ESCUDOS MANUALES 🟢 =====================

const ESCUDOS_MANUALES = {
  // === LA LIGA EA SPORTS ===
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
  'villarreal': './Logos Equipos/La Liga/villareal.png',

  // === OTRAS LIGAS ===
  'arsenal': '',
  'manchester city': '',
  'liverpool': '',
  'chelsea': '',
  'manchester united': '',
  'tottenham': '',
  'newcastle': '',
  'aston villa': '',
  'brighton': '',
  'everton': '',
  'crystal palace': '',
  'brentford': '',
  'nottingham forest': '',
  'bournemouth': '',
  'fulham': '',
  'leeds united': '',
  'ipswich town': '',
  'sunderland': '',
  'hull city': '',
  'coventry city': '',
  'bayern munich': '',
  'borussia dortmund': '',
  'bayer leverkusen': '',
  'psg': '',
  'paris saint germain': '',
  'juventus': '',
  'inter': '',
  'ac milan': '',
  'napoli': '',
  'benfica': '',
  'sporting cp': '',
  'porto': ''
};

// ===================== ESTADO =====================

let ligaActual = 'PD';
let soloValor = false;
let ordenActual = 'fecha';
let partidosAnalizados = [];
let metaCarga = null;
let cargaId = 0;

// ===================== UTILIDADES =====================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const FECHA = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});
const media = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

function buscarEscudo(nombre) {
  if (!nombre) return '';
  const nombreLimpio = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  for (const [equipo, ruta] of Object.entries(ESCUDOS_MANUALES)) {
    if (nombreLimpio.includes(equipo) && ruta.trim() !== '') {
      return encodeURI(ruta);
    }
  }
  return 'https://cdn-icons-png.flaticon.com/512/53/53283.png';
}

// ===================== CAPA DE DATOS =====================

async function obtenerConCache(clave, ttlMin, pedir, forzar = false) {
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem('sp:' + clave)); } catch { /* sin caché */ }

  if (!forzar && guardado && Date.now() - guardado.t < ttlMin * 60000) {
    return { ...guardado.datos, desdeCache: true };
  }
  try {
    const datos = await pedir();
    try { localStorage.setItem('sp:' + clave, JSON.stringify({ t: Date.now(), datos })); } catch { /* lleno */ }
    return datos;
  } catch (error) {
    if (guardado) return { ...guardado.datos, desdeCache: true, obsoleto: true };
    throw error;
  }
}

async function pedirCuotas(sportKey) {
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`
  );
  if (res.status === 401) throw new Error('Clave de The Odds API no válida');
  if (res.status === 429) throw new Error('Demasiadas consultas, espera un momento');
  if (!res.ok) throw new Error(`Error en la API (${res.status})`); return { actualizado: new Date().toISOString(), restantes: res.headers.get('x-requests-remaining'), partidos: await res.json() }; }  // ===================== MOTOR DE ANÁLISIS ROBUSTO =====================  function analizarPartido(partido, index) { const claves = ['local', 'empate', 'visitante']; let cuotasSeleccionadas = null; let nombreCasa = 'Bet365';  if (partido.bookmakers && partido.bookmakers.length > 0) { const bet365Book = partido.bookmakers.find(b => b.title.toLowerCase() === 'bet365'); if (bet365Book) { const mercado = (bet365Book.markets \vert{}\vert{} []).find(m => m.key === 'h2h'); if (mercado) { const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price; const q = { local: precio(partido.home_team), empate: precio('Draw'), visitante: precio(partido.away_team) }; if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) { cuotasSeleccionadas = q; nombreCasa = 'Bet365'; } } }  if (!cuotasSeleccionadas) { for (const casa of partido.bookmakers) { const mercado = (casa.markets \vert{}\vert{} []).find(m => m.key === 'h2h'); if (mercado) { const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price; const q = { local: precio(partido.home_team), empate: precio('Draw'), visitante: precio(partido.away_team) }; if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) { cuotasSeleccionadas = q; nombreCasa = casa.title; break; } } } } }  if (!cuotasSeleccionadas) return null;  const inversas = claves.map(k => 1 / cuotasSeleccionadas[k]); const suma = inversas.reduce((a, b) => a + b, 0); const justa = {}; claves.forEach((k, i) => { justa[k] = inversas[i] / suma; });  const mejor = { local: { cuota: cuotasSeleccionadas.local, casa: nombreCasa }, empate: { cuota: cuotasSeleccionadas.empate, casa: nombreCasa }, visitante: { cuota: cuotasSeleccionadas.visitante, casa: nombreCasa } };  const ventaja = {}; claves.forEach((k) => { ventaja[k] = mejor[k].cuota * justa[k] - 1; }); const claveValor = claves.reduce((a, b) => (ventaja[b] > ventaja[a] ? b : a));  const valor = ventaja[claveValor] >= UMBRAL_VALOR ? { clave: claveValor, cuota: mejor[claveValor].cuota, casa: nombreCasa } : null;  const orden = [...claves].sort((a, b) => justa[b] - justa[a]); const probable = { clave: orden[0], prob: justa[orden[0]] };  let etiquetaConfianza = "Partido muy igualado"; if (probable.prob >= 0.60) etiquetaConfianza = "Favorito muy claro"; else if (probable.prob >= 0.48) etiquetaConfianza = "Leve favorito";  const probOver25 = probabilidadGeneral(partido, 'totals', 'Over', 2.5); const probOver15 = probabilidadGeneral(partido, 'totals', 'Over', 1.5); let tendenciaGoles = "Más de 1.5 Goles (Alta seguridad)"; if (probOver25 !== null && probOver25 >= 0.55) { tendenciaGoles = `Más de 2.5 Goles (${Math.round(probOver25 * 100)}% prob.)`;
  } else if (probOver15 !== null && probOver15 < 0.60) {
    tendenciaGoles = "Menos de 2.5 Goles (Partido táctico)";
  }

  const probBttsYes = probabilidadGeneral(partido, 'btts', 'Yes');
  let ambosMarcanTexto = "No concluyente";
  if (probBttsYes !== null) {
    ambosMarcanTexto = probBttsYes >= 0.52 ? `SÍ - Ambos Marcan (${Math.round(probBttsYes * 100)}\%)` : "NO - Difícil que anoten ambos"; } else { ambosMarcanTexto = (probable.prob < 0.50) ? "SÍ (Alta probabilidad ofensiva)" : "NO (Partido cerrado)"; }  const tendenciaCorners = probable.prob > 0.55 ? "Más de 8.5 Córners (Ritmo alto)" : "Más de 9.5 Córners (Partido abierto)";  return { id: index, local: partido.home_team, visitante: partido.away_team, fecha: new Date(partido.commence_time \vert{}\vert{} Date.now() + 86400000), valor, probable, justa, cuotasOriginales: cuotasSeleccionadas, etiquetaConfianza, mejorCuota: mejor[valor ? valor.clave : probable.clave], resultadoSugerido: valor ? valor.clave : probable.clave, esOportunidadTop: !!valor, probabilidadAcierto: probable.prob, tendenciaGoles, ambosMarcanTexto, tendenciaCorners, probOver25, probBttsYes }; }  function probabilidadGeneral(partido, tipoMercado, nombreSalida, punto = null) { const probs = []; for (const casa of partido.bookmakers \vert{}\vert{} []) { const mercado = (casa.markets \vert{}\vert{} []).find((m) => m.key === tipoMercado); if (!mercado) continue; const itemPrincipal = mercado.outcomes.find((o) => o.name === nombreSalida && (punto === null \vert{}\vert{} o.point === punto)); if (itemPrincipal && itemPrincipal.price > 1) { probs.push(1 / itemPrincipal.price); } } return probs.length ? media(probs) : null; }  // ===================== CARGA =====================  async function cargarPartidos(codigoLiga = 'PD') { const id = ++cargaId; mostrarEsqueleto(); setEstado('Sincronizando pronósticos...');  const sportKey = LIGAS_ODDS[codigoLiga] \vert{}\vert{} LIGAS_ODDS['PD'];  try { const cuotas = await obtenerConCache(`odds:${codigoLiga}`, TTL_CUOTAS_MIN, () => pedirCuotas(sportKey));
    if (id !== cargaId) return;

    partidosAnalizados = (cuotas.partidos || []).map((p, idx) => analizarPartido(p, idx)).filter(Boolean);
    metaCarga = { actualizado: cuotas.actualizado };
    renderizarPartidos();
  } catch (error) {
    if (id !== cargaId) return;
    mostrarError(error.message);
  }
}

// ===================== INTERFAZ Y MODAL DE DETALLE =====================

function setEstado(texto) {
  const el = document.getElementById('estado');
  if (el) el.textContent = texto;
}

function mostrarEsqueleto() {
  const container = document.getElementById('partidos-container');
  if (container) container.innerHTML = '<div class="skeleton h-48 rounded-2xl"></div>'.repeat(3);
}

function mostrarError(mensaje) {
  const container = document.getElementById('partidos-container');
  if (!container) return;
  container.innerHTML = `<div class="text-center py-12 text-sm text-red-400">Error: ${esc(mensaje)}</div>`;
}

function descripcionApuesta(p, clave) {
  if (clave === 'local') return `Victoria de ${p.local}`;
  if (clave === 'visitante') return `Victoria de ${p.visitante}`;
  return 'Empate';
}

const imgEscudo = (url, alt) => url ? `<img src="${esc(url)}" class="w-7 h-7 object-contain shrink-0" alt="${esc(alt)}" loading="lazy" onerror="this.src='https://cdn-icons-png.flaticon.com/512/53/53283.png'">` : '';

function tarjetaPartido(p, stake) {
  const cuotaFinal = p.mejorCuota.cuota;
  const casaFinal = p.mejorCuota.casa;
  const retornoBruto = stake * cuotaFinal;
  const beneficioNeto = retornoBruto - stake;

  const textoRecomendacion = descripcionApuesta(p, p.resultadoSugerido);

  return `
    <article onclick="abrirDetallePartido(${p.id})" class="card-glass rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:border-slate-500/50 transition duration-200 group">
      <div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-700/40 pb-3">
        <span>📅 ${esc(FECHA.format(p.fecha))}</span>
        <div class="flex items-center gap-2">
          ${p.esOportunidadTop ? '<span class="bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-lg border border-amber-500/30">💎 Oportunidad Destacada</span>' : `<span class="text-slate-400">${p.etiquetaConfianza}</span>`}
          <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded group-hover:bg-slate-700 group-hover:text-white transition">🔍 Ver Más</span>
        </div>
      </div>

      <!-- Equipos Enfrentados -->
      <div class="flex items-center justify-between gap-2 my-1">
        <div class="flex items-center gap-3 w-5/12 justify-end">
          <span class="font-bold text-right text-sm md:text-base truncate">${esc(p.local)}</span>${imgEscudo(buscarEscudo(p.local), p.local)}
        </div>
        <span class="text-slate-500 font-black text-xs px-2">VS</span>
        <div class="flex items-center gap-3 w-5/12 justify-start">
          ${imgEscudo(buscarEscudo(p.visitante), p.visitante)}
          <span class="font-bold text-left text-sm md:text-base truncate">${esc(p.visitante)}</span>
        </div>
      </div>

      <!-- Panel de Estadísticas Adicionales -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">⚽ Goles:</span>
          <span class="font-bold text-slate-200">${esc(p.tendenciaGoles)}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2
