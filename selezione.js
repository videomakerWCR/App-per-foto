let currentSessionId = 0;
let photosData = []; // Cache locale per fluidità
let currentPreviewId = null; // ID della foto attualmente in preview

document.addEventListener('DOMContentLoaded', async () => {
    const isAuthorized = await checkAuth('admin');
    if (isAuthorized) {
        document.querySelector('.container').classList.remove('page-hidden');
        await loadSessions();
        await loadPhotos();
    } else {
        window.location.href = 'index.html';
    }
});

const sessionSelect = document.getElementById('session-select');
const allPhotosList = document.getElementById('all-photos-list');
const selectedPhotosList = document.getElementById('selected-photos-list');
const selectionCount = document.getElementById('selection-count');
const refreshBtn = document.getElementById('refresh-btn');
const downloadAllBtn = document.getElementById('download-all-btn');
const zipProgress = document.getElementById('zip-progress');

refreshBtn.addEventListener('click', loadPhotos);
downloadAllBtn.addEventListener('click', downloadAllSelected);

sessionSelect.addEventListener('change', async (e) => {
    currentSessionId = parseInt(e.target.value);
    await loadPhotos();
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

        // Seleziona la prima se non c'è una selezione corrente
        if (s.is_active && !currentSessionId) currentSessionId = s.id;
    });

    if (!currentSessionId && sessions.length > 0) currentSessionId = sessions[0].id;
    sessionSelect.value = currentSessionId;
}

async function loadPhotos() {
    if (!supabaseClient || !currentSessionId) return;

    allPhotosList.style.opacity = '0.5';

    try {
        let { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .eq('session_id', currentSessionId);

        if (error) throw error;

        // Ordina per classifica
        photos.sort((a, b) => {
            const scoreA = (a.likes || 0) - (a.dislikes || 0);
            const scoreB = (b.likes || 0) - (b.dislikes || 0);
            return scoreB - scoreA;
        });

        photosData = photos; // Salva in cache
        renderLists();

    } catch (err) {
        console.error(err);
        allPhotosList.innerHTML = '<p>Errore caricamento dati.</p>';
    } finally {
        allPhotosList.style.opacity = '1';
    }
}

function renderLists() {
    allPhotosList.innerHTML = '';
    selectedPhotosList.innerHTML = '';

    let selectedCount = 0;

    photosData.forEach((photo, index) => {
        const score = (photo.likes || 0) - (photo.dislikes || 0);
        const rank = index + 1;

        // Item per TUTTE LE FOTO
        const item = document.createElement('div');
        item.className = 'photo-list-item';
        item.id = `photo-row-${photo.id}`;
        item.innerHTML = `
            <div class="photo-rank">#${rank}</div>
            <img src="${photo.url}" alt="${photo.name}" onclick="openPreview('${photo.id}')">
            <div class="photo-meta">
                <div style="font-weight: 600;">${photo.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    <span class="info-badge" style="color: #4ade80;">👍 ${photo.likes}</span>
                    <span class="info-badge" style="color: #f43f5e;">👎 ${photo.dislikes}</span>
                    <span style="font-weight: bold;">Score: ${score}</span>
                </div>
            </div>
            <button class="select-btn ${photo.is_selected ? 'selected' : ''}" onclick="toggleSelection('${photo.id}', ${!photo.is_selected})">
                <i data-lucide="${photo.is_selected ? 'check' : 'plus'}"></i>
            </button>
        `;
        allPhotosList.appendChild(item);

        // Item per SELEZIONATE (Colonna destra)
        if (photo.is_selected) {
            selectedCount++;
            const selectedItem = document.createElement('div');
            selectedItem.className = 'photo-list-item';
            selectedItem.style.background = 'rgba(74, 222, 128, 0.05)';

            const downloadLink = photo.original_url || photo.url;
            const isOriginal = photo.original_url ? true : false;

            selectedItem.innerHTML = `
                <img src="${photo.url}" alt="${photo.name}" style="width: 40px; height: 40px;" onclick="openPreview('${photo.id}')">
                <div class="photo-meta">
                    <div style="font-weight: 600; font-size: 0.9rem;">${photo.name}</div>
                    <div style="font-size: 0.8rem;">Pos: #${rank} | Score: ${score}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <!-- Pulsante Download Singolo -->
                    <a href="${downloadLink}" target="_blank" download class="download-btn" title="${isOriginal ? 'Scarica Originale (HD)' : 'Scarica WebP'}">
                        <i data-lucide="download"></i>
                    </a>
                    <!-- Pulsante Rimuovi -->
                    <button class="remove-btn" onclick="toggleSelection('${photo.id}', false)" title="Rimuovi dalla selezione">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            `;
            selectedPhotosList.appendChild(selectedItem);
        }
    });

    if (selectedCount === 0) {
        selectedPhotosList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Nessuna foto selezionata.</p>';
        downloadAllBtn.disabled = true;
    } else {
        downloadAllBtn.disabled = false;
    }

    selectionCount.textContent = selectedCount;
    lucide.createIcons();

    // Se il lightbox è aperto, aggiorna anche il tasto lì dentro
    if (currentPreviewId) {
        updateLightboxButtonState();
    }
}

async function downloadAllSelected() {
    if (!currentSessionId) return;

    downloadAllBtn.disabled = true;
    zipProgress.style.display = 'block';
    zipProgress.textContent = "Inizializzazione ZIP...";

    try {
        // Recupera tutte le foto selezionate
        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .eq('session_id', currentSessionId)
            .eq('is_selected', true);

        if (error) throw error;
        if (!photos || photos.length === 0) return;

        const zip = new JSZip();
        const total = photos.length;

        for (let i = 0; i < total; i++) {
            const photo = photos[i];
            const url = photo.original_url || photo.url;
            zipProgress.textContent = `Scaricamento ${i + 1}/${total}: ${photo.name}...`;

            try {
                const response = await fetch(url);
                const blob = await response.blob();
                // Determina estensione corretta
                let ext = url.split('.').pop().split('?')[0];
                if (ext.length > 4) ext = "jpg"; // Fallback

                zip.file(`${i + 1}_${photo.name.replace(/\.[^/.]+$/, "")}.${ext}`, blob);
            } catch (e) {
                console.error(`Errore nel download di ${photo.name}:`, e);
            }
        }

        zipProgress.textContent = "Generazione archivio ZIP...";
        const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
            zipProgress.textContent = `Compressione: ${metadata.percent.toFixed(0)}%`;
        });

        // Nome file basato sulla sessione
        const sessionName = sessionSelect.options[sessionSelect.selectedIndex].text.replace(/\s+/g, '_').replace(/\(ATTIVA\)/g, '');
        const filename = `${sessionName}_selezione_stampa.zip`;

        // Trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = filename;
        link.click();

        zipProgress.textContent = "Completato!";
        setTimeout(() => { zipProgress.style.display = 'none'; }, 3000);

    } catch (err) {
        console.error("Errore download ZIP:", err);
        alert("Errore durante la creazione dello ZIP.");
    } finally {
        downloadAllBtn.disabled = false;
    }
}

