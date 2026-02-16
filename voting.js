// La protezione della pagina ora è gestita tramite Supabase RPC
// Non ci sono più password in chiaro nel codice frontend.

document.addEventListener('DOMContentLoaded', async () => {
    const isAuthorized = await checkAuth('access');
    if (isAuthorized) {
        // Rendi visibile il contenuto della pagina
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.classList.remove('page-hidden');
        loadPhotos();
    }
});

// Mappa locale dei voti dell'utente: { photoId: 'like' | 'dislike' | null }
let userVotes = {};
window.userVotes = userVotes; // Esponi globalmente

async function loadUserVotes() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('user_votes')
            .select('photo_id, vote_type')
            .eq('user_id', userId);
        if (error) throw error;
        data.forEach(v => { userVotes[v.photo_id] = v.vote_type; });
    } catch (err) {
        console.error('Errore caricamento voti utente:', err);
    }
}

let currentPage = 0;
const PAGE_SIZE = 12;
let hasMorePhotos = true;

async function loadPhotos(isLoadMore = false) {
    const container = document.getElementById('photo-container');
    const loadMoreBtn = document.getElementById('load-more-btn');

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
        // Carica i voti dell'utente solo la prima volta
        if (!isLoadMore) {
            await loadUserVotes();
            container.innerHTML = '';
            currentPage = 0;
            hasMorePhotos = true;
        }

        if (!hasMorePhotos) return;

        // Mostra loader o stato
        if (loadMoreBtn) loadMoreBtn.innerText = 'Caricamento...';

        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        if (photos.length < PAGE_SIZE) {
            hasMorePhotos = false;
        }

        if (photos.length === 0 && !isLoadMore) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nessuna foto presente. Caricale dalla pagina admin!</p>';
            return;
        }

        photos.forEach((photo, index) => {
            const card = createPhotoCard(photo, index);
            container.appendChild(card);
        });

        // Gestione pulsante "Carica Altro"
        updateLoadMoreButton();

        currentPage++;
        lucide.createIcons();

    } catch (err) {
        console.error('Errore nel caricamento:', err);
        if (!isLoadMore) container.innerHTML = '<p>Errore nel caricamento delle foto.</p>';
        notify('Errore caricamento foto');
    } finally {
        if (loadMoreBtn) loadMoreBtn.innerText = 'Carica altre foto';
    }
}

function updateLoadMoreButton() {
    let btn = document.getElementById('load-more-btn');
    if (!hasMorePhotos) {
        if (btn) btn.style.display = 'none';
        return;
    }

    if (!btn) {
        const container = document.querySelector('.container');
        btn = document.createElement('button');
        btn.id = 'load-more-btn';
        btn.className = 'vote-btn';
        btn.style.margin = '2rem auto';
        btn.style.display = 'block';
        btn.innerHTML = `<i data-lucide="plus-circle"></i> Carica altre foto`;
        btn.onclick = () => loadPhotos(true);
        // Inserisci dopo il container delle foto, prima del footer
        container.insertBefore(btn, document.querySelector('footer'));
    } else {
        btn.style.display = 'block';
    }
}

function createPhotoCard(photo, index) {
    const div = document.createElement('div');
    div.className = 'photo-card';
    div.id = `photo-${photo.id}`;
    div.style.animationDelay = `${index * 0.1}s`;

    const currentVote = userVotes[photo.id] || null;
    const likes = photo.likes || 0;
    const dislikes = photo.dislikes || 0;

    div.innerHTML = `
        <img src="${photo.url}" alt="Foto" loading="lazy">
        <div class="photo-info">
            <div class="vote-buttons">
                <button class="vote-btn like-btn ${currentVote === 'like' ? 'active' : ''}" 
                        onclick="handleVote('${photo.id}', 'like', this)"
                        aria-label="Mi piace">
                    <i data-lucide="thumbs-up"></i>
                    <span class="like-count">${likes}</span>
                </button>
                <button class="vote-btn dislike-btn ${currentVote === 'dislike' ? 'active' : ''}" 
                        onclick="handleVote('${photo.id}', 'dislike', this)"
                        aria-label="Non mi piace">
                    <i data-lucide="thumbs-down"></i>
                    <span class="dislike-count">${dislikes}</span>
                </button>
            </div>
        </div>
    `;

    return div;
}

async function handleVote(photoId, voteType, button) {
    if (!supabaseClient) return;

    // Previeni doppi click
    const card = document.getElementById(`photo-${photoId}`);
    const allBtns = card.querySelectorAll('.vote-btn');
    allBtns.forEach(b => b.disabled = true);

    try {
        const { data, error } = await supabaseClient.rpc('handle_vote', {
            p_user_id: userId,
            p_photo_id: photoId,
            p_vote_type: voteType
        });

        if (error) throw error;

        // Aggiorna i contatori istantaneamente
        const likeBtn = card.querySelector('.like-btn');
        const dislikeBtn = card.querySelector('.dislike-btn');
        const likeCount = card.querySelector('.like-count');
        const dislikeCount = card.querySelector('.dislike-count');

        likeCount.textContent = data.likes;
        dislikeCount.textContent = data.dislikes;

        // Aggiorna lo stato dei pulsanti
        const currentVote = userVotes[photoId];

        if (currentVote === voteType) {
            // Toggle off: l'utente ha cliccato lo stesso pulsante → rimuovi il voto
            likeBtn.classList.remove('active');
            dislikeBtn.classList.remove('active');
            delete userVotes[photoId];
        } else {
            // Nuovo voto o cambio voto
            likeBtn.classList.toggle('active', voteType === 'like');
            dislikeBtn.classList.toggle('active', voteType === 'dislike');
            userVotes[photoId] = voteType;
        }

        // Micro-animazione di feedback
        button.classList.add('pulse');
        setTimeout(() => button.classList.remove('pulse'), 300);

    } catch (err) {
        console.error('Errore nel voto:', err);
        notify('Errore durante la votazione. Riprova più tardi.');
    } finally {
        allBtns.forEach(b => b.disabled = false);
    }
}

// Inizia il caricamento (ora gestito da checkAuth sopra)

// Esponi funzione di voto globalmente per la lightbox
window.handleVote = handleVote;
