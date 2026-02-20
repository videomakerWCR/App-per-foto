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
let isLoading = false;

async function loadPhotos(isLoadMore = false) {
    if (isLoading) return; // Evita chiamate multiple

    const container = document.getElementById('photo-container');

    if (!supabaseClient) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                <p>⚠️ Supabase non configurato. Configura <code>app.js</code> per vedere le foto reali.</p>
                <button onclick="location.reload()" class="vote-btn" style="margin: 1rem auto;">Riprova</button>
            </div>
        `;
        return;
    }

    isLoading = true;

    try {
        // Carica i voti dell'utente solo la prima volta
        if (!isLoadMore) {
            await loadUserVotes();
            container.innerHTML = '';
            currentPage = 0;
            hasMorePhotos = true;

            // Reset observer se necessario
            if (observer) {
                observer.disconnect();
                observer = null;
            }
        }

        if (!hasMorePhotos) {
            isLoading = false;
            return;
        }

        // Mostra loader nella sentinella
        const sentinel = document.getElementById('scroll-sentinel');
        if (sentinel) sentinel.innerHTML = '<div class="loading" style="font-size: 0.9rem;">Caricamento altre foto...</div>';

        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*, sessions!inner(is_active)')
            .eq('sessions.is_active', true)
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

        currentPage++;
        lucide.createIcons();

        // Configura observer dopo aver aggiunto elementi
        if (hasMorePhotos) setupInfiniteScroll();

    } catch (err) {
        console.error('Errore nel caricamento:', err);
        if (!isLoadMore) container.innerHTML = '<p>Errore nel caricamento delle foto.</p>';
        notify('Errore caricamento foto');
    } finally {
        isLoading = false;
        // Pulisci il testo della sentinella
        const sentinel = document.getElementById('scroll-sentinel');
        if (sentinel) sentinel.innerHTML = '';

        // Se abbiamo finito le foto, rimuovi la sentinella
        if (!hasMorePhotos && sentinel) {
            sentinel.remove();
            if (observer) observer.disconnect();
        }
    }
}

let observer = null;

function setupInfiniteScroll() {
    let sentinel = document.getElementById('scroll-sentinel');

    // Crea la sentinella se non esiste
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        // Style invisibile ma presente per il trigger
        sentinel.style.height = '100px';
        sentinel.style.width = '100%';
        sentinel.style.margin = '20px 0';
        sentinel.style.display = 'flex';
        sentinel.style.justifyContent = 'center';
        sentinel.style.alignItems = 'center';
        sentinel.style.color = 'var(--text-muted)';

        const container = document.querySelector('.container');
        // Prova a inserirlo prima del footer, se esiste
        const footer = document.querySelector('footer');
        if (footer) {
            container.insertBefore(sentinel, footer);
        } else {
            container.appendChild(sentinel);
        }
    }

    if (!observer) {
        observer = new IntersectionObserver((entries) => {
            // Carica solo se visibile, ci sono foto e non sta già caricando
            if (entries[0].isIntersecting && hasMorePhotos && !isLoading) {
                loadPhotos(true);
            }
        }, { rootMargin: '400px' }); // Precarica 400px prima della fine

        observer.observe(sentinel);
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
        <img src="${photo.url}" alt="Foto" loading="lazy" data-original="${photo.original_url || photo.url}">
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
                <a href="${photo.original_url || photo.url}" download="${photo.name}" class="vote-btn download-btn" title="Scarica Originale">
                    <i data-lucide="download"></i>
                </a>
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
