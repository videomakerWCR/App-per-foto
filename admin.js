const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultsBody = document.getElementById('results-body');
const selectAllCheckbox = document.getElementById('select-all');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');

// La protezione della pagina ora è gestita tramite Supabase RPC

let currentSessionId = 1;

document.addEventListener('DOMContentLoaded', async () => {
    const isAuthorized = await checkAuth('admin');
    if (isAuthorized) {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.classList.remove('page-hidden');

        // Carica le sessioni e poi i risultati
        await loadSessions();
        loadResults();
        updateStorageUsage(); // Caricamento iniziale spazio
    } else {
        window.location.href = 'index.html';
    }
});

// --- Gestione Sessioni ---
const sessionSelect = document.getElementById('session-select');
const newSessionBtn = document.getElementById('new-session-btn');
const activateSessionBtn = document.getElementById('activate-session-btn');

sessionSelect.addEventListener('change', (e) => {
    currentSessionId = parseInt(e.target.value);
    loadResults();
});

newSessionBtn.addEventListener('click', async () => {
    const name = prompt("Nome della nuova sessione:");
    if (!name) return;

    try {
        const adminPass = sessionStorage.getItem('auth_admin_pass');
        const { error } = await supabaseClient.rpc('create_session', {
            p_name: name,
            p_admin_password: adminPass
        });

        if (error) throw error;
        notify("Sessione creata!");
        loadSessions(); // Ricarica lista
    } catch (err) {
        console.error(err);
        notify("Errore creazione sessione: " + err.message);
    }
});

activateSessionBtn.addEventListener('click', async () => {
    if (!confirm("Vuoi rendere questa sessione PUBBLICA? Le altre verranno nascoste.")) return;

    try {
        const adminPass = sessionStorage.getItem('auth_admin_pass');
        const { error } = await supabaseClient.rpc('activate_session', {
            p_session_id: currentSessionId,
            p_admin_password: adminPass
        });

        if (error) throw error;
        notify("Sessione Attivata!");
        loadSessions(); // Aggiorna UI attiva/inattiva
    } catch (err) {
        console.error(err);
        notify("Errore attivazione: " + err.message);
    }
});

async function loadSessions() {
    if (!supabaseClient) return;

    const { data: sessions, error } = await supabaseClient
        .from('sessions')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error("Errore loading sessions:", error);
        return;
    }

    sessionSelect.innerHTML = '';
    sessions.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.text = `${s.name} ${s.is_active ? '(ATTIVA)' : ''}`;
        sessionSelect.appendChild(option);

        // Seleziona la prima se non c'è una selezione corrente, o ricarica quella corrente
        if (s.is_active && !currentSessionId) currentSessionId = s.id;
    });

    // Se currentSessionId non è stato settato (nessuna attiva?), prendi la più recente
    if (!currentSessionId && sessions.length > 0) currentSessionId = sessions[0].id;

    sessionSelect.value = currentSessionId;
}

// --- Logica Upload ---

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

async function handleFiles(files) {
    if (!supabaseClient) {
        notify('Configura Supabase in app.js per caricare le foto.');
        return;
    }

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Inizializza UI Progresso
    const progressContainer = document.getElementById('upload-progress-container');
    const globalProgressFill = document.getElementById('global-progress-fill');
    const globalProgressText = document.getElementById('global-progress-text');
    const individualList = document.getElementById('individual-progress-list');

    progressContainer.style.display = 'block';
    individualList.innerHTML = '';
    globalProgressFill.style.width = '0%';
    globalProgressText.innerText = `0 di ${imageFiles.length} foto`;

    let completedCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];

        // Crea item nella lista
        const itemDiv = document.createElement('div');
        itemDiv.className = 'upload-item';
        itemDiv.id = `upload-item-${i}`;
        itemDiv.innerHTML = `
            <div class="upload-item-header">
                <span class="upload-item-name">${file.name}</span>
                <span class="upload-item-status">In attesa...</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill item-progress-fill" style="width: 0%;"></div>
            </div>
        `;
        individualList.prepend(itemDiv); // Ultimo in alto

        try {
            await uploadPhotoWithProgress(file, i, imageFiles.length, (filePercent) => {
                // Calcola progresso globale: (foto_completate + progresso_foto_corrente) / total_foto
                const globalPercent = ((completedCount + (filePercent / 100)) / imageFiles.length) * 100;
                globalProgressFill.style.width = `${globalPercent}%`;
            });

            completedCount++;
            globalProgressText.innerText = `${completedCount} di ${imageFiles.length} foto`;
        } catch (err) {
            console.error(`Errore upload ${file.name}:`, err);
            // Il progresso globale continua anche se uno fallisce
            completedCount++;
            globalProgressText.innerText = `${completedCount} di ${imageFiles.length} foto`;
        }
    }

    // Caricamento finito
    setTimeout(() => {
        loadResults();
        updateStorageUsage(); // Aggiorna spazio dopo upload
    }, 1000);
}

