const axios = require("axios");
const url = require("url");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function play5Command(sock, from, Info, args, prefix) {

    // URL do seu servidor que você acabou de configurar
    // Se estiver rodando localmente no mesmo IP 181.215.45.66, certifique-se de que a porta 4094 está aberta
    const API_BASE_URL = "http://181.215.45.66:3012"; 
    const SEARCH_API_URL = "https://systemzone.store/api/ytsearch";

    const reply = (txt) =>
        sock.sendMessage(from, { text: txt }, { quoted: Info });

    // Função para baixar áudio em buffer
    async function baixarAudio(url) {
        try {
            const res = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 120_000 // Aumentado para 2 minutos para arquivos maiores
            });
            return Buffer.from(res.data);
        } catch (error) {
            throw new Error(`Falha ao baixar o arquivo de áudio: ${error.message}`);
        }
    }

    // Função para gerenciar o download via API
    async function iniciarDownloadTedzinho(youtubeUrl, type = 'mp3', abr = '320') {
        let apiUrl = '';
        let queryParams = new url.URLSearchParams({ url: youtubeUrl });

        if (type === 'mp3') {
            apiUrl = `${API_BASE_URL}/audio`;
            queryParams.set('ext', 'mp3');
            queryParams.set('abr', abr);
        } else if (type === 'm4a') {
            apiUrl = `${API_BASE_URL}/audio-m4a`;
        } else if (type === 'opus') {
            apiUrl = `${API_BASE_URL}/audio-opus`;
        } else {
            throw new Error("Tipo de mídia não suportado.");
        }

        console.log(`[PLAY5] Solicitando download: ${apiUrl}?${queryParams.toString()}`);
        
        const initialResp = await axios.get(`${apiUrl}?${queryParams.toString()}`, { 
            timeout: 45_000,
            validateStatus: false // Permite lidar com 202 e 400 manualmente
        });
        
        const data = initialResp.data;

        if (initialResp.status !== 200 && initialResp.status !== 202) {
            let errorMsg = data.error || `Erro na API: Status ${initialResp.status}`;
            if (initialResp.status === 403) errorMsg = "IP Bloqueado pelo YouTube. Verifique os Cookies no servidor.";
            throw new Error(errorMsg);
        }

        // Se já estiver no cache, retorna direto
        if (data.status === true && data.cached === true) {
            console.log("[PLAY5] Cache Hit!");
            return data.download_url;
        }
        
        if (data.status !== 'processing' || !data.task_id) {
            throw new Error(data.error || 'Resposta inesperada da API.');
        }

        const taskId = data.task_id;
        let downloadUrl = null;
        const maxAttempts = 60; // Aumentado para 2 minutos de espera total

        for (let i = 0; i < maxAttempts; i++) {
            await sleep(2000);
            
            try {
                const statusResp = await axios.get(`${API_BASE_URL}/status/${taskId}`, { timeout: 15_000 });
                const statusData = statusResp.data;

                if (statusData.status === 'completed') {
                    downloadUrl = statusData.download_url;
                    break;
                } else if (statusData.status === 'failed') {
                    let failMsg = statusData.error || 'Desconhecido';
                    if (statusData.hint) failMsg += ` (Dica: ${statusData.hint})`;
                    throw new Error(`Erro no processamento: ${failMsg}`);
                }
                console.log(`[PLAY5] Aguardando... Tentativa ${i+1}/${maxAttempts}`);
            } catch (pollError) {
                console.error(`[PLAY5] Erro no polling: ${pollError.message}`);
                // Continua tentando se for apenas erro de rede temporário
            }
        }

        if (!downloadUrl) {
            throw new Error(`Tempo limite de processamento excedido para o vídeo.`);
        }

        return downloadUrl;
    }

    try {
        const userInput = args.join(" ");
        let youtubeUrl = userInput;
        let metadata = {};
        
        const isUrl = userInput.includes("youtu.be") || userInput.includes("youtube.com");

        if (!userInput) {
            return reply(`❌ Por favor, envie o link do YouTube ou o nome da música.\nExemplo: ${prefix}play5 Tz da Coronel`);
        }

        if (isUrl) {
            metadata = {
                titulo: "Música do YouTube",
                autor: "URL Fornecida",
                duracao: "N/D",
                publicado: "N/D",
                thumb: "https://www.youtube.com/img/desktop/yt_1200.png",
                rotaUsada: "Download Direto"
            };
            reply("⏳ Processando link direto do YouTube...");
        } else {
            await sock.sendMessage(from, { react: { text: "🔍", key: Info.key } });

            const maxTentativas = 5;
            const intervalo = 3000;

            for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
                try {
                    const searchResp = await axios.get(`${SEARCH_API_URL}?text=${encodeURIComponent(userInput)}`, { timeout: 15_000 });
                    const searchData = searchResp.data;

                    if (searchResp.status === 200 && searchData.status === 'sucesso' && searchData.resultados?.length > 0) {
                        const firstResult = searchData.resultados[0];
                        youtubeUrl = firstResult.youtube_url;
                        
                        metadata = {
                            titulo: firstResult.title,
                            autor: firstResult.author,
                            duracao: firstResult.duration,
                            publicado: firstResult.publish_date,
                            thumb: firstResult.thumbnail,
                            rotaUsada: "Busca + Download"
                        };
                        break;
                    }
                } catch (e) {
                    console.error(`[PLAY5] Erro na busca (tentativa ${tentativa}): ${e.message}`);
                }

                if (tentativa < maxTentativas) await sleep(intervalo);
            }

            if (!metadata.titulo) {
                throw new Error(`Não foi possível encontrar resultados para "${userInput}".`);
            }
        }

        await sock.sendMessage(from, { react: { text: "📥", key: Info.key } });
        
        // Inicia o download no seu servidor 181.215.45.66
        const finalDownloadUrl = await iniciarDownloadTedzinho(youtubeUrl, 'mp3', '320');
        
        // Baixa o arquivo final para o buffer do bot
        const audioBuffer = await baixarAudio(finalDownloadUrl);

        await sock.sendMessage(from, { react: { text: "🎧", key: Info.key } });

        const previewBody = `Canal: ${metadata.autor}\n⏱️ Duração: ${metadata.duracao}\n📅 Publicado: ${metadata.publicado}`;

        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName: `${metadata.titulo.substring(0, 50)}.mp3`,
            ptt: false,
            contextInfo: {
                externalAdReply: {
                    title: metadata.titulo,
                    body: previewBody,
                    thumbnailUrl: metadata.thumb,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: youtubeUrl
                }
            }
        }, { quoted: Info });

        await sock.sendMessage(from, { react: { text: "✅", key: Info.key } });

    } catch (e) {
        await sock.sendMessage(from, { react: { text: "❌", key: Info.key } });
        reply("❌ Erro no Play5: " + e.message);
    }
};
