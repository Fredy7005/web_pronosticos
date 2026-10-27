const fs = require('fs');
const https = https; // o require('https');

const API_KEY = process.env.ODDS_API_KEY; 
const LIGA = 'soccer_italy_serie_a'; 
const REGIONS = 'eu';
// Añadimos los mercados adicionales de córners, tarjetas o props si tu plan los admite
const MARKETS = 'h2h,totals,spreads,doublechance,btts,team_corners,player_shots_on_target';

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

            const estructuraFinal = {
                restantes: parseInt(remainingRequests) || 0,
                ligas: {
                    "SA": partidosAPI.map((p, idx) => ({
                        id: `match_${idx}_${Date.now()}`,
                        sport_key: p.sport_key,
                        commence_time: p.commence_time,
                        home_team: p.home_team,
                        away_team: p.away_team,
                        bookmakers: p.bookmakers
                    }))
                }
            };

            fs.writeFileSync('datos-ligas.json', JSON.stringify(estructuraFinal, null, 2));
            console.log('¡Archivo datos-ligas.json actualizado con todos los mercados!');
        });

    }).on('error', (err) => {
        console.error('Error en la petición HTTP:', err.message);
        process.exit(1);
    });
}

obtenerDatosAPI();