// Funzione per comprimere l'immagine
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Max dimensioni: 1920px (Full HD)
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1920;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Converti in WebP con qualità 0.8
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/webp', 0.8);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Funzione helper per aggiornare la UI dell'item singolo
function updateItemUI(itemId, percent, status, isError = false) {
    const item = document.getElementById(`upload-item-${itemId}`);
    if (!item) return;
    const fill = item.querySelector('.item-progress-fill');
    const statusText = item.querySelector('.upload-item-status');

    fill.style.width = `${percent}%`;
    statusText.innerText = status;

    if (isError) {
        fill.style.background = 'var(--dislike-color)';
        statusText.style.color = 'var(--dislike-color)';
    } else if (percent === 100) {
        fill.style.background = '#4ade80';
        statusText.style.color = '#4ade80';
    }
}

async function uploadPhotoWithProgress(file, index, total, onTotalProgress) {
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const originalPath = `originals/${timestamp}_${cleanName}`;
    const optimizedPath = `optimized/${timestamp}_${cleanName.replace(/\.[^/.]+$/, "")}.webp`;

    try {
        // Step 1: Caricamento Originale (0-40%)
        updateItemUI(index, 10, `<span class="loading-spinner"></span> Caricamento originale...`);
        onTotalProgress(10);

        const { error: originalError } = await supabaseClient.storage
            .from('photos')
            .upload(originalPath, file);

        if (originalError) throw originalError;

        updateItemUI(index, 40, `<span class="loading-spinner"></span> Ottimizzazione...`);
        onTotalProgress(40);

        // Step 2: Compressione (40-60%)
        const compressedBlob = await compressImage(file);

        updateItemUI(index, 60, `<span class="loading-spinner"></span> Caricamento ottimizzata...`);
        onTotalProgress(60);

        // Step 3: Caricamento Ottimizzata (60-90%)
        const { error: optimizedError } = await supabaseClient.storage
            .from('photos')
            .upload(optimizedPath, compressedBlob, { contentType: 'image/webp' });

        if (optimizedError) throw optimizedError;

        updateItemUI(index, 90, `<span class="loading-spinner"></span> Salvataggio nel database...`);
        onTotalProgress(90);

        // Step 4: Database (90-100%)
        const { data: { publicUrl: originalUrl } } = supabaseClient.storage.from('photos').getPublicUrl(originalPath);
        const { data: { publicUrl: optimizedUrl } } = supabaseClient.storage.from('photos').getPublicUrl(optimizedPath);

        const { error: dbError } = await supabaseClient
            .from('photos')
            .insert([{
                url: optimizedUrl,
                original_url: originalUrl,
                name: file.name,
                votes: 0,
                likes: 0,
                dislikes: 0,
                session_id: currentSessionId,
                is_selected: false
            }]);

        if (dbError) throw dbError;

        updateItemUI(index, 100, `✅ Completato`);
        onTotalProgress(100);

    } catch (err) {
        updateItemUI(index, 100, `❌ Errore: ${err.message}`, true);
        throw err;
    }
}

// --- Logica Risultati e Cancellazione Multipla ---

// Event Listener per "Seleziona Tutti"
selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.photo-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateDeleteButton();
});

// Event Listener per "Elimina Selezionate"
deleteSelectedBtn.addEventListener('click', async () => {
    const selected = document.querySelectorAll('.photo-checkbox:checked');
    if (selected.length === 0) return;

    if (!confirm(`Sei sicuro di voler eliminare ${selected.length} foto?`)) return;

    deleteSelectedBtn.disabled = true;
    deleteSelectedBtn.innerHTML = 'Eliminazione...';

    for (const checkbox of selected) {
        const id = checkbox.dataset.id;
        const url = checkbox.dataset.url;
        await deletePhoto(id, url, false); // false = no confirm, no reload
    }

    deleteSelectedBtn.disabled = false;
    deleteSelectedBtn.innerHTML = '<i data-lucide="trash-2"></i> Elimina Selezionate';
    selectAllCheckbox.checked = false;
    loadResults();
    updateStorageUsage(); // Aggiorna spazio dopo cancellazione
});

function updateDeleteButton() {
    const count = document.querySelectorAll('.photo-checkbox:checked').length;
    if (count > 0) {
        deleteSelectedBtn.style.display = 'flex';
        deleteSelectedBtn.innerHTML = `<i data-lucide="trash-2"></i> Elimina ${count} Selezionate`;
    } else {
        deleteSelectedBtn.style.display = 'none';
        selectAllCheckbox.checked = false;
    }
}

