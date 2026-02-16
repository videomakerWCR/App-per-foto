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

    const statusDiv = document.getElementById('upload-status');
    statusDiv.innerHTML = ''; // Reset stati precedenti

    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        await uploadPhoto(file);
    }
    loadResults();
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

async function uploadPhoto(file) {
    const statusDiv = document.getElementById('upload-status');
    const fileName = `${Date.now()}-${file.name}`;

    try {
        statusDiv.innerHTML = `<p>Compressione di ${file.name}...</p>`;

        // 1. Comprimi l'immagine
        const compressedBlob = await compressImage(file);
        const fileName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, "")}.webp`; // Forza estensione .webp

        statusDiv.innerHTML = `<p>Caricamento di ${fileName}...</p>`;

        // 2. Carica su Supabase Storage
        const { data: storageData, error: storageError } = await supabaseClient.storage
            .from('photos')
            .upload(fileName, compressedBlob, {
                contentType: 'image/webp'
            });

        if (storageError) throw storageError;

        // 2. Ottieni URL pubblico
        const { data: { publicUrl } } = supabaseClient.storage
            .from('photos')
            .getPublicUrl(fileName);

        // 3. Inserisci record nel DB
        const { error: dbError } = await supabaseClient
            .from('photos')
            .insert([{
                url: publicUrl,
                name: file.name,
                votes: 0,
                likes: 0,
                dislikes: 0,
                session_id: currentSessionId // Associa alla sessione corrente
            }]);

        if (dbError) throw dbError;

        statusDiv.innerHTML = `<p style="color: #4ade80;">✅ ${file.name} caricato con successo!</p>`;
    } catch (err) {
        console.error('Errore durante l\'upload:', err);
        statusDiv.innerHTML = `<p style="color: #f43f5e;">❌ Errore durante l'upload di ${file.name}</p>`;
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

        if (askConfirm) loadResults();
    } catch (err) {
        console.error('Errore eliminazione:', err);
        notify('Errore durante l\'eliminazione: ' + err.message);
    }
}
