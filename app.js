// ===================== CONFIGURACIÓN =====================

// Claves de ambas APIs
// ⚠️ Mientras estén aquí, cualquiera que abra la web puede verlas (pestaña Red del navegador).
// Para publicar la web hay que moverlas a un servidor; ver README.
const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27';
const FOOTBALL_API_KEY = '726c6d912ebf9bb9415e9dfd0fb8a498';

const LIGAS_ODDS = {
  'PD': 'soccer_spain_la_liga',
  'PL': 'soccer_epl',
  'CL': 'soccer_uefa_champs_league'
};

const LIGAS_FOOTBALL_ID = {
  'PD': 140,
  'PL': 39,
  'CL': 2
};

// Una cuota tiene "valor" si (mejor cuota × probabilidad justa − 1) supera este umbral...
const UMBRAL_VALOR = 0.03;
// ...y se han comparado al menos estas casas de apuestas.
const MIN_CASAS = 3;
const MAX_PARTIDOS = 12;

// Minutos que se reutilizan los datos guardados en el navegador (ahorra créditos de las APIs)
const TTL_CUOTAS_MIN = 15;
const TTL_ESCUDOS_MIN = 720;

// Equivalencias de nombres entre The Odds API y API-Sports.
// Las claves van en minúsculas y sin tildes. Solo hacen falta los casos que el
// emparejado automático (ver buscarEscudo) no resuelve solo.
const MAPA_EQUIPOS = {
  'wolverhampton wanderers': 'wolves',
  'bayern munich': 'bayern munchen',
  'red star belgrade': 'crvena zvezda'
  // Añadir más equivalencias según se detecten discrepancias
};

const PALABRAS_RUIDO = new Set(['fc', 'cf', 'ud', 'cd', 'afc', 'sc', 'club', 'de', 'rcd', 'the']);

// ===================== ESTADO =====================

let ligaActual = 'PD';
let soloValor = false;
let partidosAnalizados = [];
let indiceEscudos = [];
let metaCarga = null;
let cargaId = 0; // evita que una respuesta lenta pise a otra más reciente al cambiar de liga

// ===================== UTILIDADES =====================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const pct = (v) => `${Math.round(v * 100)}%`;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const FECHA = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});
const media = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

// Calcula el año de temporada correcto (ej: en mayo de 2026 la temporada empezó en 2025)
function obtenerAnioTemporada() {
  const hoy = new Date();
  const mes = hoy.getMonth(); // 0 = Enero, 6 = Julio, etc.
  const anio = hoy.getFullYear();
  // Si estamos entre enero y junio, la temporada en curso empezó el año anterior
  return mes < 6 ? anio - 1 : anio;
}

// Nombre en minúsculas, sin tildes ni palabras de relleno (FC, CF, Club...)
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

// Coincidencia exacta o, si no, que los palabras de uno estén contenidas en las del otro
// y haya un único candidato (así "Brighton and Hove Albion" casa con "Brighton").
function buscarEscudo(nombre) {
  const clave = normalizarNombre(nombre);
  const exacto = indiceEscudos.find((e) => e.clave === clave);
  if (exacto) return exacto.logo;
  const tokens = clave.split(' ');
  const contenidos = (a, b) => a.every((t) => b.includes(t));
  const candidatos = indiceEscudos.filter((e) => contenidos(tokens, e.tokens) || contenidos(e.tokens, tokens));
  return candidatos.length === 1 ? candidatos[0].logo : '';
}

// ===================== CAPA DE DATOS =====================

