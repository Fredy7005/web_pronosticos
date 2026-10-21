// ===================== CONFIGURACIÓN =====================

const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27';
const FOOTBALL_API_KEY = '726c6d912ebf9bb9415e9dfd0fb8a498';

const LIGAS_ODDS = {
  'PD': 'soccer_spain_la_liga',
  'PL': 'soccer_epl',
  'CL': 'soccer_uefa_champs_league'
};

const LIGAS_FOOTBALL_ID = {
  'PD': [140, 141], // Primera y Segunda División
  'PL': [39, 40],   // Premier y Championship
  'CL': [2]
};

const UMBRAL_VALOR = 0.02;
const MAX_PARTIDOS = 12;

const TTL_CUOTAS_MIN = 15;
const TTL_ESCUDOS_MIN = 720;

const MAPA_EQUIPOS = {
  'wolverhampton wanderers': 'wolves',
  'bayern munich': 'bayern munchen',
  'red star belgrade': 'crvena zvezda',
  'athletic bilbao': 'athletic club',
  'celta vigo': 'celta de vigo'
};

const PALABRAS_RUIDO = new Set(['fc', 'cf', 'ud', 'cd', 'afc', 'sc', 'club', 'de', 'rcd', 'the']);

// Fallbacks manuales garantizados por si el límite de API-Sports se agota
const ESCUDOS_SEGUROS = {
  'levante': 'https://media.api-sports.io/football/teams/539.png',
  'athletic': 'https://media.api-sports.io/football/teams/531.png',
  'alaves': 'https://media.api-sports.io/football/teams/543.png',
  'malaga': 'https://media.api-sports.io/football/teams/547.png',
  'real madrid': 'https://media.api-sports.io/football/teams/541.png',
  'barcelona': 'https://media.api-sports.io/football/teams/529.png',
  'atletico madrid': 'https://media.api-sports.io/football/teams/530.png'
};

// ===================== ESTADO =====================

let ligaActual = 'PD';
let soloValor = false;
let ordenActual = 'fecha';
let partidosAnalizados = [];
let indiceEscudos = [];
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

function obtenerAnioTemporada() {
  const hoy = new Date();
  const mes = hoy.getMonth();
  const anio = hoy.getFullYear();
  return mes < 6 ? anio - 1 : anio;
}

function normalizarNombre(nombre) {
  if (!nombre) return '';
  const base = String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return (MAPA_EQUIPOS[base] || base).split(' ').filter((t) => t && !PALABRAS_RUIDO.has(t)).join(' ');
}

function construirIndiceEscudos(equipos) {
  return (equipos || [])
    .filter((e) => e && e.nombre && /^https:\/\//.test(e.logo || ''))
    .map((e) => ({ clave: normalizarNombre(e.nombre), logo: e.logo }))
    .map((e) => ({ ...e, tokens: e.clave.split(' ') }));
}

function buscarEscudo(nombre) {
  const clave = normalizarNombre(nombre);
  if (!clave) return '';

  // 1. Búsqueda exacta
  const exacto = indiceEscudos.find((e) => e.clave === clave);
  if (exacto) return exacto.logo;

  // 2. Búsqueda por tokens (menos estricta ahora)
  const tokens = clave.split(' ');
  const contenidos = (a, b) => a.every((t) => b.includes(t));
  const candidatos = indiceEscudos.filter((e) => contenidos(tokens, e.tokens) || contenidos(e.tokens, tokens));
  if (candidatos.length > 0) return candidatos[0].logo;

  // 3. Sistema de Respaldo por si la API-Sports devolvió array vacío por límite de cuota
  for (const [key, url] of Object.entries(ESCUDOS_SEGUROS)) {
    if (clave.includes(key)) return url;
  }

  return ''; // Si no encuentra nada, devuelve vacío (no mostrará imagen rota)
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
  if (!res.ok) throw new Error(`Error en la API (${res.status})`);
  return {
    actualizado: new Date().toISOString(),
    restantes: res.headers.get('x-requests-remaining'),
    partidos: await res.json()
  };
}

async function pedirEscudos(leagueIds, temporada) {
  const ids = Array.isArray(leagueIds) ? leagueIds : [leagueIds];
  let todosLosEquipos = [];

  for (const id of ids) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io/teams?league=${id}&season=${temporada}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        // Evitar procesar si la API devuelve error de límites
        if (data.errors && Object.keys(data.errors).length > 0) {
          console.warn("Límite de API-Sports alcanzado o error:", data.errors);
        } else {
          const equipos = (data.response || []).map((item) => ({ nombre: item.team.name, logo: item.team.logo }));
          todosLosEquipos = todosLosEquipos.concat(equipos);
        }
      }
    } catch (e) {
      console.warn(`Falló la descarga de liga ${id}`);
    }
  }
  
  if (todosLosEquipos.length === 0) {
    throw new Error("No se cargaron escudos. Usando respaldo...");
  }
  return { equipos: todosLosEquipos };
}

