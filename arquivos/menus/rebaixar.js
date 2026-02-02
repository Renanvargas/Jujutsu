// ./arquivos/menus/rebaixar.js
module.exports = async (sock, from, Info, prefix, BOT_PHONE, getVerificacao) => {
  try {
    const groupMetadata = from.endsWith("@g.us") ? await sock.groupMetadata(from) : { subject: "Chat Privado", participants: [] };
    const { participants, isSenderAdmin, isSenderOwner, isSenderDonoBot, isBotAdmin, donoBotNumero } =
      await getVerificacao(sock, from, Info, prefix, BOT_PHONE);

    // Apenas o dono do bot pode usar o rebaixamento em massa
    if (!isSenderDonoBot) {
      return sock.sendMessage(from, { text: "🚫 Apenas o dono do bot pode usar este comando." }, { quoted: Info });
    }

    if (!isBotAdmin) {
      return sock.sendMessage(from, { text: "🤖 Preciso ser admin para rebaixar alguém!" }, { quoted: Info });
    }

    await sock.sendMessage(from, { text: "🧨 *INICIANDO REBAIXAMENTO EM MASSA...*\n\nRebaixando todos os administradores." }, { quoted: Info });

    let rebaixadosCount = 0;
    let falhasCount = 0;

    for (const participant of participants) {
      const participantId = participant.id;
      const isAdmin = participant.admin === 'admin';
      const isSuperAdmin = participant.admin === 'superadmin';
      
      const participantNumero = participant.phoneNumber || participant.jid?.split('@')[0] || participantId.split('@')[0];
      const participantNumeroLimpo = participantNumero.replace(/[^0-9]/g, "");
      const isDonoBot = participantNumeroLimpo === donoBotNumero;

      // Não rebaixa o criador (superadmin), o dono do bot ou o próprio bot
      if (isAdmin && !isSuperAdmin && !isDonoBot && participantId !== sock.user?.id) {
        try {
          await sock.groupParticipantsUpdate(from, [participantId], "demote");
          rebaixadosCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          const errorMsg = err.message || String(err);
          console.error(`Erro ao rebaixar ${participantId}:`, errorMsg);
          falhasCount++;
          if (errorMsg.includes('forbidden') || err.data === 403) {
            continue;
          }
        }
      }
    }

    await sock.sendMessage(from, { 
      text: `✅ *REBAIXAMENTO CONCLUÍDO!*\n\n🟢 Sucessos: ${rebaixadosCount}\n🔴 Falhas/Pulados: ${falhasCount}`
    }, { quoted: Info });

  } catch (err) {
    console.error("Erro no comando rebaixar:", err);
    await sock.sendMessage(from, { text: "❌ Ocorreu um erro ao tentar rebaixar." }, { quoted: Info });
  }
};