async function loadResults() {
    if (!supabaseClient || !currentSessionId) return;

    try {
        let { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .eq('session_id', currentSessionId); // Filtra per sessione CORRENTE (anche se inattiva)

        if (error) throw error;

        // Ordina per punteggio complessivo
        photos.sort((a, b) => {
            const scoreA = (a.likes || 0) - (a.dislikes || 0);
            const scoreB = (b.likes || 0) - (b.dislikes || 0);
            return scoreB - scoreA;
        });

        resultsBody.innerHTML = '';
        photos.forEach(photo => {
            const score = (photo.likes || 0) - (photo.dislikes || 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="photo-checkbox" data-id="${photo.id}" data-url="${photo.url}"></td>
                <td><img src="${photo.url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
                <td>${photo.name}</td>
                <td><span style="color: #4ade80; font-weight: 700;">👍 ${photo.likes || 0}</span></td>
                <td><span style="color: #f43f5e; font-weight: 700;">👎 ${photo.dislikes || 0}</span></td>
                <td><strong style="color: ${score >= 0 ? '#4ade80' : '#f43f5e'};">${score >= 0 ? '+' : ''}${score}</strong></td>
                <td>
                    <button onclick="deletePhoto('${photo.id}', '${photo.url}')" style="background: none; border: none; color: #f43f5e; cursor: pointer; font-size: 1.2rem;">
                        🗑️
                    </button>
                </td>
            `;
            resultsBody.appendChild(tr);
        });

        // Aggiungi listener alle checkbox singole
        document.querySelectorAll('.photo-checkbox').forEach(cb => {
            cb.addEventListener('change', updateDeleteButton);
        });

        lucide.createIcons();
        updateDeleteButton(); // Nascondi pulsante se lista vuota
    } catch (err) {
        console.error('Errore caricamento risultati:', err);
    }
}

async function deletePhoto(id, url, askConfirm = true) {
    if (askConfirm && !confirm('Sei sicuro di voler eliminare questa foto?')) return;

    try {
        // Recupera la password dalla sessione (salvata quando l'admin ha fatto login)
        const adminPass = sessionStorage.getItem('auth_admin_pass'); // Dobbiamo salvarla nel login

        // 1. Chiamata RPC sicura: solo il database può cancellare se riceve la password corretta
        const { error: rpcError } = await supabaseClient.rpc('delete_photo_secure', {
            p_photo_id: id,
            p_admin_password: adminPass
        });

        if (rpcError) throw rpcError;

        // 2. Elimina il file fisico dallo storage
        const fileName = url.split('/').pop();
        await supabaseClient.storage.from('photos').remove([fileName]);

        if (askConfirm) {
            loadResults();
            updateStorageUsage(); // Aggiorna spazio dopo cancellazione singola
        }
    } catch (err) {
        console.error('Errore eliminazione:', err);
        notify('Errore durante l\'eliminazione: ' + err.message);
    }
}

// --- Funzioni Utility per Spazio Archiviazione ---

async function updateStorageUsage() {
    if (!supabaseClient) return;

    try {
        const { data: totalBytes, error } = await supabaseClient.rpc('get_storage_usage');

        if (error) {
            console.warn("RPC get_storage_usage non trovata o errore:", error.message);
            return;
        }

        const widget = document.getElementById('storage-usage-widget');
        const fill = document.getElementById('storage-bar-fill');
        const text = document.getElementById('storage-used-text');

        if (!widget || !fill || !text) return;

        widget.style.display = 'flex';

        const gigabyte = 1024 * 1024 * 1024;
        const megabyte = 1024 * 1024;
        const limit = gigabyte; // Limite free tier Supabase: 1GB

        const usedMB = totalBytes / megabyte;
        const usedGB = totalBytes / gigabyte;
        const percent = Math.min((totalBytes / limit) * 100, 100);

        // Formattazione testo
        if (totalBytes > megabyte * 100) {
            text.innerText = `${usedGB.toFixed(2)} GB / 1 GB`;
        } else {
            text.innerText = `${usedMB.toFixed(1)} MB / 1 GB`;
        }

        // Aggiorna Barra
        fill.style.width = `${percent}%`;

        // Colore dinamico
        if (percent > 90) {
            fill.style.background = '#f43f5e'; // Rosso
            fill.style.boxShadow = '0 0 8px rgba(244, 63, 94, 0.4)';
        } else if (percent > 70) {
            fill.style.background = '#facc15'; // Giallo
            fill.style.boxShadow = '0 0 8px rgba(250, 204, 21, 0.4)';
        } else {
            fill.style.background = '#4ade80'; // Verde
            fill.style.boxShadow = '0 0 8px rgba(74, 222, 128, 0.4)';
        }

    } catch (err) {
        console.error("Errore recupero spazio:", err);
    }
}
