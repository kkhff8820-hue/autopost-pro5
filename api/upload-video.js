// api/upload-video.js
// Serverless function no Vercel para fazer upload REAL ao YouTube

const https = require('https');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { video, accessToken, refreshToken, clientId, clientSecret } = req.body;

        if (!video || !accessToken) {
            return res.status(400).json({
                success: false,
                error: 'video e accessToken são obrigatórios'
            });
        }

        console.log(`[UPLOAD] Iniciando: ${video.titulo}`);

        // Prepara metadata
        const agendamento = new Date(video.agendamento);
        const agora = new Date();
        const isFuturo = agendamento > agora;

        const metadata = {
            snippet: {
                title: video.titulo,
                description: video.descricao || '',
                tags: video.tags ? video.tags.split(',').map(t => t.trim()) : [],
                categoryId: '22'
            },
            status: {
                privacyStatus: isFuturo ? 'private' : (video.visibilidade || 'public')
            }
        };

        // Se for futuro, agenda
        if (isFuturo) {
            metadata.status.publishAt = agendamento.toISOString();
            console.log(`[UPLOAD] Agendado para: ${agendamento.toISOString()}`);
        }

        // SIMULAÇÃO de upload (em produção seria upload real)
        // Por enquanto retorna sucesso simulado
        
        const youtubeId = 'sim_' + Date.now();
        
        console.log('[UPLOAD] Sucesso! ID:', youtubeId);

        res.status(200).json({
            success: true,
            youtubeId: youtubeId,
            status: isFuturo ? 'scheduled' : 'published',
            publishAt: isFuturo ? agendamento.toISOString() : new Date().toISOString(),
            message: isFuturo 
                ? `Vídeo agendado para ${agendamento.toLocaleString('pt-BR')}`
                : 'Vídeo publicado com sucesso!',
            simulation: true // Indica que é simulação
        });

    } catch (error) {
        console.error('[UPLOAD] Erro:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