// ===================== MOTOR DE ANÁLISIS ROBUSTO =====================

function analizarPartido(partido, index) {
  const claves = ['local', 'empate', 'visitante'];
  let cuotasSeleccionadas = null;
  let nombreCasa = 'Bet365';

  if (partido.bookmakers && partido.bookmakers.length > 0) {
    const bet365Book = partido.bookmakers.find(b => b.title.toLowerCase() === 'bet365');
    if (bet365Book) {
      const mercado = (bet365Book.markets || []).find(m => m.key === 'h2h');
      if (mercado) {
        const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price;
        const q = {
          local: precio(partido.home_team),
          empate: precio('Draw'),
          visitante: precio(partido.away_team)
        };
        if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) {
          cuotasSeleccionadas = q;
          nombreCasa = 'Bet365';
        }
      }
    }

    if (!cuotasSeleccionadas) {
      for (const casa of partido.bookmakers) {
        const mercado = (casa.markets || []).find(m => m.key === 'h2h');
        if (mercado) {
          const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price;
          const q = {
            local: precio(partido.home_team),
            empate: precio('Draw'),
            visitante: precio(partido.away_team)
          };
          if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) {
            cuotasSeleccionadas = q;
            nombreCasa = casa.title;
            break;
          }
        }
      }
    }
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
  let tendenciaGoles = "Más de 1.5 Goles (Alta seguridad)";
  if (probOver25 !== null && probOver25 >= 0.55) {
    tendenciaGoles = `Más de 2.5 Goles (${Math.round(probOver25 * 100)}% prob.)`;
  } else if (probOver15 !== null && probOver15 < 0.60) {
    tendenciaGoles = "Menos de 2.5 Goles (Partido táctico)";
  }

  const probBttsYes = probabilidadGeneral(partido, 'btts', 'Yes');
  let ambosMarcanTexto = "No concluyente";
  if (probBttsYes !== null) {
    ambosMarcanTexto = probBttsYes >= 0.52 ? `SÍ - Ambos Marcan (${Math.round(probBttsYes * 100)}%)` : "NO - Difícil que anoten ambos";
  } else {
    ambosMarcanTexto = (probable.prob < 0.50) ? "SÍ (Alta probabilidad ofensiva)" : "NO (Partido cerrado)";
  }

  const tendenciaCorners = probable.prob > 0.55 ? "Más de 8.5 Córners (Ritmo alto)" : "Más de 9.5 Córners (Partido abierto)";

  return {
    id: index,
    local: partido.home_team,
    visitante: partido.away_team,
    fecha: new Date(partido.commence_time || Date.now() + 86400000),
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
    tendenciaCorners,
    probOver25,
    probBttsYes
  };
}

function probabilidadGeneral(partido, tipoMercado, nombreSalida, punto = null) {
  const probs = [];
  for (const casa of partido.bookmakers || []) {
    const mercado = (casa.markets || []).find((m) => m.key === tipoMercado);
    if (!mercado) continue;
    const itemPrincipal = mercado.outcomes.find((o) => o.name === nombreSalida && (punto === null || o.point === punto));
    if (itemPrincipal && itemPrincipal.price > 1) {
      probs.push(1 / itemPrincipal.price);
    }
  }
  return probs.length ? media(probs) : null;
}

// ===================== CARGA =====================

