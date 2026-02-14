const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultsBody = document.getElementById('results-body');

// Semplice protezione della pagina admin
const ADMIN_PASSWORD = 'admin123'; // Cambiami!
const pass = prompt('Inserisci la password per accedere alla dashboard:');
if (pass !== ADMIN_PASSWORD) {
    alert('Accesso negato');
    window.location.href = 'index.html';
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
    if (!supabase) {
        notify('Configura Supabase in app.js per caricare le foto.');
        return;
    }

    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        await uploadPhoto(file);
    }
    loadResults();
}

async function uploadPhoto(file) {
    const statusDiv = document.getElementById('upload-status');
    const fileName = `${Date.now()}-${file.name}`;

    try {
        statusDiv.innerHTML = `<p>Caricamento di ${file.name}...</p>`;

        // 1. Carica su Supabase Storage
        const { data: storageData, error: storageError } = await supabase.storage
            .from('photos')
            .upload(fileName, file);

        if (storageError) throw storageError;

        // 2. Ottieni URL pubblico
        const { data: { publicUrl } } = supabase.storage
            .from('photos')
            .getPublicUrl(fileName);

        // 3. Inserisci record nel DB
        const { error: dbError } = await supabase
            .from('photos')
            .insert([{ url: publicUrl, name: file.name, votes: 0 }]);

        if (dbError) throw dbError;

        statusDiv.innerHTML = `<p style="color: #4ade80;">Caricamento completato!</p>`;
    } catch (err) {
        console.error('Errore durante l\'upload:', err);
        statusDiv.innerHTML = `<p style="color: #f43f5e;">Errore durante l'upload di ${file.name}</p>`;
    }
}

// --- Logica Risultati ---

async function loadResults() {
    if (!supabase) return;

    try {
        const { data: photos, error } = await supabase
            .from('photos')
            .select('*')
            .order('votes', { ascending: false });

        if (error) throw error;

        resultsBody.innerHTML = '';
        photos.forEach(photo => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${photo.url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
                <td>${photo.name}</td>
                <td><strong class="vote-count">${photo.votes}</strong></td>
                <td>
                    <button onclick="deletePhoto('${photo.id}', '${photo.url}')" style="background: none; border: none; color: #f43f5e; cursor: pointer;">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            `;
            resultsBody.appendChild(tr);
        });
        lucide.createIcons();
    } catch (err) {
        console.error('Errore caricamento risultati:', err);
    }
}

async function deletePhoto(id, url) {
    if (!confirm('Sei sicuro di voler eliminare questa foto?')) return;

    try {
        // Estrai il nome del file dall'URL
        const fileName = url.split('/').pop();

        // 1. Elimina da Storage
        await supabase.storage.from('photos').remove([fileName]);

        // 2. Elimina dal DB
        const { error } = await supabase.from('photos').delete().eq('id', id);

        if (error) throw error;

        loadResults();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

document.addEventListener('DOMContentLoaded', loadResults);
