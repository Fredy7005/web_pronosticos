// ===================== ESTADO GLOBAL =====================
let ligaActual = 'PD';
let partidosAnalizados = [];
let datosGlobales = null;

// ===================== DICCIONARIO DE LIGAS =====================
const nombresLigas = {
    PD: "La Liga (España)",
    SD: "Segunda División (España)",
    PL: "Premier League (Inglaterra)",
    CL: "UEFA Champions League",
    SA: "Serie A (Italia)",
    BL: "Bundesliga (Alemania)",
    L1: "Ligue 1 (Francia)",
    EL: "UEFA Europa League",
    ECL: "UEFA Conference League",
    ED: "Eredivisie (Países Bajos)",
    PPL: "Primeira Liga (Portugal)",
    ELC: "Championship (Inglaterra)",
    MLS: "MLS (EE. UU. / Canadá)",
    BR: "Brasileirão (Brasil)",
    MX: "Liga MX (México)",
    ARG: "Primera División (Argentina)",
    BEL: "Jupiler Pro League (Bélgica)",
    TUR: "Süper Lig (Turquía)",
    COL: "Primera A (Colombia)",
    URU: "Primera División (Uruguay)",
    JPN: "J1 League (Japón)",
    KOR: "K League 1 (Corea del Sur)",
    AUS: "A-League (Australia)"
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

// ===================== MOTOR DE ANÁLISIS ESTADÍSTICO =====================
function analizarPartido(partido, index) {
    const claves = ['local', 'empate', 'visitante'];
    let cuotasSeleccionadas = null;
    let nombreCasa = 'Bet365';

    if (partido.bookmakers && partido.bookmakers.length > 0) {
        const bet365Book = partido.bookmakers.find(b => b.title.toLowerCase() === 'bet365') || partido.bookmakers[0];
        const mercado = (bet365Book.markets || []).find(m => m.key === 'h2h');
        
        if (mercado && mercado.outcomes) {
            const precio = (nombre) => mercado.outcomes.find(o => o.name === nombre)?.price;
            const q = {
                local: precio(partido.home_team),
                empate: precio('Draw'),
                visitante: precio(partido.away_team)
            };
            if (claves.every(k => Number.isFinite(q[k]) && q[k] > 1)) {
                cuotasSeleccionadas = q;
                nombreCasa = bet365Book.title || 'Bet365';
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
        probable,
        justa,
        cuotasOriginales: cuotasSeleccionadas,
        etiquetaConfianza,
        mejorCuota: mejor[probable.clave],
        resultadoSugerido: probable.clave,
        probabilidadAcierto: probable.prob,
        tendenciaGoles: probable.prob > 0.55 ? "Más de 2.5 Goles (Alta prob.)" : "Más de 1.5 Goles (Seguro)",
        ambosMarcanTexto: probable.prob < 0.50 ? "SÍ (Alta probabilidad ofensiva)" : "NO (Partido cerrado)",
        tendenciaCorners: "Más de 9.5 Córners (Ritmo alto)"
    };
}

// ===================== CARGA DE DATOS ESTÁTICOS =====================
async function cargarDatosLigas(codigoLiga = 'PD') {
    const estadoDiv = document.getElementById('estado-datos') || document.getElementById('estado');
    if (estadoDiv) estadoDiv.textContent = 'Cargando base de datos estática...';

    try {
        const respuesta = await fetch("datos-ligas.json?" + new Date().getTime());
        if (!respuesta.ok) throw new Error("No se pudo cargar el archivo de datos estáticos.");
        
        datosGlobales = await respuesta.json();
        
        if (estadoDiv) {
            if (datosGlobales.restantes !== null) {
                estadoDiv.innerHTML = `🟢 Base de datos diaria activa | Créditos restantes en API: <b>${datosGlobales.restantes}</b>`;
            } else {
                estadoDiv.innerHTML = `🟢 Base de datos diaria sincronizada (0 peticiones en vivo)`;
            }
        }

        procesarLiga(codigoLiga);
    } catch (error) {
        console.error("Error al cargar datos:", error);
        if (estadoDiv) estadoDiv.textContent = '⚠️ Error al cargar datos. Ejecuta el workflow en GitHub.';
        mostrarError(error.message);
    }
}

function procesarLiga(codigoLiga) {
    ligaActual = codigoLiga;
    if (!datosGlobales || !datosGlobales.ligas || !datosGlobales.ligas[codigoLiga]) {
        mostrarError(`No hay partidos próximos para ${nombresLigas[codigoLiga] || codigoLiga}. El robot se la ha saltado para ahorrar créditos.`);
        partidosAnalizados = [];
        return;
    }

    const partidosBrutos = datosGlobales.ligas[codigoLiga];
    partidosAnalizados = partidosBrutos.map((p, idx) => analizarPartido(p, idx)).filter(Boolean);
    renderizarPartidos();
}

// ===================== RENDERIZADO =====================
function renderizarPartidos() {
    const container = document.getElementById('partidos-container');
    if (!container) return;

    const inputStake = document.getElementById('input-stake');
    const stake = Math.min(Math.max(parseFloat(inputStake?.value) || 10, 1), 10000);

    let lista = partidosAnalizados.filter((p) => p.fecha.getTime() > Date.now());

    if (lista.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                <p class="text-lg font-medium">No hay partidos próximos programados para ${nombresLigas[ligaActual] || ligaActual}.</p>
                <p class="text-xs text-slate-500 mt-2">El robot inteligente omitió esta liga para optimizar tus créditos gratuitos.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map((p) => {
        const cuotaFinal = p.mejorCuota.cuota;
        const retornoBruto = stake * cuotaFinal;
        const beneficioNeto = retornoBruto - stake;
        const textoRecomendacion = descripcionApuesta(p, p.resultadoSugerido);

        return `
            <article onclick="abrirDetallePartido(${p.id})" class="card-glass bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:border-slate-500/50 transition duration-200 group shadow-lg">
                <div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-700/40 pb-3">
                    <span>📅 ${esc(FECHA.format(p.fecha))}</span>
                    <div class="flex items-center gap-2">
                        <span class="text-slate-400">${p.etiquetaConfianza}</span>
                        <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded group-hover:bg-slate-700 group-hover:text-white transition">🔍 Ver Más</span>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-2 my-1">
                    <div class="flex items-center gap-3 w-5/12 justify-end">
                        <span class="font-bold text-right text-sm md:text-base truncate">${esc(p.local)}</span>
                        <img src="${esc(buscarEscudo(p.local))}" class="w-7 h-7 object-contain shrink-0" alt="${esc(p.local)}">
                    </div>
                    <span class="text-slate-500 font-black text-xs px-2">VS</span>
                    <div class="flex items-center gap-3 w-5/12 justify-start">
                        <img src="${esc(buscarEscudo(p.visitante))}" class="w-7 h-7 object-contain shrink-0" alt="${esc(p.visitante)}">
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
                        <span class="font-bold text-slate-200
