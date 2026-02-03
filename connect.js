import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import pino from "pino"

async function startBot() {
  // Salva a autenticação em uma pasta (session)
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true, // Mostra QR no Termux
    auth: state
  })

  // Eventos
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    } else if (connection === "open") {
      console.log("✅ BOT CONECTADO COM SUCESSO!")
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // Exemplo de resposta automática
  sock.ev.on("messages.upsert", async (msg) => {
    const m = msg.messages[0]
    if (!m.message) return
    const text = m.message.conversation || m.message.extendedTextMessage?.text
    if (!text) return

    if (text.toLowerCase() === "oi") {
      await sock.sendMessage(m.key.remoteJid, { text: "Olá! 🤖 Bot conectado com sucesso." })
    }
  })
}

startBot()
