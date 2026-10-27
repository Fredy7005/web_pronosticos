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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// ===================== CONFIGURACIÓN GENERAL =====================

const UMBRAL_VALOR = 0.02;
const MAX_PARTIDOS = 15;

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

// ===================== CAPA DE DATOS =====================

async function cargarArchivoEstatico() {
  if (dbEstatica) return dbEstatica;

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

  if (estatico.ligas && Array.isArray(estatico.ligas[codigoLiga])) {
    return {
      partidos: estatico.ligas[codigoLiga],
      restantes: estatico.restantes ?? null,
      origen: 'robot'
    };
  }

  if (Array.isArray(estatico)) {
    return {
      partidos: estatico,
      restantes: null,
      origen: 'robot'
    };
  }

  return { partidos: [], restantes: null, origen: 'sin_jornada' };
}

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
  if (tituloEl) tituloEl.textContent = modoHistorial ? `Historial — ${info.nombre}` : info.nombre;
  if (iconoEl) iconoEl.textContent = info.icono;
}

async function cargarPartidos(codigoLiga = 'PD') {
  const container = document.getElementById('partidos-container');
  if (!container) return;

  const id = ++cargaId;
  actualizarEncabezadoLiga(codigoLiga);
  mostrarEsqueleto();
  setEstado('Sincronizando pronósticos...');

  try {
    const datos = await obtenerDatosLiga(codigoLiga);
    if (id !== cargaId) return;

    partidosAnalizados = (datos.partidos || []).map((p, idx) => analizarPartido(p, idx)).filter(Boolean);
    renderizarPartidos(datos.origen, datos.restantes);
  } catch (error) {
    if (id !== cargaId) return;
    mostrarError(error.message);
  }
}

function setEstado(texto) {
  const el = document.getElementById('estado');
  if (el) el.textContent = texto;
}