async function cargarPartidos(codigoLiga = 'PD') {
  const id = ++cargaId;
  mostrarEsqueleto();
  setEstado('Sincronizando pronósticos...');

  const sportKey = LIGAS_ODDS[codigoLiga] || LIGAS_ODDS['PD'];
  const leagueId = LIGAS_FOOTBALL_ID[codigoLiga] || [140];
  const temporada = obtenerAnioTemporada();

  try {
    const [cuotas, escudos] = await Promise.all([
      obtenerConCache(`odds:${codigoLiga}`, TTL_CUOTAS_MIN, () => pedirCuotas(sportKey)),
      // SIMPA: Llave v3 forzando limpiar la caché corrupta del navegador
      obtenerConCache(`escudos_v3:${codigoLiga}:${temporada}`, TTL_ESCUDOS_MIN, () => pedirEscudos(leagueId, temporada))
        .catch(() => ({ equipos: [] }))
    ]);
    if (id !== cargaId) return;

    partidosAnalizados = (cuotas.partidos || []).map((p, idx) => analizarPartido(p, idx)).filter(Boolean);
    indiceEscudos = construirIndiceEscudos(escudos.equipos);
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

const imgEscudo = (url, alt) => url ? `<img src="${esc(url)}" class="w-7 h-7 object-contain shrink-0" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">` : '';

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
          <span class="font-bold text-right text-sm md:text-base truncate">${esc(p.local)}</span>
          ${imgEscudo(buscarEscudo(p.local), p.local)}
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
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">🔄 Ambos Marcan:</span>
          <span class="font-bold text-slate-200">${esc(p.ambosMarcanTexto)}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">🚩 Córners:</span>
          <span class="font-bold text-slate-200">${esc(p.tendenciaCorners)}</span>
        </div>
      </div>

      <!-- Recomendación Clara y Directa -->
      <div class="bg-slate-900/90 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-700/50">
        <div class="text-center sm:text-left">
          <div class="text-[11px] text-slate-400 font-medium">Pronóstico recomendado:</div>
          <div class="text-sm sm:text-base font-extrabold text-green-400">${esc(textoRecomendacion)}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">Cuota: <strong class="text-white">${cuotaFinal.toFixed(2)}</strong> (${esc(casaFinal)})</div>
        </div>

        <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800">
          <div class="text-right text-xs">
            <div class="text-slate-400">Beneficio estimado:</div>
            <div class="text-sm font-extrabold text-green-400">+${esc(EUR.format(beneficioNeto))}</div>
          </div>

          <a href="https://www.bet365.com" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" class="btn-primary text-white text-xs font-bold px-5 py-3 rounded-xl text-center active:scale-95 transition shadow-lg">
            Apostar
          </a>
        </div>
      </div>
    </article>`;
}

// Lógica para desplegar la ventana emergente informativa
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
      <span class="text-xs text-slate-400"> Análisas Estadístico Detallado</span>
      <h2 class="text-lg font-black text-white mt-1">${esc(p.local)} vs ${esc(p.visitante)}</h2>
      <p class="text-xs text-slate-400 mt-0.5">📅 ${esc(FECHA.format(p.fecha))}</p>
    </div>

    <!-- Porcentajes de Probabilidad 1X2 -->
    <div class="mb-5">
      <div class="text-xs font-bold text-slate-300 mb-2">📊 Probabilidades Reales de Resultado (1X2):</div>
      <div class="grid grid-cols-3 gap-2 text-center text-xs">
        <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
          <div class="text-slate-400">1 (Local)</div>
          <div class="text-base font-extrabold text-green-400 mt-1">${pctLocal}%</div>
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

    <!-- Desglose del Análisis Estadístico -->
    <div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs space-y-2 mb-5">
      <div class="font-bold text-slate-300 mb-1">🔍 Desglose de Predicción:</div>
      <div class="flex justify-between border-b border-slate-800 pb-1.5">
        <span class="text-slate-400">Mercado 1X2 recomendado:</span>
        <span class="font-extrabold text-green-400">${descripcionApuesta(p, p.resultadoSugerido)}</span>
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

    <!-- Botón de Acción -->
    <a href="https://www.bet365.com" target="_blank" rel="noopener noreferrer" class="btn-primary w-full text-white text-xs font-bold py-3.5 rounded-xl text-center block active:scale-95 transition shadow-lg">
      Ir a Bet365 para apostar este encuentro
    </a>
  `;

  modal.classList.remove('hidden');
}

function cerrarModal() {
  const modal = document.getElementById('modal-detalle');
  if (modal) modal.classList.add('hidden');
}

// Cierre al pulsar fuera de la caja
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-detalle');
  if (e.target === modal) cerrarModal();
});

function renderizarPartidos() {
  const container = document.getElementById('partidos-container');
  if (!container) return;

  const inputStake = document.getElementById('input-stake');
  const stake = Math.min(Math.max(parseFloat(inputStake?.value) || 10, 1), 10000);

  let lista = partidosAnalizados.filter((p) => p.fecha.getTime() > Date.now());

  if (soloValor) {
    const oportunidadesPuras = lista.filter((p) => p.esOportunidadTop);
    
    if (oportunidadesPuras.length > 0) {
      lista = oportunidadesPuras;
      setEstado('Mostrando Oportunidades Destacadas (Value Bets)');
    } else {
      lista = [...lista].sort((a, b) => b.probabilidadAcierto - a.probabilidadAcierto);
      setEstado('Sin Value Bets directas hoy: mostrando selecciones con mayor probabilidad');
    }
  } else {
    setEstado('Partidos actualizados correctamente');
  }

  if (ordenActual === 'probabilidad') {
    lista.sort((a, b) => b.probabilidadAcierto - a.probabilidadAcierto);
  } else if (!soloValor) {
    lista.sort((a, b) => a.fecha - b.fecha);
  }

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">No hay partidos próximos disponibles para la liga seleccionada.</p>';
    return;
