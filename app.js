// Configurazione Supabase - L'utente dovrà inserire i propri dati qui
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;

// Inizializza Supabase se le chiavi sono presenti
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