// Reutiliza datos guardados en el navegador mientras estén frescos. Si la red falla,
// devuelve los últimos datos guardados en lugar de dejar la pantalla vacía.
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
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`
  );
  if (res.status === 401) throw new Error('The Odds API rechaza la key (no válida o sin créditos)');
  if (res.status === 429) throw new Error('Demasiadas peticiones a The Odds API, espera un momento');
  if (!res.ok) throw new Error(`The Odds API respondió con el error ${res.status}`);
  return {
    actualizado: new Date().toISOString(),
    restantes: res.headers.get('x-requests-remaining'), // puede ser null si el navegador no lo expone
    partidos: await res.json()
  };
}

// Pide todos los equipos de la liga (1 sola llamada) en vez de solo los próximos 10 partidos.
async function pedirEscudos(leagueId, temporada) {
  const res = await fetch(`https://v3.football.api-sports.io/teams?league=${leagueId}&season=${temporada}`, {
    headers: { 'x-apisports-key': FOOTBALL_API_KEY }
  });
  if (!res.ok) throw new Error(`API-Sports respondió con el error ${res.status}`);
  const data = await res.json();
  const errores = data.errors ? Object.values(data.errors).join(' ') : '';
  return {
    equipos: (data.response || []).map((item) => ({ nombre: item.team.name, logo: item.team.logo })),
    error: errores || null // p. ej. el plan gratuito no cubre esta temporada
  };
}

// ===================== MOTOR DE ANÁLISIS =====================

// Por cada casa se quita el margen (normalizando 1/cuota) y se promedia entre casas:
// esa es la probabilidad "justa" del mercado. El valor compara la MEJOR cuota disponible
// con esa probabilidad. Los pronósticos de goles salen del mercado real de totales.
function analizarPartido(partido) {
  const claves = ['local', 'empate', 'visitante'];
  const cotizaciones = [];

  for (const casa of partido.bookmakers || []) {
    const mercado = (casa.markets || []).find((m) => m.key === 'h2h');
    if (!mercado) continue;
    const precio = (nombre) => mercado.outcomes.find((o) => o.name === nombre)?.price;
    const q = {
      casa: casa.title,
      local: precio(partido.home_team),
      empate: precio('Draw'),
      visitante: precio(partido.away_team)
    };
    if (claves.every((k) => Number.isFinite(q[k]) && q[k] > 1)) cotizaciones.push(q);
  }
  if (cotizaciones.length === 0) return null;

  const justa = { local: 0, empate: 0, visitante: 0 };
  const mejor = {};
  let margen = 0;

  for (const q of cotizaciones) {
    const inversas = claves.map((k) => 1 / q[k]);
    const suma = inversas.reduce((a, b) => a + b, 0); // > 1: el exceso es el margen de la casa
    margen += suma - 1;
    claves.forEach((k, i) => {
      justa[k] += inversas[i] / suma;
      if (!mejor[k] || q[k] > mejor[k].cuota) mejor[k] = { cuota: q[k], casa: q.casa };
    });
  }
  claves.forEach((k) => { justa[k] /= cotizaciones.length; });
  margen /= cotizaciones.length;

  const ventaja = {};
  claves.forEach((k) => { ventaja[k] = mejor[k].cuota * justa[k] - 1; });
  const claveValor = claves.reduce((a, b) => (ventaja[b] > ventaja[a] ? b : a));
  const valor = ventaja[claveValor] >= UMBRAL_VALOR && cotizaciones.length >= MIN_CASAS
    ? { clave: claveValor, ventaja: ventaja[claveValor], cuota: mejor[claveValor].cuota, casa: mejor[claveValor].casa }
    : null;

  const orden = [...claves].sort((a, b) => justa[b] - justa[a]);
  const par = new Set([orden[0], orden[1]]);
  const cobertura = {
    etiqueta: par.has('local') && par.has('empate') ? '1X' : par.has('empate') ? 'X2' : '12',
    prob: justa[orden[0]] + justa[orden[1]]
  };

  return {
    local: partido.home_team,
    visitante: partido.away_team,
    fecha: new Date(partido.commence_time),
    casas: cotizaciones.length,
    justa, mejor, margen, valor, cobertura,
    probable: { clave: orden[0], prob: justa[orden[0]] },
    over25: probabilidadMasDe(partido, 2.5)
  };
}

