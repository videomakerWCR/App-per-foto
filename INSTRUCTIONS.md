# Guida alla Configurazione

Ho creato per te il sito web con un design premium e moderno. Per renderlo funzionante (permettere alle persone di votare e a te di caricare le foto), devi usare **Supabase** come database e archivio foto. È gratuito e facile da configurare.

### 1. Crea un progetto su Supabase
1. Vai su [Supabase](https://supabase.com/) e crea un nuovo progetto.
2. Una volta creato, vai in **Project Settings** > **API**.
3. Copia la `Project URL` e la `anon public key`.
4. Apri il file `app.js` e incolla questi valori nelle prime due righe.

### 2. Configura il Database (SQL)
Vai nella sezione **SQL Editor** su Supabase e incolla questo codice per creare la tabella delle foto e la funzione di voto:

```sql
-- Crea la tabella per le foto
create table photos (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  name text not null,
  votes integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Funzione per incrementare i voti in modo sicuro
create or replace function increment_vote(photo_id uuid)
returns void as $$
begin
  update photos
  set votes = votes + 1
  where id = photo_id;
end;
$$ language plpgsql;
```

### 3. Configura lo Storage (Archivio Foto)
1. Vai nella sezione **Storage** su Supabase.
2. Crea un nuovo "Bucket" e chiamalo esattamente `photos`.
3. Assicurati che il bucket sia impostato su **Public** (così tutti possono vedere le foto).

### 4. Pubblicazione su GitHub
1. Crea un nuovo repository su GitHub.
2. Carica tutti i file (`index.html`, `admin.html`, `style.css`, `app.js`, etc.).
3. Vai nelle **Settings** del repository > **Pages**.
4. Sotto "Build and deployment", seleziona il branch `main` e la cartella `/(root)`.
5. Clicca su **Save**. Dopo un minuto, il tuo sito sarà online!

### Note sulla Sicurezza
*   **Password Admin**: Nel file `admin.js`, alla riga 5, ho impostato una password predefinita (`admin123`). Ti consiglio di cambiarla prima di pubblicare.
*   **Indirizzo MAC**: Come spiegato, i browser non possono vedere l'indirizzo MAC. Ho usato un sistema che riconosce il dispositivo tramite `localStorage`. Questo impedisce alla stessa persona di votare più volte dalla stessa foto (a meno che non cambi browser o cancelli i dati).
