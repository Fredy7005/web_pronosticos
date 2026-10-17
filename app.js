// Claves de ambas APIs
const ODDS_API_KEY = '2a11173b5f716f77724b660faf014a27'; // Para cuotas
const FOOTBALL_API_KEY = '726c6d912ebf9bb9415e9dfd0fb8a498'; // Para escudos y datos (API-Sports)

// Códigos de ligas para The Odds API
const LIGAS_ODDS = {
  'PD': 'soccer_spain_la_liga',
  'PL': 'soccer_epl',
  'CL': 'soccer_uefa_champs_league'
};

// IDs de ligas para API-Football (La Liga = 140, Premier = 39, Champions = 2)
const LIGAS_FOOTBALL_ID = {
  'PD': 140,
  'PL': 39,
  'CL': 2
};

let ligaActual = 'PD';
let soloTopPicks = false;
let partidosCargados = [];

// Motor de pronósticos avanzados (Goles, BTTS, Córners y Resultado)
function analizarPartidoCompleto(cLocal, cEmpate, cVisitante, eLocal, eVisitante) {
  if (cLocal === '-' || cVisitante === '-') {
    return {
      resultado: { texto: 'Sin datos suficientes', confianza: 'Baja', esTop: false, color: 'text-slate-400', cuotaSugerida: 1 },
      btts: 'No determinado',
      goles: 'Más de 1.5 Goles',
      corners: 'Más de 8.5 Córners'
    };
  }

  const oddsL = parseFloat(cLocal);
  const oddsE = parseFloat(cEmpate);
  const oddsV = parseFloat(cVisitante);

  const probL = (1 / oddsL) * 100;
  const probV = (1 / oddsV) * 100;

  let res = {};
  if (probL > 55) {
    res = { texto: `Victoria ${eLocal}`, confianza: 'Alta', esTop: true, color: 'text-green-400', cuotaSugerida: oddsL };
  } else if (probV > 55) {
    res = { texto: `Victoria ${eVisitante}`, confianza: 'Alta', esTop: true, color: 'text-green-400', cuotaSugerida: oddsV };
  } else if (probL > 40 && probL > probV) {
    res = { texto: `1X (${eLocal} o Empate)`, confianza: 'Media', esTop: false, color: 'text-yellow-400', cuotaSugerida: Math.min(oddsL, oddsE) };
  } else if (probV > 40 && probV > probL) {
    res = { texto: `X2 (${eVisitante} o Empate)`, confianza: 'Media', esTop: false, color: 'text-yellow-400', cuotaSugerida: Math.min(oddsV, oddsE) };
  } else {
    res = { texto: 'Partido Igualado (1X2)', confianza: 'Riesgo Alto', esTop: false, color: 'text-orange-400', cuotaSugerida: 1.5 };
  }

  const btts = (probL > 35 && probV > 35) ? 'SÍ (Ambos Marcan)' : 'NO';
  const goles = (oddsL < 2.2 && oddsV < 2.2) ? 'Más de 2.5 Goles' : 'Menos de 2.5 Goles';
  const corners = (probL > 50 || probV > 50) ? 'Más de 9.5 Córners' : 'Más de 8.5 Córners';

  return { resultado: res, btts, goles, corners };
}

