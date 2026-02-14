// Semplice protezione della pagina principale per simulare un link "privato"
const ACCESS_CODE = 'voto2026'; // CAMBIAMI con il codice che vuoi dare ai tuoi amici
const enteredCode = localStorage.getItem('access_granted') || prompt('Inserisci il codice di accesso per vedere le foto:');

if (enteredCode !== ACCESS_CODE) {
    alert('Codice errato');
    document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; color:white; font-family:sans-serif;"><h1>Accesso Negato</h1></div>';
    throw new Error('Access Denied');
} else {
    localStorage.setItem('access_granted', ACCESS_CODE);
}

async function loadPhotos() {
    const container = document.getElementById('photo-container');

    // Se Supabase non è configurato, usiamo dati di esempio
    if (!supabaseClient) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                <p>⚠️ Supabase non configurato. Configura <code>app.js</code> per vedere le foto reali.</p>
                <button onclick="location.reload()" class="vote-btn" style="margin: 1rem auto;">Riprova</button>
            </div>
        `;
        return;
    }

    try {
        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';

        if (photos.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nessuna foto presente. Caricale dalla pagina admin!</p>';
            return;
        }

        photos.forEach(photo => {
            const card = createPhotoCard(photo);
            container.appendChild(card);
        });
    } catch (err) {
        console.error('Errore nel caricamento:', err);
        container.innerHTML = '<p>Errore nel caricamento delle foto.</p>';
    }
}

function createPhotoCard(photo) {
    const div = document.createElement('div');
    div.className = 'photo-card';

    // Controlla se l'utente ha già votato questa foto (localmente e nel DB)
    const votedPhotos = JSON.parse(localStorage.getItem('voted_photos') || '[]');
    const hasVoted = votedPhotos.includes(photo.id);

    div.innerHTML = `
        <img src="${photo.url}" alt="Foto">
        <div class="photo-info">
            <span class="vote-count">${photo.votes || 0} voti</span>
            <button class="vote-btn ${hasVoted ? 'voted' : ''}" 
                    onclick="handleVote('${photo.id}', this)" 
                    ${hasVoted ? 'disabled' : ''}>
                <i data-lucide="heart"></i>
                ${hasVoted ? 'Votato' : 'Vota'}
            </button>
        </div>
    `;

    // Inizializza l'icona Lucide appena creata
    setTimeout(() => lucide.createIcons({ props: { "data-lucide": "heart" }, scope: div }), 0);

    return div;
}

async function handleVote(photoId, button) {
    if (!supabaseClient) return;

    try {
        // 1. Verifica lato client (già disabilitato via UI, ma per sicurezza)
        const votedPhotos = JSON.parse(localStorage.getItem('voted_photos') || '[]');
        if (votedPhotos.includes(photoId)) return;

        // 2. Aggiorna DB (incremento atomico)
        const { data, error } = await supabaseClient.rpc('increment_vote', { photo_id: photoId });

        if (error) throw error;

        // 3. Salva localmente per evitare voti multipli
        votedPhotos.push(photoId);
        localStorage.setItem('voted_photos', JSON.stringify(votedPhotos));

        // 4. Update UI
        button.classList.add('voted');
        button.disabled = true;
        button.innerHTML = '<i data-lucide="heart"></i> Votato';
        lucide.createIcons();

        // Ricarica i voti o aggiorna il contatore localmente
        location.reload();

    } catch (err) {
        console.error('Errore nel voto:', err);
        notify('Errore durante la votazione. Riprova più tardi.');
    }
}

// Inizia il caricamento
document.addEventListener('DOMContentLoaded', loadPhotos);
