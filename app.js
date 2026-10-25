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

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ===================== CONFIGURACIÓN GENERAL =====================

const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27';

const LIGAS_ODDS = {
  'PD': ['soccer_spain_la_liga'],
  'SD': ['soccer_spain_segunda_division'],
  'PL': ['soccer_epl'],
  'CL': ['soccer_uefa_champs_league'],
  'SA': ['soccer_italy_serie_a'],
  'BL': ['soccer_germany_bundesliga'],
  'L1': ['soccer_france_ligue_one'],
  'EL': ['soccer_uefa_europa_league'],
  'ECL': ['soccer_uefa_europa_conference_league'],
  'ED': ['soccer_netherlands_eredivisie'],
  'PPL': ['soccer_portugal_primeira_liga'],
  'ELC': ['soccer_efl_champ'],
  'MLS': ['soccer_usa_mls'],
  'BR': ['soccer_brazil_campeonato'],
  'MX': ['soccer_mexico_ligamx'],
  'ARG': ['soccer_argentina_primera_division'],
  'BEL': ['soccer_belgium_first_div'],
  'TUR': ['soccer_turkey_super_league', 'soccer_turkey_super_lig'],
  'COL': ['soccer_colombia_primera_a', 'soccer_conmebol_copa_libertadores'],
  'URU': ['soccer_uruguay_primera_division', 'soccer_chile_campeonato'],
  'JPN': ['soccer_japan_j_league'],
  'KOR': ['soccer_korea_kleague1', 'soccer_k_league_1'],
  'AUS': ['soccer_australia_aleague']
};

const UMBRAL_VALOR = 0.02;
const MAX_PARTIDOS = 15;
const TTL_CUOTAS_MIN = 30;

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
const media = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

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
      dbEstatica = await res.json();
      return dbEstatica;
    }
  } catch (e) {
    console.warn('Usando respaldo alternativo.');
  }
  return null;
}

async function obtenerDatosLiga(codigoLiga) {
  const clavesCandidatas = LIGAS_ODDS[codigoLiga];
  if (!clavesCandidatas) throw new Error(`La liga (${codigoLiga}) no está configurada.`);

  const estatico = await cargarArchivoEstatico();
  if (estatico && estatico.ligas && Array.isArray(estatico.ligas[codigoLiga])) {
    return {
      partidos: estatico.ligas[codigoLiga],
      restantes: estatico.restantes,
      origen: 'robot'
    };
  }

  for (const sportKey of clavesCandidatas) {
    const storageKey = 'sp_v3:odds:' + sportKey;
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(storageKey)); } catch {}

    if (guardado && Date.now() - guardado.t < TTL_CUOTAS_MIN * 60000) {
      return { partidos: guardado.datos.partidos, restantes: guardado.datos.restantes, origen: 'cache' };
    }

    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`
    );

    if (res.ok) {
      const partidos = await res.json();
      const restantes = res.headers.get('x-requests-remaining');
      try {
        localStorage.setItem(storageKey, JSON.stringify({ t: Date.now(), datos: { partidos, restantes } }));
      } catch {}
      return { partidos, restantes, origen: 'api' };
    }

    if (res.status === 404 || res.status === 422) {
      continue;
    } else {
      throw new Error(`Error al conectar (${res.status})`);
    }
  }

  return { partidos: [], restantes: null, origen: 'sin_jornada' };
}

// ===================== MOTOR DE ANÁLISIS =====================

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
    tendenciaCorners
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

// ===================== RENDERIZADO =====================

async function cargarPartidos(codigoLiga = 'PD') {
  const id = ++cargaId;
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

function renderizarPartidos(origen = 'robot', restantes = null) {
  const container = document.getElementById('partidos-container');
  if (!container) return;

  const inputStake = document.getElementById('input-stake');
  const stake = Math.min(Math.max(parseFloat(inputStake?.value) || 10, 1), 10000);

  let lista = partidosAnalizados.filter((p) => {
    const esFuturo = p.fecha.getTime() > Date.now();
    return modoHistorial ? !esFuturo : esFuturo;
  });

  if (modoHistorial) {
    setEstado('📜 Mostrando historial de partidos finalizados con todos sus pronósticos');
  } else {
    setEstado(restantes ? `🟢 Base de datos activa | Créditos API: ${restantes}` : '⚡ Datos sincronizados correctamente');
  }

  if (lista.length === 0) {
    container.innerHTML = `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-slate-400 text-center text-sm">${modoHistorial ? 'No hay partidos en el historial para esta competición.' : 'No hay partidos próximos programados en este momento.'}</div>`;
    return;
  }

  container.innerHTML = lista.slice(0, MAX_PARTIDOS).map((p) => tarjetaPartido(p, stake)).join('');
}

function toggleVistaHistorial() {
  modoHistorial = !modoHistorial;
  const btnHistorial = document.getElementById('btn-vista-historial');

  if (modoHistorial) {
    if (btnHistorial) {
      btnHistorial.textContent = '⚽ Ver Próximos';
      btnHistorial.classList.add('bg-emerald-600', 'text-white');
    }
  } else {
    if (btnHistorial) {
      btnHistorial.textContent = '📜 Ver Historial';
      btnHistorial.classList.remove('bg-emerald-600', 'text-white');
    }
  }
  renderizarPartidos();
}

