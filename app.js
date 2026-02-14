// Configurazione Supabase - L'utente dovrà inserire i propri dati qui
const SUPABASE_URL = 'https://eactwaokrdcuonkarsej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhY3R3YW9rcmRjdW9ua2Fyc2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjM2NTMsImV4cCI6MjA4NjYzOTY1M30.yXPlYLap_i3JV52eAePsglHe6EkgR_Qc-Zqj7R2GmoI';

let supabaseClient = null;

// Inizializza Supabase se le chiavi sono presenti
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_URL !== '') {
    // Usiamo il comando corretto per creare la connessione
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Generatore di ID Univoco per il "voto per dispositivo"
// Dato che non possiamo leggere l'indirizzo MAC dal browser, 
// usiamo un ID salvato nel localStorage per identificare il dispositivo.
function getUserId() {
    let userId = localStorage.getItem('vote_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('vote_user_id', userId);
    }
    return userId;
}

const userId = getUserId();

// Funzioni helper per mostrare notifiche semplici
function notify(message, type = 'info') {
    alert(message); // Sostituibile con una UI più bella se necessario
}

// --- Lightbox Logic ---
function initLightbox() {
    // Crea elementi lightbox se non esistono
    if (!document.querySelector('.lightbox')) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-close">&times;</div>
            <img src="" alt="Full size photo">
        `;
        document.body.appendChild(lightbox);

        // Chiudi al click su sfondo o x
        lightbox.addEventListener('click', (e) => {
            if (e.target !== lightbox.querySelector('img')) {
                closeLightbox();
            }
        });
    }

    // Aggiungi listener a tutte le immagini delle card (delegation)
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && (e.target.closest('.photo-card') || e.target.closest('.ranking-card'))) {
            openLightbox(e.target.src);
        }
    });

    // Chiudi con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });
}

function openLightbox(src) {
    const lightbox = document.querySelector('.lightbox');
    const img = lightbox.querySelector('img');
    img.src = src;
    lightbox.style.display = 'flex';
    // Timeout per attivare la transizione CSS
    setTimeout(() => lightbox.classList.add('active'), 10);
    document.body.style.overflow = 'hidden'; // Blocca scroll pagina
}

function closeLightbox() {
    const lightbox = document.querySelector('.lightbox');
    lightbox.classList.remove('active');
    setTimeout(() => {
        lightbox.style.display = 'none';
        lightbox.querySelector('img').src = '';
    }, 300);
    document.body.style.overflow = ''; // Riattiva scroll
}

document.addEventListener('DOMContentLoaded', initLightbox);
