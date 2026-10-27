const fs = require('fs');
const https = require('https');

const API_KEY = process.env.ODDS_API_KEY; 
const LIGA = 'soccer_italy_serie_a'; // Solo Serie A
const REGIONS = 'eu'; // Región europea
// Solicitamos los mercados principales y avanzados disponibles en Europa
const MARKETS = 'h2h,totals,spreads,doublechance,btts';

const url = `https://api.the-odds-api.v4/sports/${LIGA}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=decimal`;

function obtenerDatosAPI() {
    https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`Error al conectar con la API: ${res.statusCode} - ${data}`);
                process.exit(1);
            }

            const partidosAPI = JSON.parse(data);
            const remainingRequests = res.headers['x-requests-remaining'];
            console.log(`Peticiones restantes en The Odds API: ${remainingRequests}`);

            // Filtramos o priorizamos las cuotas de Winamax si está disponible entre las casas europeas
            const partidosProcesados = partidosAPI.map((p, idx) => {
                // Buscamos si Winamax está en las casas devueltas para este partido
                const bookmakersFiltrados = p.bookmakers.filter(b => 
                    (b.title || '').toLowerCase().includes('winamax') || 
                    (b.key || '').toLowerCase().includes('winamax')
                );

                // Si Winamax está disponible, la ponemos primera; si no, dejamos las disponibles en eu
                const bookmakersFinales = bookmakersFiltrados.length > 0 
                    ? [...bookmakersFiltrados, ...p.bookmakers.filter(b => !b.title.toLowerCase().includes('winamax'))] 
                    : p.bookmakers;

                return {
                    id: `match_sa_${idx}_${Date.now()}`,
                    sport_key: p.sport_key,
                    commence_time: p.commence_time,
                    home_team: p.home_team,
                    away_team: p.away_team,
                    bookmakers: bookmakersFinales
                };
            });

            const estructuraFinal = {
                restantes: parseInt(remainingRequests) || 0,
                ligas: {
                    "SA": partidosProcesados
                }
            };

            fs.writeFileSync('datos-ligas.json', JSON.stringify(estructuraFinal, null, 2));
            console.log('¡Archivo datos-ligas.json actualizado exclusivamente para la Serie A con enfoque en Winamax!');
        });

    }).on('error', (err) => {
        console.error('Error en la petición HTTP:', err.message);
        process.exit(1);
    });
}

obtenerDatosAPI();