function cambiarLiga(codigo) {
  if (codigo === ligaActual && partidosAnalizados.length) return;
  ligaActual = codigo;
  document.querySelectorAll('.liga-btn').forEach(btn => {
    btn.classList.remove('bg-emerald-600', 'text-white', 'font-bold', 'shadow');
    btn.classList.add('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
  });
  const btnActivo = document.getElementById(`btn-${codigo}`);
  if (btnActivo) {
    btnActivo.classList.remove('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
    btnActivo.classList.add('bg-emerald-600', 'text-white', 'font-bold', 'shadow');
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

// ===================== AUTENTICACIÓN REAL CON FIREBASE =====================

auth.onAuthStateChanged((user) => {
  const headerBtns = document.querySelector('header .flex.items-center.flex-wrap.gap-2\\.5');
  if (!headerBtns) return;

  // Buscar si ya existe el bloque dinámico de sesión
  let authContainer = document.getElementById('auth-user-container');
  if (!authContainer) {
    authContainer = document.createElement('div');
    authContainer.id = 'auth-user-container';
    authContainer.className = 'flex items-center gap-2';
    // Insertarlo antes del indicador de edad (+18)
    headerBtns.insertBefore(authContainer, headerBtns.lastElementChild);
  }

  if (user) {
    authContainer.innerHTML = `
      <span class="text-xs text-emerald-400 font-bold hidden md:inline">👤 ${esc(user.email)}</span>
      <button onclick="cerrarSesionFirebase()" class="bg-slate-900 hover:bg-red-950/60 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-900 text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow">
        🚪 Salir
      </button>
    `;
    // Ocultar botones de login/registro de invitados si ya está dentro
    document.getElementById('btn-login-header')?.remove();
    document.getElementById('btn-registro-header')?.remove();
  } else {
    authContainer.innerHTML = `
      <button id="btn-login-header" onclick="abrirModalAuth('login')" class="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow flex items-center gap-1.5">
        🔑 Iniciar Sesión
      </button>
      <button id="btn-registro-header" onclick="abrirModalAuth('registro')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow flex items-center gap-1.5">
        📝 Registrarse
      </button>
    `;
  }
});

function abrirModalAuth(tipo = 'login') {
  const modal = document.getElementById('modal-auth');
  if (modal) {
    modal.classList.remove('hidden');
    cambiarTabAuth(tipo);
  }
}

function cerrarModalAuth() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.add('hidden');
}

function cambiarTabAuth(tipo) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegistro = document.getElementById('tab-registro');
  const contenido = document.getElementById('auth-contenido');

  if (!tabLogin || !tabRegistro || !contenido) return;

  if (tipo === 'login') {
    tabLogin.className = "flex-1 pb-3 text-xs font-bold text-emerald-400 border-b-2 border-emerald-500 transition";
    tabRegistro.className = "flex-1 pb-3 text-xs font-semibold text-slate-400 border-b-2 border-transparent transition";
    
    contenido.innerHTML = `
      <form onsubmit="manejarLogin(event)" class="flex flex-col gap-4">
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Correo Electrónico</label>
          <input type="email" id="login-email" required placeholder="tu@correo.com" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Contraseña</label>
          <input type="password" id="login-password" required placeholder="••••••••" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
        </div>
        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg mt-2">Acceder a SportPredicts</button>
      </form>
    `;
  } else {
    tabRegistro.className = "flex-1 pb-3 text-xs font-bold text-emerald-400 border-b-2 border-emerald-500 transition";
    tabLogin.className = "flex-1 pb-3 text-xs font-semibold text-slate-400 border-b-2 border-transparent transition";
    
    contenido.innerHTML = `
      <form onsubmit="manejarRegistro(event)" class="flex flex-col gap-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Correo Electrónico</label>
          <input type="email" id="reg-email" required placeholder="tu@correo.com" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Contraseña (mínimo 6 caracteres)</label>
          <input type="password" id="reg-password" required placeholder="••••••••" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
        </div>
        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg mt-2">Crear Cuenta Gratuita</button>
      </form>
    `;
  }
}

async function manejarLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    alert('¡Sesión iniciada con éxito!');
    cerrarModalAuth();
  } catch (err) {
    alert('Error al iniciar sesión: ' + err.message);
  }
}

async function manejarRegistro(e) {
  e.preventDefault();
  const email = document.getElementById('reg-email').value;
  const pass = document.getElementById('reg-password').value;
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    alert('¡Cuenta creada e iniciada con éxito!');
    cerrarModalAuth();
  } catch (err) {
    alert('Error al registrarse: ' + err.message);
  }
}

async function cerrarSesionFirebase() {
  try {
    await auth.signOut();
    alert('Has cerrado sesión correctamente.');
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('click', (e) => {
  const modalAuth = document.getElementById('modal-auth');
  if (e.target === modalAuth) cerrarModalAuth();
});

document.addEventListener('DOMContentLoaded', () => cargarPartidos('PD'));
