// Semplice protezione della pagina principale per simulare un link "privato"
const ACCESS_CODE = 'voto2026'; // CAMBIAMI: Questa è la password per vedere il sito
const enteredCode = localStorage.getItem('access_granted') || prompt('Inserisci il codice di accesso per vedere le foto:');

if (enteredCode !== ACCESS_CODE) {
    alert('Codice errato');
    document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; color:white; font-family:sans-serif;"><h1>Accesso Negato</h1></div>';
    throw new Error('Access Denied');
} else {
    localStorage.setItem('access_granted', ACCESS_CODE);
}

// Mappa locale dei voti dell'utente: { photoId: 'like' | 'dislike' | null }
let userVotes = {};

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

async function loadPhotos() {
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

    try {
        // Carica i voti dell'utente prima delle foto
        await loadUserVotes();

        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';

        if (photos.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nessuna foto presente. Caricale dalla pagina admin!</p>';
            return;
        }

        photos.forEach((photo, index) => {
            const card = createPhotoCard(photo, index);
            container.appendChild(card);
        });

        lucide.createIcons();
    } catch (err) {
        console.error('Errore nel caricamento:', err);
        container.innerHTML = '<p>Errore nel caricamento delle foto.</p>';
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

// Inizia il caricamento
document.addEventListener('DOMContentLoaded', loadPhotos);
