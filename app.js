// ===================== CONFIGURACIÓN =====================

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

// ===================== 🟢 ESCUDOS MANUALES 🟢 =====================

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
    tendenciaGoles: probable.prob > 0.55 ? "Más de 2.5 Goles" : "Más de 1.5 Goles",
    ambosMarcanTexto: probable.prob < 0.50 ? "SÍ (Alta probabilidad)" : "NO (Partido cerrado)",
    tendenciaCorners: "Más de 9.5 Córners"
  };
}

// ===================== CARGA Y RENDERIZADO =====================

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
  const retornoBruto = stake * cuotaFinal;
  const beneficioNeto = retornoBruto - stake;
  const textoRecomendacion = descripcionApuesta(p, p.resultadoSugerido);

  return `
    <article onclick="abrirDetallePartido(${p.id})" class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:border-slate-600 transition duration-200 group shadow-lg">
      <div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-3">
        <span>📅 ${esc(FECHA.format(p.fecha))}</span>
        <div class="flex items-center gap-2">
          ${modoHistorial ? '<span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold text-[10px]">🏁 Finalizado</span>' : (p.esOportunidadTop ? '<span class="bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-lg border border-amber-500/30">💎 Oportunidad Destacada</span>' : `<span class="text-slate-400">${p.etiquetaConfianza}</span>`)}
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

      <div class="bg-slate-950/80 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-800">
        <div class="text-center sm:text-left">
          <div class="text-[11px] text-slate-400 font-medium">${modoHistorial ? 'Pronóstico que se realizó:' : 'Pronóstico recomendado:'}</div>
          <div class="text-sm sm:text-base font-extrabold text-emerald-400">${esc(textoRecomendacion)}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">Cuota: <strong class="text-white">${cuotaFinal.toFixed(2)}</strong></div>
        </div>
        <div class="text-right text-xs">
          <div class="text-slate-400">Beneficio potencial:</div>
          <div class="text-sm font-extrabold text-emerald-400">+${esc(EUR.format(beneficioNeto))}</div>
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
    <div class="grid grid-cols-3 gap-2 text-center text-xs mb-4">
      <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
        <div class="text-slate-400">1 (Local)</div>
        <div class="text-base font-extrabold text-emerald-400 mt-1">${pctLocal}%</div>
      </div>
      <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
        <div class="text-slate-400">X (Empate)</div>
        <div class="text-base font-extrabold text-amber-400 mt-1">${pctEmpate}%</div>
      </div>
      <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
        <div class="text-slate-400">2 (Visitante)</div>
        <div class="text-base font-extrabold text-blue-400 mt-1">${pctVisitante}%</div>
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
    setEstado('📜 Mostrando historial de partidos finalizados');
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
  const controlesDerecha = document.getElementById('controles-derecha');

  if (modoHistorial) {
    if (btnHistorial) {
      btnHistorial.textContent = '⚽ Ver Próximos';
      btnHistorial.classList.add('bg-emerald-600', 'text-white');
    }
    if (controlesDerecha) controlesDerecha.style.opacity = '0.4';
  } else {
    if (btnHistorial) {
      btnHistorial.textContent = '📜 Ver Historial';
      btnHistorial.classList.remove('bg-emerald-600', 'text-white');
    }
    if (controlesDerecha) controlesDerecha.style.opacity = '1';
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

document.addEventListener('DOMContentLoaded', () => cargarPartidos('PD'));