// Probabilidad de "Más de X goles" promediando las casas y sin margen.
function probabilidadMasDe(partido, linea) {
  const probs = [];
  for (const casa of partido.bookmakers || []) {
    const mercado = (casa.markets || []).find((m) => m.key === 'totals');
    const over = mercado?.outcomes.find((o) => o.name === 'Over' && o.point === linea)?.price;
    const under = mercado?.outcomes.find((o) => o.name === 'Under' && o.point === linea)?.price;
    if (over > 1 && under > 1) probs.push((1 / over) / (1 / over + 1 / under));
  }
  return probs.length ? media(probs) : null;
}

// ===================== CARGA =====================

async function cargarPartidos(codigoLiga = 'PD', forzar = false) {
  const id = ++cargaId;
  mostrarEsqueleto();
  setEstado('Cargando cuotas…');

  const sportKey = LIGAS_ODDS[codigoLiga] || LIGAS_ODDS['PD'];
  const leagueId = LIGAS_FOOTBALL_ID[codigoLiga] || 140;
  const temporada = obtenerAnioTemporada();

  try {
    const [cuotas, escudos] = await Promise.all([
      obtenerConCache(`odds:${codigoLiga}`, TTL_CUOTAS_MIN, () => pedirCuotas(sportKey), forzar),
      // Los escudos son opcionales: si fallan, la web funciona igual sin ellos
      obtenerConCache(`escudos:${codigoLiga}:${temporada}`, TTL_ESCUDOS_MIN, () => pedirEscudos(leagueId, temporada))
        .catch((e) => ({ equipos: [], error: e.message }))
    ]);
    if (id !== cargaId) return; // llegó tarde: el usuario ya cambió de liga

    partidosAnalizados = (cuotas.partidos || []).map(analizarPartido).filter(Boolean);
    indiceEscudos = construirIndiceEscudos(escudos.equipos);
    metaCarga = {
      actualizado: cuotas.actualizado,
      restantes: cuotas.restantes,
      desdeCache: cuotas.desdeCache,
      obsoleto: cuotas.obsoleto,
      sinEscudos: indiceEscudos.length === 0
    };
    renderizarPartidos();
  } catch (error) {
    if (id !== cargaId) return;
    console.error('Error:', error);
    setEstado('');
    mostrarError(error.message);
  }
}

// ===================== INTERFAZ =====================

function setEstado(texto) {
  const el = document.getElementById('estado');
  if (el) el.textContent = texto;
}