function mostrarEsqueleto() {
  const container = document.getElementById('partidos-container');
  if (container) container.innerHTML = '<div class="bg-slate-900/50 animate-pulse h-44 rounded-2xl border border-slate-800"></div>'.repeat(3);
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
    <article onclick="abrirDetallePartido(${p.id})" class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:border-slate-600 transition duration-200 group shadow-lg">
      <div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-3">
        <span>📅 ${esc(FECHA.format(p.fecha))}</span>
        <div class="flex items-center gap-2">
          ${modoHistorial ? '<span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold text-[10px]">🏁 Finalizado</span>' : (p.esOportunidadTop ? '<span class="bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-lg border border-amber-500/30">💎 Oportunidad Destacada</span>' : `<span class="text-slate-400">${p.etiquetaConfianza}</span>`)}
          <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded group-hover:bg-slate-700 group-hover:text-white transition">🔍 Ver Más</span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 my-1">
        <div class="flex items-center gap-3 w-5/12 justify-end">
          <span class="font-bold text-right text-sm md:text-base truncate">${esc(p.local)}</span>
          ${imgEscudo(buscarEscudo(p.local), p.local)}
        </div>
        <span class="text-slate-500 font-black text-xs px-2">VS</span>
        <div class="flex items-center gap-3 w-5/12 justify-start">
          ${imgEscudo(buscarEscudo(p.visitante), p.visitante)}
          <span class="font-bold text-left text-sm md:text-base truncate">${esc(p.visitante)}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">⚽ Goles:</span>
          <span class="font-bold text-slate-200">${esc(p.tendenciaGoles)}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">🔄 Ambos Marcan:</span>
          <span class="font-bold text-slate-200">${esc(p.ambosMarcanTexto)}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">🚩 Córners:</span>
          <span class="font-bold text-slate-200">${esc(p.tendenciaCorners)}</span>
        </div>
      </div>

      <div class="bg-slate-950/80 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-800">
        <div class="text-center sm:text-left">
          <div class="text-[11px] text-slate-400 font-medium">${modoHistorial ? 'Pronóstico que se realizó:' : 'Pronóstico recomendado:'}</div>
          <div class="text-sm sm:text-base font-extrabold text-emerald-400">${esc(textoRecomendacion)}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">Cuota: <strong class="text-white">${cuotaFinal.toFixed(2)}</strong> (${esc(casaFinal)})</div>
        </div>

        <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800">
          <div class="text-right text-xs">
            <div class="text-slate-400">${modoHistorial ? 'Beneficio registrado:' : 'Beneficio estimado:'}</div>
            <div class="text-sm font-extrabold text-emerald-400">+${esc(EUR.format(beneficioNeto))}</div>
          </div>
          ${modoHistorial ? '' : `<a href="https://www.bet365.com" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-3 rounded-xl text-center active:scale-95 transition shadow-lg">Apostar</a>`}
        </div>
      </div>
    </article>`;
}

function abrirDetallePartido(id) {
  const p = partidosAnalizados.find(item => item.id === id);
  if (!p) return;

  const modal = document.getElementById('modal-detalle');
  const contenido = document.getElementById('modal-contenido');
  if (!modal || !contenido) return;

  const pctLocal = Math.round(p.justa.local * 100);
  const pctEmpate = Math.round(p.justa.empate * 100);
  const pctVisitante = Math.round(p.justa.visitante * 100);

  contenido.innerHTML = `
    <div class="text-center border-b border-slate-800 pb-4 mb-4">
      <span class="text-xs text-slate-400">📊 Análisis Estadístico Detallado</span>
      <h2 class="text-lg font-black text-white mt-1">${esc(p.local)} vs ${esc(p.visitante)}</h2>
      <p class="text-xs text-slate-400 mt-0.5">📅 ${esc(FECHA.format(p.fecha))}</p>
    </div>

    <div class="mb-5">
      <div class="text-xs font-bold text-slate-300 mb-2">📊 Probabilidades Reales de Resultado (1X2):</div>
      <div class="grid grid-cols-3 gap-2 text-center text-xs">
        <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
          <div class="text-slate-400">1 (Local)</div>
          <div class="text-base font-extrabold text-emerald-400 mt-1">${pctLocal}%</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Cuota: ${p.cuotasOriginales.local.toFixed(2)}</div>
        </div>
        <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
          <div class="text-slate-400">X (Empate)</div>
          <div class="text-base font-extrabold text-amber-400 mt-1">${pctEmpate}%</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Cuota: ${p.cuotasOriginales.empate.toFixed(2)}</div>
        </div>
        <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
          <div class="text-slate-400">2 (Visitante)</div>
          <div class="text-base font-extrabold text-blue-400 mt-1">${pctVisitante}%</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Cuota: ${p.cuotasOriginales.visitante.toFixed(2)}</div>
        </div>
      </div>
    </div>

    <div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs space-y-2 mb-5">
      <div class="font-bold text-slate-300 mb-1">🔍 Desglose de Predicción:</div>
      <div class="flex justify-between border-b border-slate-800 pb-1.5">
        <span class="text-slate-400">Mercado 1X2 recomendado:</span>
        <span class="font-extrabold text-emerald-400">${descripcionApuesta(p, p.resultadoSugerido)}</span>
      </div>
      <div class="flex justify-between border-b border-slate-800 pb-1.5">
        <span class="text-slate-400">Línea de Goles recomendada:</span>
        <span class="font-bold text-slate-200">${esc(p.tendenciaGoles)}</span>
      </div>
      <div class="flex justify-between border-b border-slate-800 pb-1.5">
        <span class="text-slate-400">Mercado Ambos Marcan:</span>
        <span class="font-bold text-slate-200">${esc(p.ambosMarcanTexto)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Pronóstico de Córners:</span>
        <span class="font-bold text-slate-200">${esc(p.tendenciaCorners)}</span>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function cerrarModal() {
  const modal = document.getElementById('modal-detalle');
  if (modal) modal.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-detalle');
  if (e.target === modal) cerrarModal();
});

function renderizarPartidos() {
  const container = document.getElementById('partidos-container');
  if (!container) return;

  const inputStake = document.getElementById('input-stake');
  const stake = Math.min(Math.max(parseFloat(inputStake?.value) || 10, 1), 10000);

  let lista = partidosAnalizados.filter((p) => {
    const esFuturo = p.fecha.getTime() > Date.now();
    return modoHistorial ? !esFuturo : esFuturo;
  });

  if (!modoHistorial && lista.length === 0 && partidosAnalizados.length > 0) {
    lista = [...partidosAnalizados];
  }

  if (soloValor) {
    lista = lista.filter(p => p.esOportunidadTop);
  }

  if (ordenActual === 'probabilidad') {
    lista.sort((a, b) => b.probabilidadAcierto - a.probabilidadAcierto);
  } else {
    lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }

  if (modoHistorial) {
    setEstado('📜 Mostrando historial de partidos finalizados con todos sus pronósticos');
  } else {
    setEstado(`🟢 Motor V5 activo — ${lista.length} partido(s) disponibles`);
  }

  if (lista.length === 0) {
    container.innerHTML = `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-slate-400 text-center text-sm">${
      soloValor ? 'No hay oportunidades Top (EV+) en esta jornada.' : (modoHistorial ? 'No hay partidos en el historial para esta competición.' : 'No hay partidos próximos programados en este momento.')
    }</div>`;
    return;
  }

  container.innerHTML = lista.slice(0, MAX_PARTIDOS).map((p) => tarjetaPartido(p, stake)).join('');
}

function toggleVistaHistorial() {
  modoHistorial = !modoHistorial;
  actualizarEncabezadoLiga(ligaActual);
  renderizarPartidos();
}

function cambiarLiga(codigo) {
  ligaActual = codigo || 'PD';
  cargarPartidos(ligaActual);
}

function toggleSoloValor() {
  soloValor = !soloValor;
  const btn = document.getElementById('btn-solo-valor');
  if (btn) {
    btn.setAttribute('aria-pressed', String(soloValor));
    if (soloValor) {
      btn.classList.remove('bg-slate-950', 'border-slate-800', 'text-slate-300');
      btn.classList.add('bg-amber-600', 'border-amber-500', 'text-white');
    } else {
      btn.classList.remove('bg-amber-600', 'border-amber-500', 'text-white');
      btn.classList.add('bg-slate-950', 'border-slate-800', 'text-slate-300');
    }
  }
  renderizarPartidos();
}

function cambiarOrden() {
  const select = document.getElementById('select-orden');
  if (select) {
    ordenActual = select.value;
    renderizarPartidos();
  }
}

function actualizarSimulacion() {
  renderizarPartidos();
}

// ===================== AUTENTICACIÓN CON FIREBASE =====================

auth.onAuthStateChanged((user) => {
  const authContainer = document.getElementById('auth-user-container');
  if (!authContainer) return;

  if (user) {
    authContainer.innerHTML = `
      <span class="text-xs text-emerald-400 font-bold truncate max-w-[140px]">👤 ${esc(user.email)}</span>
      <button onclick="cerrarSesionFirebase()" class="bg-slate-900 hover:bg-red-950/60 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-900 text-xs font-bold px-3 py-2 rounded-xl transition shadow">
        🚪 Salir
      </button>
    `;
  } else {
    authContainer.innerHTML = `
      <button onclick="abrirModalAuth('login')" class="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition shadow flex items-center gap-1.5">
        🔑 Iniciar Sesión
      </button>
      <button onclick="abrirModalAuth('registro')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow flex items-center gap-1.5">
        📝 Registrarse
      </button>
    `;
  }
});

async function cerrarSesionFirebase() {
  try {
    await auth.signOut();
  } catch (err) {
    console.error(err);
  }
}

// ===================== PARTIDOS GLOBALES POR HORA =====================

async function abrirModalPartidosGlobales() {
    let modal = document.getElementById('modal-global-horas');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-global-horas';
        modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-center items-center p-4';
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] p-6 relative shadow-2xl flex flex-col gap-4">
                <div class="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">⏰</span>
                        <h3 class="text-base font-black text-white">Próximos Partidos Globales (Por Hora)</h3>
                    </div>
                    <button onclick="document.getElementById('modal-global-horas').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg font-bold px-2">✕</button>
                </div>
                <div id="lista-global-horas" class="flex flex-col gap-2.5 overflow-y-auto pr-1 max-h-[60vh]">
                    <div class="text-xs text-slate-400 text-center py-8">Cargando partidos de todas las ligas...</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }

    const contenedorLista = document.getElementById('lista-global-horas');
    const estatico = await cargarArchivoEstatico();

    if (!estatico || !estatico.ligas) {
        contenedorLista.innerHTML = '<div class="text-xs text-slate-500 text-center py-6">No hay datos disponibles en este momento.</div>';
        return;
    }

    let todos = [];
    for (const [codigoLiga, lista] of Object.entries(estatico.ligas)) {
        if (Array.isArray(lista)) {
            const nombreLiga = INFO_LIGAS[codigoLiga]?.nombre || codigoLiga;
            lista.forEach((p, idx) => {
                const analizado = analizarPartido(p, idx);
                if (analizado && analizado.fecha.getTime() > Date.now()) {
                    todos.push({ ...analizado, nombreLigaCompeticion: nombreLiga });
                }
            });
        }
    }

    todos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    if (todos.length === 0) {
        contenedorLista.innerHTML = '<div class="text-xs text-slate-500 text-center py-6">No hay partidos futuros programados.</div>';
        return;
    }

    contenedorLista.innerHTML = todos.map(p => `
        <div onclick="document.getElementById('modal-global-horas').classList.add('hidden'); abrirDetallePartido(${p.id});" class="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 p-3 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group">
            <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-900/50 px-2.5 py-1.5 rounded-lg">
                    ${FECHA.format(p.fecha)}
                </span>
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-white group-hover:text-emerald-400 transition">${esc(p.local)} vs ${esc(p.visitante)}</span>
                    <span class="text-[10px] text-slate-400">🏆 ${esc(p.nombreLigaCompeticion)}</span>
                </div>
            </div>
            <div class="text-right">
                <span class="text-[10px] text-slate-400 block">Cuota ${p.mejorCuota.cuota.toFixed(2)}</span>
                <span class="text-[11px] font-bold text-emerald-400">${descripcionApuesta(p, p.resultadoSugerido)}</span>
            </div>
        </div>
    `).join('');
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal-global-horas');
    if (e.target === modal) modal.classList.add('hidden');
});

// ===================== INICIALIZACIÓN AUTOMÁTICA =====================

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const ligaParam = params.get('liga') || 'PD';
  modoHistorial = params.get('historial') === 'true';

  if (document.getElementById('partidos-container')) {
    cambiarLiga(ligaParam);
  }

  AlimentarCalculadoraSiExiste();
});