async function cargarPartidos(codigoLiga = 'PD') {
  const container = document.getElementById('partidos-container');
  container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">Sincronizando cuotas y escudos oficiales de API-Sports...</p>';

  const sportKey = LIGAS_ODDS[codigoLiga] || LIGAS_ODDS['PD'];
  const leagueId = LIGAS_FOOTBALL_ID[codigoLiga] || 140;
  const currentYear = new Date().getFullYear();

  try {
    // 1. Petición simultánea a The Odds API (Cuotas) y API-Football (Escudos y datos oficiales)
    const [responseOdds, responseFootball] = await Promise.all([
      fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&dateFormat=iso`),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${currentYear}&next=10`, {
        headers: {
          'x-apisports-key': FOOTBALL_API_KEY
        }
      })
    ]);

    if (!responseOdds.ok) throw new Error('Error al conectar con The Odds API');
    
    const dataOdds = await responseOdds.json();
    
    // Intentamos extraer escudos de API-Football si la petición es exitosa
    let mapEscudos = {};
    if (responseFootball.ok) {
      const dataFootball = await responseFootball.json();
      if (dataFootball.response && dataFootball.response.length > 0) {
        dataFootball.response.forEach(item => {
          mapEscudos[item.teams.home.name.toLowerCase()] = item.teams.home.logo;
          mapEscudos[item.teams.away.name.toLowerCase()] = item.teams.away.logo;
        });
      }
    }

    partidosCargados = dataOdds;
    // Guardamos temporalmente el mapa de escudos en la variable global
    window.escudosEquipos = mapEscudos;

    renderizarPartidos();

  } catch (error) {
    console.error('Error:', error);
    container.innerHTML = `<p class="text-red-400 text-center py-16 text-sm">Error al sincronizar las APIs (${error.message}).</p>`;
  }
}

