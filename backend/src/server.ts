import "dotenv/config";
//leggo il file .env tramite libreria dotenv//

import app from "./app";

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

//Separando app e server posso testare l’app senza avviare il server.//