async function toggleSelection(photoId, newValue) {
    // 1. Update FLUIDO (LOCALE)
    const photoIndex = photosData.findIndex(p => p.id == photoId);
    if (photoIndex !== -1) {
        photosData[photoIndex].is_selected = newValue;

        // Aggiorna solo gli elementi necessari invece di ricaricare tutto
        // Questo mantiene lo scroll
        renderLists();
    }

    // 2. Update DB in background
    try {
        const { error } = await supabaseClient
            .from('photos')
            .update({ is_selected: newValue })
            .eq('id', photoId);

        if (error) throw error;
    } catch (err) {
        console.error("Errore sync DB:", err);
    }
}

// Funzioni Lightbox
function openPreview(photoId) {
    console.log("Opening preview for id:", photoId);
    const photo = photosData.find(p => p.id == photoId);
    if (!photo) {
        console.error("Photo not found in photosData for id:", photoId);
        return;
    }

    currentPreviewId = photoId;
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const container = document.querySelector('.container');

    lightboxImg.src = photo.url;
    updateLightboxButtonState();

    lightbox.style.display = 'flex';
    // Forza visibilità (evita problemi di transizione rimasti a 0 in alcuni casi)
    setTimeout(() => { lightbox.style.opacity = '1'; }, 10);

    if (container) container.style.overflow = 'hidden';
}

function updateLightboxButtonState() {
    const photo = photosData.find(p => p.id == currentPreviewId);
    const btn = document.getElementById('lightbox-toggle-btn');
    if (!photo || !btn) return;

    const span = btn.querySelector('span');
    // Lucide rimpiazza i con svg, quindi cerchiamo entrambi
    let icon = btn.querySelector('i') || btn.querySelector('svg');

    if (photo.is_selected) {
        btn.classList.add('is-selected');
        if (span) span.textContent = "Rimuovi dalla selezione";
        if (icon) icon.setAttribute('data-lucide', 'x');
    } else {
        btn.classList.remove('is-selected');
        if (span) span.textContent = "Aggiungi alla selezione";
        if (icon) icon.setAttribute('data-lucide', 'plus');
    }
    // Forza rigenerazione icone solo se necessario
    if (window.lucide) lucide.createIcons();
}

function changePhoto(direction) {
    if (!currentPreviewId) return;

    const currentIndex = photosData.findIndex(p => p.id == currentPreviewId);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;

    // Loop infinito
    if (nextIndex < 0) nextIndex = photosData.length - 1;
    if (nextIndex >= photosData.length) nextIndex = 0;

    openPreview(photosData[nextIndex].id);
}

function toggleLightboxSelection() {
    const photo = photosData.find(p => p.id == currentPreviewId);
    if (photo) {
        toggleSelection(photo.id, !photo.is_selected);
    }
}

function handleLightboxClick(event) {
    // Chiudi se clicchi direttamente sullo sfondo o sul tasto chiudi
    if (event.target.id === 'lightbox' || event.target.closest('.lightbox-close')) {
        closePreview();
    }
}

function closePreview() {
    const lightbox = document.getElementById('lightbox');
    const container = document.querySelector('.container');

    lightbox.style.opacity = '0';
    setTimeout(() => {
        lightbox.style.display = 'none';
        if (container) container.style.overflow = 'auto';
        currentPreviewId = null;
    }, 200);
}

// Supporto Tastiera
document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    if (lightbox.style.display === 'flex') {
        if (e.key === 'ArrowRight') changePhoto(1);
        if (e.key === 'ArrowLeft') changePhoto(-1);
        if (e.key === 'Escape') closePreview();
    }
});
