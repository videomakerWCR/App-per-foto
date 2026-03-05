const { createClient } = require('@supabase/supabase-js');

/**
 * Script Keep-Alive per Supabase
 * Obiettivo: Generare attività casuale per evitare la sospensione del progetto.
 */

// Inizializzazione client (usa variabili d'ambiente per sicurezza)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function keepAlive() {
    console.log('--- Inizio keep-alive Supabase ---');

    // Numero casuale di azioni tra 3 e 15 (come richiesto)
    const numOfActions = Math.floor(Math.random() * 13) + 3;
    console.log(`Azioni da eseguire questa sessione: ${numOfActions}`);

    for (let i = 1; i <= numOfActions; i++) {
        // Probabilità di eseguire lo script (1 su 3 giorni di media)
        // Se vogliamo un intervallo 1-5, GitHub Actions gira ogni giorno
        // e noi decidiamo se agire o no.
        const shouldAct = Math.random() < 0.33; // ~33% di probabilità (media ogni 3gg)
        if (!shouldAct && i === 1) {
            console.log('Salto esecuzione per oggi (random logic).');
            return;
        }

        const action = Math.floor(Math.random() * 4) + 1;

        try {
            switch (action) {
                case 1:
                    console.log(`[${i}] Lettura sessioni...`);
                    await supabase.from('sessions').select('*').limit(5);
                    break;
                case 2:
                    console.log(`[${i}] Lettura foto...`);
                    await supabase.from('photos').select('*').limit(5);
                    break;
                case 3:
                    console.log(`[${i}] Lettura voti...`);
                    await supabase.from('user_votes').select('*').limit(5);
                    break;
                case 4:
                    console.log(`[${i}] Ciclo Scrittura/Cancellazione (Keep active)...`);
                    // Inserimento dummy
                    const { data: inserted, error: insError } = await supabase
                        .from('sessions')
                        .insert({ name: 'KEEP_ALIVE_TEMP', is_active: false })
                        .select();

                    if (insError) throw insError;

                    // Cancellazione immediata (pulizia)
                    if (inserted && inserted.length > 0) {
                        const { error: delError } = await supabase
                            .from('sessions')
                            .delete()
                            .eq('id', inserted[0].id);
                        if (delError) console.error('Errore pulizia dummy:', delError.message);
                        else console.log('   ✅ Pulizia effettuata correttamente.');
                    }
                    break;
            }
        } catch (err) {
            console.error(`Errore nell'azione ${i}:`, err.message);
        }

        // Piccolo delay tra un'api e l'altra
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('--- Keep-alive completato con successo ---');
}

keepAlive();
