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
            .insert([{ url: publicUrl, name: file.name, votes: 0, likes: 0, dislikes: 0 }]);

        if (dbError) throw dbError;

        statusDiv.innerHTML = `<p style="color: #4ade80;">✅ ${file.name} caricato con successo!</p>`;
    } catch (err) {
        console.error('Errore durante l\'upload:', err);
        statusDiv.innerHTML = `<p style="color: #f43f5e;">❌ Errore durante l'upload di ${file.name}</p>`;
    }
}

// --- Logica Risultati ---

async function loadResults() {
    if (!supabaseClient) return;

    try {
        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .order('likes', { ascending: false });

        if (error) throw error;

        resultsBody.innerHTML = '';
        photos.forEach(photo => {
            const score = (photo.likes || 0) - (photo.dislikes || 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
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
    } catch (err) {
        console.error('Errore caricamento risultati:', err);
    }
}

async function deletePhoto(id, url) {
    if (!confirm('Sei sicuro di voler eliminare questa foto?')) return;

    try {
        const fileName = url.split('/').pop();
        await supabaseClient.storage.from('photos').remove([fileName]);

        // Elimina anche i voti associati
        await supabaseClient.from('user_votes').delete().eq('photo_id', id);
        const { error } = await supabaseClient.from('photos').delete().eq('id', id);

        if (error) throw error;

        loadResults();
    } catch (err) {
        console.error('Errore eliminazione:', err);
    }
}

document.addEventListener('DOMContentLoaded', loadResults);