function textoEstado() {
  if (!metaCarga) return '';
  const hora = metaCarga.actualizado
    ? new Date(metaCarga.actualizado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';
  const partes = [`Actualizado a las ${hora}`];
  if (metaCarga.obsoleto) partes.push('sin conexión: se muestran los últimos datos guardados');
  else if (metaCarga.desdeCache) partes.push('desde caché');
  if (metaCarga.restantes !== null && metaCarga.restantes !== undefined) partes.push(`créditos restantes: ${metaCarga.restantes}`);
  if (metaCarga.sinEscudos) partes.push('sin escudos');
  return partes.join(' · ');
}

function mostrarEsqueleto() {
  const container = document.getElementById('partidos-container');
  if (container) container.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton h-48 rounded-2xl"></div>').join('');
}

function mostrarError(mensaje) {
  const container = document.getElementById('partidos-container');
  if (!container) return;
  container.innerHTML = `
    <div class="text-center py-16 text-sm">
      <p class="text-red-400 mb-3">No se pudieron cargar los partidos: ${esc(mensaje)}</p>
      <button type="button" onclick="recargar()" class="btn-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl">Reintentar</button>
    </div>`;
}

function nombreResultado(p, clave) {
  if (clave === 'local') return `Victoria ${p.local}`;
  if (clave === 'visitante') return `Victoria ${p.visitante}`;
  return 'Empate';
}

function celdaCuota(p, clave, simbolo, extra) {
  const probable = p.probable.clave === clave;
  return `
    <div class="text-center px-3 min-w-0 ${extra}">
      <div class="text-[10px] text-slate-400 font-bold">${simbolo} · ${pct(p.justa[clave])}</div>
      <div class="text-xs font-bold ${probable ? 'text-green-400' : 'text-slate-100'}">${p.mejor[clave].cuota.toFixed(2)}</div>
      <div class="text-[9px] text-slate-500 truncate max-w-[72px]" title="${esc(p.mejor[clave].casa)}">${esc(p.mejor[clave].casa)}</div>
    </div>`;
}

const imgEscudo = (url, alt) => url
  ? `<img src="${esc(url)}" class="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`
  : '';

function tarjetaPartido(p, stake) {
  // Selección sobre la que se calcula el retorno: la cuota con valor si existe; si no, el resultado más probable
  const sel = p.valor
    ? { etiqueta: 'Con valor', clave: p.valor.clave, cuota: p.valor.cuota, casa: p.valor.casa, color: 'text-amber-400' }
    : {
        etiqueta: 'Más probable', clave: p.probable.clave, cuota: p.mejor[p.probable.clave].cuota, casa: p.mejor[p.probable.clave].casa,
        color: p.probable.prob >= 0.55 ? 'text-green-400' : p.probable.prob >= 0.42 ? 'text-yellow-400' : 'text-orange-400'
      };
  const retornoBruto = stake * sel.cuota;
  const beneficioNeto = retornoBruto - stake;

  const insigniaValor = p.valor
    ? `<span class="badge-valor" title="La mejor cuota supera la probabilidad justa del mercado. Puede ser también una línea desactualizada: compruébala antes de apostar.">💎 Valor +${(p.valor.ventaja * 100).toFixed(1)}%</span>`
    : '';

  const goles = p.over25 === null
    ? 'No disponible'
    : `Más de 2.5: ${pct(p.over25)} · Menos: ${pct(1 - p.over25)}`;

  return `
    <article class="card-glass rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
      <div class="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div class="text-xs text-slate-400 w-full lg:w-auto text-center lg:text-left">
          ${esc(FECHA.format(p.fecha))} <span class="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 ml-1">${p.casas} casas</span>
        </div>

        <!-- Equipos con escudos -->
        <div class="flex items-center justify-center gap-2 sm:gap-4 w-full lg:w-auto">
          <div class="flex items-center gap-2 justify-end w-36 sm:w-40">
            <span class="font-bold text-right text-xs sm:text-sm truncate" title="${esc(p.local)}">${esc(p.local)}</span>
            ${imgEscudo(buscarEscudo(p.local), p.local)}
          </div>
          <span class="text-slate-500 font-extrabold text-xs">VS</span>
          <div class="flex items-center gap-2 w-36 sm:w-40">
            ${imgEscudo(buscarEscudo(p.visitante), p.visitante)}
            <span class="font-bold text-left text-xs sm:text-sm truncate" title="${esc(p.visitante)}">${esc(p.visitante)}</span>
          </div>
        </div>

        <!-- Mejor cuota de cada resultado y probabilidad justa -->
        <div class="flex items-center justify-center gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700/60 w-full sm:w-auto">
          ${celdaCuota(p, 'local', '1', '')}
          ${celdaCuota(p, 'empate', 'X', 'border-x border-slate-700/60')}
          ${celdaCuota(p, 'visitante', '2', '')}
        </div>
      </div>

      <!-- Mercados analizados (datos reales del mercado) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">⚽ Goles:</span>
          <span class="font-bold text-slate-200">${goles}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2">
          <span class="text-slate-400">🛡️ Cobertura ${esc(p.cobertura.etiqueta)}:</span>
          <span class="font-bold text-slate-200">${pct(p.cobertura.prob)}</span>
        </div>
        <div class="flex items-center justify-between sm:justify-start gap-2" title="Margen medio que se quedan las casas">
          <span class="text-slate-400">Margen casas:</span>
          <span class="font-bold text-slate-200">${(p.margen * 100).toFixed(1)}%</span>
        </div>
      </div>

      <!-- Pronóstico y retorno financiero -->
      <div class="bg-slate-900/90 p-3 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-3 border border-slate-700/50">
        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
          ${insigniaValor}
          <span class="text-xs text-slate-400">${sel.etiqueta}:</span>
          <span class="text-xs font-bold ${sel.color}">${esc(nombreResultado(p, sel.clave))} (${pct(p.justa[sel.clave])}) · cuota ${sel.cuota.toFixed(2)} en ${esc(sel.casa)}</span>
        </div>

        <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-between">
          <div class="text-xs text-left sm:text-right">
            <div class="text-[10px] text-slate-500">Simulando ${esc(EUR.format(stake))}</div>
            <div><span class="text-slate-400">Retorno bruto:</span> <strong class="text-slate-200">${esc(EUR.format(retornoBruto))}</strong></div>
            <div><span class="text-slate-400">Beneficio neto:</span> <strong class="text-green-400">+${esc(EUR.format(beneficioNeto))}</strong></div>
          </div>

          <a href="https://www.bet365.com" target="_blank" rel="noopener noreferrer" class="btn-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl text-center active:scale-95 transition">
            Apostar
          </a>
        </div>
      </div>
    </article>`;
}

function renderizarPartidos() {
  const container = document.getElementById('partidos-container');
  if (!container) return;

  const inputStake = document.getElementById('input-stake');
  const valor = parseFloat(inputStake ? inputStake.value : 10);
  const stake = Number.isFinite(valor) ? Math.min(Math.max(valor, 1), 10000) : 10;

  setEstado(textoEstado());

  // Solo partidos que aún no han empezado, ordenados por fecha
  let lista = partidosAnalizados.filter((p) => p.fecha.getTime() > Date.now());
  lista.sort((a, b) => a.fecha - b.fecha);

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">No hay partidos próximos disponibles en este momento.</p>';
    return;
  }

  if (soloValor) lista = lista.filter((p) => p.valor);

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">Ninguna cuota supera ahora mismo la probabilidad del mercado. Es normal: el mercado suele estar bien ajustado.</p>';
    return;
  }

  container.innerHTML = lista.slice(0, MAX_PARTIDOS).map((p) => tarjetaPartido(p, stake)).join('');
}

