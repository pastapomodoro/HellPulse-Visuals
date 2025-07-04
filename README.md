# HellPulse Visuals

Visualizzatore audio-reactive in p5.js con effetti glitch, distorsione e tint personalizzabili.

## 🚀 Come usare l'app

1. **Clona la repository:**
   ```sh
   git clone https://github.com/pastapomodoro/HellPulse-Visuals.git
   cd HellPulse-Visuals
   ```

2. **Avvia in locale:**
   - Apri `index.html` direttamente nel browser  
     **oppure**  
   - Usa un server locale (consigliato per evitare problemi di CORS con le immagini/audio):
     ```sh
     # Python 3
     python3 -m http.server
     # oppure con node
     npx serve .
     ```
     Poi visita [http://localhost:8000](http://localhost:8000) (o la porta indicata).

## 🖼️ Customizzazione immagini

- **Background:** Metti le tue immagini `.gif` nella cartella `bg/` e aggiungi le opzioni nel select in `index.html`.
- **Soggetti:** Metti le tue immagini nella cartella `subj/` e aggiungi le opzioni nel select in `index.html` e nell'array `subjectList` in `sketch.js`.
- **Logo:** Sostituisci `HellPulse.png` nella root per cambiare il logo.

## 🎚️ Controlli

- **Background:** Cambia lo sfondo.
- **Soggetto:** Cambia l'immagine principale.
- **Volume/Track:** Controlla la musica.
- **Glitch:** Intensità delle linee glitch.
- **Tint:** Applica una tinta colorata (può essere automatica con la checkbox).

## 🛠️ Dipendenze

- [p5.js](https://p5js.org/) (incluso via CDN)
- [p5.sound](https://p5js.org/reference/#/libraries/p5.sound) (incluso via CDN)
- Nessuna installazione di pacchetti necessaria.

## 🧠 Algoritmo e logica

- **Audio-Reactive:** L'ampiezza audio viene letta in tempo reale e usata per animare spirali, particelle, glow e glitch.
- **Glitch:** Linee e distorsioni randomiche vengono disegnate in base al volume e al valore dello slider.
- **Tint:** L'immagine principale viene tinta con un colore che attraversa tutto lo spettro (slider manuale o automatico).
- **Customizzazione:** Tutto è facilmente modificabile da HTML e JS.

## 📂 Struttura delle cartelle

```
bg/           # Sfondi animati o statici
subj/         # Immagini dei soggetti
index.html    # Pagina principale
sketch.js     # Logica p5.js
style.css     # Stili
sound.mp3     # Traccia audio principale
HellPulse.png # Logo
```

## 👾 Demo

Apri `index.html` o visita la repo per vedere una demo.

---

**Contribuisci, personalizza e divertiti!**

# Avvio locale del progetto

Per motivi di sicurezza dei browser moderni, **non puoi aprire direttamente index.html** (file:///...) e aspettarti che immagini, audio e altri asset funzionino. Devi avviare un server locale.

## Metodo 1: Python (consigliato, già installato su Mac)

1. Apri il Terminale.
2. Vai nella cartella del progetto:
   ```sh
   cd /Users/ugi/Desktop/progettini/p5js_demon_glitch
   ```
3. Avvia il server:
   ```sh
   python3 -m http.server 8000
   ```
4. Apri il browser su [http://localhost:8000](http://localhost:8000)

## Metodo 2: Node.js (se installato)

1. Apri il Terminale nella cartella del progetto.
2. Avvia:
   ```sh
   npx http-server -p 8000
   ```
3. Vai su [http://localhost:8000](http://localhost:8000)

## Metodo 3: VS Code (Live Server)

1. Installa l’estensione "Live Server".
2. Clicca su "Go Live" in basso a destra.

---

**Perché?**
I browser bloccano il caricamento di asset locali per motivi di sicurezza (CORS). Usando un server locale, tutto funziona sempre!