function renderizarPartidos() {
  const container = document.getElementById('partidos-container');
  const stake = parseFloat(document.getElementById('input-stake').value) || 10;
  const mapEscudos = window.escudosEquipos || {};

  if (!partidosCargados || partidosCargados.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">No hay partidos disponibles en este momento.</p>';
    return;
  }

  container.innerHTML = '';

  let filtrados = partidosCargados;

  if (soloTopPicks) {
    filtrados = filtrados.filter(partido => {
      const bookmaker = partido.bookmakers && partido.bookmakers[0];
      let cL = '-', cV = '-';
      if (bookmaker && bookmaker.markets && bookmaker.markets[0]) {
        bookmaker.markets[0].outcomes.forEach(out => {
          if (out.name === partido.home_team) cL = out.price;
          else if (out.name === partido.away_team) cV = out.price;
        });
      }
      const p = analizarPartidoCompleto(cL, '-', cV, partido.home_team, partido.away_team);
      return p.resultado.esTop;
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-16 text-sm">No se encontraron "Top Picks" con alta confianza en esta jornada.</p>';
    return;
  }

  filtrados.slice(0, 10).forEach(partido => {
    const fecha = new Date(partido.commence_time).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const bookmaker = partido.bookmakers && partido.bookmakers[0];
    let cuotaLocal = '-', cuotaEmpate = '-', cuotaVisitante = '-';

    if (bookmaker && bookmaker.markets && bookmaker.markets[0]) {
      const outcomes = bookmaker.markets[0].outcomes;
      outcomes.forEach(out => {
        if (out.name === partido.home_team) cuotaLocal = out.price;
        else if (out.name === partido.away_team) cuotaVisitante = out.price;
        else if (out.name === 'Draw') cuotaEmpate = out.price;
      });
    }

    const analisis = analizarPartidoCompleto(cuotaLocal, cuotaEmpate, cuotaVisitante, partido.home_team, partido.away_team);
    const gananciaEstimada = (stake * analisis.resultado.cuotaSugerida).toFixed(2);

    // Buscamos el escudo oficial de API-Sports o usamos un marcador de respaldo
    const logoLocal = mapEscudos[partido.home_team.toLowerCase()] || '';
    const logoVisitante = mapEscudos[partido.away_team.toLowerCase()] || '';

    const card = document.createElement('div');
    card.className = 'card-glass rounded-2xl p-5 flex flex-col gap-4';

    card.innerHTML = `
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="text-xs text-slate-400 w-full md:w-auto text-center md:text-left">${fecha}</div>
        
        <!-- Equipos con Escudos Oficiales de API-Sports -->
        <div class="flex items-center justify-center gap-4 w-full md:w-auto">
          <div class="flex items-center gap-2 justify-end w-40">
            <span class="font-bold text-right text-sm truncate" title="${partido.home_team}">${partido.home_team}</span>
            ${logoLocal ? `<img src="${logoLocal}" class="w-6 h-6 object-contain" alt="local">` : ''}
          </div>
          <span class="text-slate-500 font-extrabold text-xs">VS</span>
          <div class="flex items-center gap-2 w-40">
            ${logoVisitante ? `<img src="${logoVisitante}" class="w-6 h-6 object-contain" alt="visitante">` : ''}
            <span class="font-bold text-left text-sm truncate" title="${partido.away_team}">${partido.away_team}</span>
          </div>
        </div>

        <!-- Panel de Cuotas 1X2 -->
        <div class="flex items-center gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700/60">
          <div class="text-center px-2.5">
            <div class="text-[10px] text-slate-400 font-bold">1</div>
            <div class="text-xs font-bold text-green-400">${cuotaLocal}</div>
          </div>
          <div class="text-center px-2.5 border-x border-slate-700/60">
            <div class="text-[10px] text-slate-400 font-bold">X</div>
            <div class="text-xs font-bold text-yellow-400">${cuotaEmpate}</div>
          </div>
          <div class="text-center px-2.5">
            <div class="text-[10px] text-slate-400 font-bold">2</div>
            <div class="text-xs font-bold text-green-400">${cuotaVisitante}</div>
          </div>
        </div>
      </div>

      <!-- Panel Multimercado (Goles, BTTS, Córners) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-slate-400">⚽ Goles:</span>
          <span class="font-bold text-slate-200">${analisis.goles}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-slate-400">🔄 Ambos Marcan:</span>
          <span class="font-bold text-slate-200">${analisis.btts}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-slate-400">🚩 Córners:</span>
          <span class="font-bold text-slate-200">${analisis.corners}</span>
        </div>
      </div>

      <!-- Barra de Pronóstico Principal & Apuesta -->
      <div class="bg-slate-900/90 p-3 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-3 border border-slate-700/50">
        <div class="flex items-center gap-2">
          ${analisis.resultado.esTop ? '<span class="text-[11px] bg-amber-500/20 text-amber-400 font-bold px-2.5 py-0.5 rounded-lg border border-amber-500/30">🔥 Top Pick</span>' : ''}
          <span class="text-xs text-slate-400">Recomendación:</span>
          <span class="text-xs font-bold ${analisis.resultado.color}">${analisis.resultado.texto}</span>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-xs text-right">
            <span class="text-slate-400">Retorno est. (${stake}€):</span>
            <span class="font-extrabold text-green-400 ml-1">${gananciaEstimada}€</span>
          </div>

          <a href="https://www.bet365.com" target="_blank" rel="noopener noreferrer" class="btn-primary text-white text-xs font-bold px-4 py-2 rounded-xl text-center">
            Apostar
          </a>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function cambiarLiga(codigo) {
  ligaActual = codigo;
  document.querySelectorAll('.liga-btn').forEach(btn => {
    btn.classList.remove('btn-primary', 'text-white');
    btn.classList.add('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
  });
  const btnActivo = document.getElementById(`btn-${codigo}`);
  btnActivo.classList.remove('bg-slate-800/80', 'hover:bg-slate-700', 'text-slate-300', 'border', 'border-slate-700/60');
  btnActivo.classList.add('btn-primary', 'text-white');

  cargarPartidos(codigo);
}

function toggleTopPicks() {
  soloTopPicks = !soloTopPicks;
  const btn = document.getElementById('btn-top-picks');
  if (soloTopPicks) {
    btn.classList.remove('bg-slate-800/90', 'border-slate-700/80', 'text-slate-300');
    btn.classList.add('bg-amber-600', 'border-amber-500', 'text-white');
  } else {
    btn.classList.remove('bg-amber-600', 'border-amber-500', 'text-white');
    btn.classList.add('bg-slate-800/90', 'border-slate-700/80', 'text-slate-300');
  }
  renderizarPartidos();
}

function actualizarSimulacion() {
  renderizarPartidos();
}

document.addEventListener('DOMContentLoaded', () => cargarPartidos('PD'));