function cambiarLiga(codigo) {
  if (codigo === ligaActual && partidosAnalizados.length) return;
  ligaActual = codigo;
  document.querySelectorAll('.liga-btn').forEach(btn => {
    btn.classList.remove('btn-primary', 'text-white');
    btn.classList.add('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
  });
  const btnActivo = document.getElementById(`btn-${codigo}`);
  if (btnActivo) {
    btnActivo.classList.remove('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
    btnActivo.classList.add('btn-primary', 'text-white');
  }

  cargarPartidos(codigo);
}

function toggleSoloValor() {
  soloValor = !soloValor;
  const btn = document.getElementById('btn-solo-valor');
  if (btn) {
    btn.setAttribute('aria-pressed', String(soloValor));
    if (soloValor) {
      btn.classList.remove('bg-slate-800/90', 'border-slate-700/80', 'text-slate-300');
      btn.classList.add('bg-amber-600', 'border-amber-500', 'text-white');
    } else {
      btn.classList.remove('bg-amber-600', 'border-amber-500', 'text-white');
      btn.classList.add('bg-slate-800/90', 'border-slate-700/80', 'text-slate-300');
    }
  }
  renderizarPartidos();
}

function actualizarSimulacion() {
  renderizarPartidos();
}

// Vuelve a pedir las cuotas saltándose la caché (gasta créditos de la API)
function recargar() {
  cargarPartidos(ligaActual, true);
}

document.addEventListener('DOMContentLoaded', () => cargarPartidos('PD'));
