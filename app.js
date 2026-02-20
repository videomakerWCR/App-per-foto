// Configurazione Supabase
const SUPABASE_URL = 'https://eactwaokrdcuonkarsej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhY3R3YW9rcmRjdW9ua2Fyc2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjM2NTMsImV4cCI6MjA4NjYzOTY1M30.yXPlYLap_i3JV52eAePsglHe6EkgR_Qc-Zqj7R2GmoI';

let supabaseClient = null;

try {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Errore inizializzazione Supabase:", e);
}


// Generatore di ID Univoco per il "voto per dispositivo"
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

// Forza il download di un file (utile per Supabase storage che spesso apre in nuova scheda)
async function forceDownload(url, filename, btn) {
    if (!url) return;

    // Feedback visivo
    const originalContent = btn ? btn.innerHTML : null;
    if (btn) {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<span class="loading-spinner">...</span>';
    }

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Pulizia
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.error("Errore download:", err);
        notify("Errore durante il download del file.");
    } finally {
        if (btn) {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.innerHTML = originalContent;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// --- Auth Logic ---

let authPromise = null;

async function checkAuth(type) {
    const isGranted = sessionStorage.getItem(`auth_${type}`);
    if (isGranted) return true;

    if (authPromise) return authPromise;

    authPromise = new Promise((resolve) => {
        showAuthModal(type, (result) => {
            authPromise = null;
            resolve(result);
        });
    });

    return authPromise;
}

function showAuthModal(type, callback) {
    // Se esiste già un modal, portalo in primo piano e non ricrearlo
    const existing = document.querySelector('.auth-overlay');
    if (existing) {
        const input = existing.querySelector('input');
        if (input) input.focus();
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';

    const title = type === 'admin' ? 'Dashboard Admin' : 'Accesso Galleria';
    const message = type === 'admin' ? 'Inserisci la password amministratore' : 'Inserisci il codice di accesso';

    overlay.innerHTML = `
        <div class="auth-card">
            <h2>${title}</h2>
            <p>${message}</p>
            <input type="password" class="auth-input" id="auth-password" placeholder="Password...">
            <button class="auth-submit" id="auth-button">Accedi</button>
            <div class="auth-error" id="auth-error"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#auth-password');
    const button = overlay.querySelector('#auth-button');
    const errorDiv = overlay.querySelector('#auth-error');

    input.focus();

    const attemptLogin = async () => {
        const password = input.value;
        if (!password) return;

        button.disabled = true;
        button.textContent = 'Verifica...';
        errorDiv.textContent = '';

        try {
            if (!supabaseClient) throw new Error("Supabase non inizializzato");

            // Verifica connessione base
            const { error: pingError } = await supabaseClient.from('photos').select('id').limit(1);
            if (pingError) {
                console.warn("Errore connessione DB:", pingError);
                throw new Error("Impossibile connettersi al database");
            }

            const { data, error } = await supabaseClient.rpc('verify_password', {
                p_type: type,
                p_password: password
            });

            if (error) {
                console.error("Errore RPC:", error);
                // Tentativo fallback con nomi parametri diversi se il primo fallisce
                if (error.code === '42883') { // Undefined function
                    const { data: data2, error: error2 } = await supabaseClient.rpc('verify_password', {
                        type: type,
                        password: password
                    });
                    if (!error2 && data2 === true) {
                        sessionStorage.setItem(`auth_${type}`, 'true');
                        sessionStorage.setItem(`auth_${type}_pass`, password);
                        overlay.remove();
                        callback(true);
                        return;
                    }
                }
                throw error;
            }

            if (data === true) {
                sessionStorage.setItem(`auth_${type}`, 'true');
                // Salva la password per le operazioni sicure (RPC)
                sessionStorage.setItem(`auth_${type}_pass`, password);
                overlay.remove();
                callback(true);
            } else {
                errorDiv.textContent = 'Password errata';
                input.value = '';
                input.focus();
            }
        } catch (err) {
            console.error('Errore auth:', err);
            errorDiv.textContent = 'Errore: funzione database non trovata o connessione assente';
        } finally {
            button.disabled = false;
            button.textContent = 'Accedi';
        }
    };

    button.addEventListener('click', attemptLogin);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
}

// --- Lightbox & Gallery Logic ---

let currentGalleryImages = []; // Array of { src, id, element }
let currentImageIndex = 0;

function initLightbox() {
    // Crea elementi lightbox se non esistono
    if (!document.querySelector('.lightbox')) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-close">&times;</div>
            <div class="lightbox-nav lightbox-prev">&lt;</div>
            <div class="lightbox-nav lightbox-next">&gt;</div>
            <img src="" alt="Full size photo">
            <div class="lightbox-controls">
                <button class="lightbox-btn lb-like-btn"><i data-lucide="thumbs-up"></i></button>
                <button class="lightbox-btn lb-dislike-btn"><i data-lucide="thumbs-down"></i></button>
                <button class="lightbox-btn lb-download-btn" title="Scarica Originale"><i data-lucide="download"></i></button>
            </div>
        `;
        document.body.appendChild(lightbox);
        lucide.createIcons();

        // Event Listeners
        lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
        lightbox.querySelector('.lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
        lightbox.querySelector('.lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });
        lightbox.querySelector('.lb-download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const currentData = currentGalleryImages[currentImageIndex];
            forceDownload(currentData.original, currentData.name, e.currentTarget);
        });

        // Chiudi al click su sfondo (ma non su img o controlli)
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        // Swipe Gestures
        let touchstartX = 0;
        let touchendX = 0;
        lightbox.addEventListener('touchstart', e => touchstartX = e.changedTouches[0].screenX);
        lightbox.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            handleSwipe();
        });

        function handleSwipe() {
            if (touchendX < touchstartX - 50) nextImage();
            if (touchendX > touchstartX + 50) prevImage();
        }

        // Voting Buttons in Lightbox
        const likeBtn = lightbox.querySelector('.lb-like-btn');
        const dislikeBtn = lightbox.querySelector('.lb-dislike-btn');

        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleLightboxVote('like');
        });

        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleLightboxVote('dislike');
        });
    }

    // Aggiungi listener a tutte le immagini delle card (delegation)
    document.addEventListener('click', (e) => {
        const img = e.target;
        if (img.tagName === 'IMG' && (img.closest('.photo-card') || img.closest('.ranking-card'))) {
            // Trova tutte le immagini della galleria corrente
            const container = document.querySelector('.photo-grid') || document.querySelector('#ranking-container');
            const images = Array.from(container.querySelectorAll('img'));

            // Popola l'array globale
            currentGalleryImages = images.map(img => {
                const card = img.closest('.photo-card') || img.closest('.ranking-card');
                // Estrai ID dalla card (photo-ID o niente) o dal dataset se presente
                // Assumiamo che photo-card abbia id="photo-{uuid}"
                let photoId = null;
                if (card.id && card.id.startsWith('photo-')) {
                    photoId = card.id.replace('photo-', '');
                } else {
                    // Fallback: prova a trovare il pulsante di voto e prendi l'ID da lì se possibile
                    // Ma per ora ci affidiamo all'ID della card in voting.js
                    // In classifica.js non abbiamo messo ID alla card, dovremo metterlo
                    // Se non c'è ID, il voto non funzionerà
                }
                return {
                    src: img.src,
                    id: photoId,
                    element: card,
                    original: img.dataset.original || img.src,
                    name: img.alt || 'foto'
                };
            });

            currentImageIndex = images.indexOf(img);
            openLightbox();
        }
    });

    // Navigazione tastiera
    document.addEventListener('keydown', (e) => {
        if (!document.querySelector('.lightbox.active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
    });
}

function openLightbox() {
    const lightbox = document.querySelector('.lightbox');
    updateLightboxContent();
    lightbox.style.display = 'flex';
    setTimeout(() => lightbox.classList.add('active'), 10);
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.querySelector('.lightbox');
    lightbox.classList.remove('active');
    setTimeout(() => {
        lightbox.style.display = 'none';
    }, 300);
    document.body.style.overflow = '';
}

function updateLightboxContent() {
    const lightbox = document.querySelector('.lightbox');
    const img = lightbox.querySelector('img');
    const currentData = currentGalleryImages[currentImageIndex];

    img.src = currentData.src;

    // Aggiorna stato pulsanti voto (solo se siamo in pagina votazione e abbiamo ID)
    const likeBtn = lightbox.querySelector('.lb-like-btn');
    const dislikeBtn = lightbox.querySelector('.lb-dislike-btn');

    // Reset pulsanti
    likeBtn.classList.remove('active-like');
    dislikeBtn.classList.remove('active-dislike');

    // Aggiorna link download (rimosso settaggio href diretto, ora gestito dal click listener)
    const downloadBtn = lightbox.querySelector('.lb-download-btn');
    if (downloadBtn) {
        // downloadBtn.href = currentData.original; // Non più necessario con forceDownload
        // downloadBtn.download = currentData.name;
    }

    // Controlla se siamo in voting page guardando i voti dell'utente
    if (typeof userVotes !== 'undefined' && currentData.id) {
        const userVote = userVotes[currentData.id];
        if (userVote === 'like') likeBtn.classList.add('active-like');
        if (userVote === 'dislike') dislikeBtn.classList.add('active-dislike');
        lightbox.querySelector('.lightbox-controls').style.display = 'flex';
    } else {
        // Nascondi controlli se non è possibile votare (es. classifica senza ID o logica voti)
        // Ma l'utente ha chiesto voti anche a schermo intero. In classifica.js non abbiamo logica voto.
        // Se siamo in classifica, nascondiamo i pulsanti per ora, o implementiamo il voto globale.
        // Dalla richiesta: "in schemo interi si aggiungono i tasti per votare".
        // Assumo che funzioni dove il voto è già possibile (voting page).
        if (typeof userVotes === 'undefined') {
            lightbox.querySelector('.lightbox-controls').style.display = 'none';
        } else {
            lightbox.querySelector('.lightbox-controls').style.display = 'flex';
        }
    }
}

function prevImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        updateLightboxContent();
    } else {
        // Loop? O stop? Facciamo loop
        currentImageIndex = currentGalleryImages.length - 1;
        updateLightboxContent();
    }
}

function nextImage() {
    if (currentImageIndex < currentGalleryImages.length - 1) {
        currentImageIndex++;
        updateLightboxContent();
    } else {
        currentImageIndex = 0;
        updateLightboxContent();
    }
}

async function handleLightboxVote(type) {
    const currentData = currentGalleryImages[currentImageIndex]; // { src, id, element }
    if (!currentData.id || typeof handleVote !== 'function') return;

    // Trova il pulsante corrispondente nella card originale per passarlo a handleVote (che si aspetta un button per animazioni)
    // O passiamo null e modifichiamo handleVote per gestire null buttons
    const card = currentData.element;
    const originalBtn = card.querySelector(`.${type}-btn`);

    // Chiamiamo la funzione di voto esistente
    await handleVote(currentData.id, type, originalBtn || document.createElement('button'));

    // Aggiorniamo la UI della lightbox manualmente dopo il voto
    updateLightboxContent();
}

document.addEventListener('DOMContentLoaded', initLightbox);
