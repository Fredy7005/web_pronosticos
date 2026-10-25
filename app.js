// ===================== CONFIGURACIÓN =====================

const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27';

// Añadidas nuevas ligas europeas
const LIGAS_ODDS = {
  'PD': 'soccer_spain_la_liga',
  'PL': 'soccer_epl',
  'CL': 'soccer_uefa_champs_league',
  'SA': 'soccer_italy_serie_a',
  'BL': 'soccer_germany_bundesliga',
  'L1': 'soccer_france_ligue_1'
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

  // === OTRAS LIGAS (Se irán rellenando cuando subas sus escudos) ===
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
  if (!res.ok) throw new Error(`Error en la API (${res.status})`);
  return {
    actualizado: new Date().toISOString(),
    restantes: res.headers.get('x-requests-remaining'),
    partidos: await res.json()
  };
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

  try {
    const cuotas = await obtenerConCache(`odds:${codigoLiga}`, TTL_CUOTAS_MIN, () => pedirCuotas(sportKey));
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
  const btn = document.getElementById('btn-solo-valoor');
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

document.addEventListener('DOMContentLoaded', () => cargarPartidos('PD'));
