document.addEventListener('DOMContentLoaded', async () => {
    const isAuthorized = await checkAuth('access');
    if (isAuthorized) {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.classList.remove('page-hidden');
        loadRanking();
    }
});

async function loadRanking() {
    const container = document.getElementById('ranking-container');

    if (!supabaseClient) {
        container.innerHTML = '<p>⚠️ Supabase non configurato.</p>';
        return;
    }

    try {
        const { data: photos, error } = await supabaseClient
            .from('photos')
            .select('*')
            .order('likes', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';

        if (photos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Nessuna foto in classifica.</p>';
            return;
        }

        photos.forEach((photo, index) => {
            const rank = index + 1;
            const score = (photo.likes || 0) - (photo.dislikes || 0);
            const card = document.createElement('div');
            card.className = 'ranking-card';
            card.style.animationDelay = `${index * 0.08}s`;

            let medalClass = '';
            let medalEmoji = '';
            if (rank === 1) { medalClass = 'gold'; medalEmoji = '🥇'; }
            else if (rank === 2) { medalClass = 'silver'; medalEmoji = '🥈'; }
            else if (rank === 3) { medalClass = 'bronze'; medalEmoji = '🥉'; }

            card.innerHTML = `
                <div class="rank-position ${medalClass}">
                    ${medalEmoji || `#${rank}`}
                </div>
                <img src="${photo.url}" alt="Foto" class="rank-photo" loading="lazy">
                <div class="rank-info">
                    <div class="rank-stats">
                        <span class="rank-stat like-stat">
                            <i data-lucide="thumbs-up"></i> ${photo.likes || 0}
                        </span>
                        <span class="rank-stat dislike-stat">
                            <i data-lucide="thumbs-down"></i> ${photo.dislikes || 0}
                        </span>
                        <span class="rank-score ${score >= 0 ? 'positive' : 'negative'}">
                            Punteggio: ${score >= 0 ? '+' : ''}${score}
                        </span>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });

        lucide.createIcons();
    } catch (err) {
        console.error('Errore caricamento classifica:', err);
        container.innerHTML = '<p>Errore nel caricamento della classifica.</p>';
    }
}

// Caricamento gestito da checkAuth sopra
