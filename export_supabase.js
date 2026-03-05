const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Configurazione Supabase (presa da app.js)
const SUPABASE_URL = 'https://eactwaokrdcuonkarsej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhY3R3YW9rcmRjdW9ua2Fyc2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjM2NTMsImV4cCI6MjA4NjYzOTY1M30.yXPlYLap_i3JV52eAePsglHe6EkgR_Qc-Zqj7R2GmoI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXPORT_DIR = path.join(__dirname, 'supabase_export');
const IMAGES_DIR = path.join(EXPORT_DIR, 'images');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function exportData() {
    console.log('🚀 Inizio esportazione da Supabase...');

    // Crea cartelle
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR);
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);
    if (!fs.existsSync(path.join(IMAGES_DIR, 'originals'))) fs.mkdirSync(path.join(IMAGES_DIR, 'originals'));
    if (!fs.existsSync(path.join(IMAGES_DIR, 'optimized'))) fs.mkdirSync(path.join(IMAGES_DIR, 'optimized'));

    try {
        // 1. Esporta Sessioni
        console.log('--- Esportazione Sessioni ---');
        const { data: sessions, error: sError } = await supabase.from('sessions').select('*');
        if (sError) throw sError;
        fs.writeFileSync(path.join(EXPORT_DIR, 'sessions.json'), JSON.stringify(sessions, null, 2));
        console.log(`✅ ${sessions.length} sessioni salvate.`);

        // 2. Esporta Foto (metadati)
        console.log('--- Esportazione Foto ---');
        const { data: photos, error: pError } = await supabase.from('photos').select('*');
        if (pError) throw pError;
        fs.writeFileSync(path.join(EXPORT_DIR, 'photos.json'), JSON.stringify(photos, null, 2));
        console.log(`✅ ${photos.length} record foto salvati.`);

        // 3. Esporta Voti
        console.log('--- Esportazione Voti ---');
        const { data: votes, error: vError } = await supabase.from('user_votes').select('*');
        if (vError) throw vError;
        fs.writeFileSync(path.join(EXPORT_DIR, 'votes.json'), JSON.stringify(votes, null, 2));
        console.log(`✅ ${votes.length} voti salvati.`);

        // 4. Download Immagini
        console.log('--- Download Immagini (può richiedere tempo) ---');
        for (const photo of photos) {
            const fileName = photo.url.split('/').pop();
            const originalFileName = photo.original_url ? photo.original_url.split('/').pop() : null;

            console.log(` Scaricando: ${photo.name}...`);

            // Download ottimizzata
            try {
                await downloadFile(photo.url, path.join(IMAGES_DIR, 'optimized', fileName));
            } catch (e) {
                console.error(`  Errore download ottimizzata per ${photo.name}:`, e.message);
            }

            // Download originale
            if (photo.original_url) {
                try {
                    await downloadFile(photo.original_url, path.join(IMAGES_DIR, 'originals', originalFileName));
                } catch (e) {
                    console.error(`  Errore download originale per ${photo.name}:`, e.message);
                }
            }
        }

        console.log('\n✨ Esportazione completata con successo!');
        console.log(`Tutti i file sono nella cartella: ${EXPORT_DIR}`);

    } catch (err) {
        console.error('\n❌ Errore critico durante l\'esportazione:', err.message);
    }
}

exportData();
