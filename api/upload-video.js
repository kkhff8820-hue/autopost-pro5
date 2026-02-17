// api/upload-video.js
// Backend REAL para YouTube com THUMBNAIL + SHORTS

const https = require('https');
const { URL } = require('url');

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
        const { video, accessToken, webdavUrl, webdavAuth } = req.body;

        if (!video || !accessToken || !webdavUrl) {
            return res.status(400).json({
                success: false,
                error: 'Faltam parâmetros: video, accessToken, webdavUrl'
            });
        }

        console.log(`[UPLOAD] Iniciando: ${video.titulo}`);

        // Prepara metadata do YouTube
        const agendamento = new Date(video.agendamento);
        const agora = new Date();
        const isFuturo = agendamento > agora;

        const metadata = {
            snippet: {
                title: video.titulo,
                description: video.descricao || '',
                tags: video.tags ? video.tags.split(',').map(t => t.trim()) : [],
                categoryId: video.isShort ? '24' : '22' // 24=Entertainment, 22=People&Blogs
            },
            status: {
                privacyStatus: isFuturo ? 'private' : 'public',
                selfDeclaredMadeForKids: false
            }
        };

        if (isFuturo) {
            metadata.status.publishAt = agendamento.toISOString();
        }

        // PASSO 1: Baixar vídeo do WebDAV
        console.log('[UPLOAD] Baixando vídeo do WebDAV...');
        const videoBuffer = await downloadFromWebDAV(webdavUrl, webdavAuth);
        console.log(`[UPLOAD] Vídeo baixado: ${videoBuffer.length} bytes`);

        // PASSO 2: Upload do vídeo para YouTube
        console.log('[UPLOAD] Enviando vídeo para YouTube...');
        const youtubeId = await uploadToYouTube(videoBuffer, metadata, accessToken);
        console.log(`[UPLOAD] ✅ Vídeo postado! YouTube ID: ${youtubeId}`);

        // PASSO 3: Upload da thumbnail (se houver)
        if (video.thumbnailUrl) {
            try {
                console.log('[THUMBNAIL] Baixando thumbnail do WebDAV...');
                const thumbnailBuffer = await downloadFromWebDAV(video.thumbnailUrl, webdavAuth);
                console.log(`[THUMBNAIL] Thumbnail baixada: ${thumbnailBuffer.length} bytes`);
                
                console.log('[THUMBNAIL] Enviando thumbnail para YouTube...');
                await uploadThumbnail(youtubeId, thumbnailBuffer, accessToken);
                console.log('[THUMBNAIL] ✅ Thumbnail adicionada!');
            } catch (thumbError) {
                console.error('[THUMBNAIL] ⚠️ Erro na thumbnail:', thumbError.message);
                // Não falha o upload se só a thumbnail deu erro
            }
        }

        res.status(200).json({
            success: true,
            youtubeId: youtubeId,
            status: isFuturo ? 'scheduled' : 'published',
            publishAt: isFuturo ? agendamento.toISOString() : new Date().toISOString(),
            message: video.isShort ? 
                '📱 Short publicado com sucesso!' : 
                '🎬 Vídeo publicado com sucesso!',
            simulation: false,
            isShort: video.isShort || false,
            hasThumbnail: !!video.thumbnailUrl
        });

    } catch (error) {
        console.error('[UPLOAD] ❌ Erro:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Baixar arquivo do WebDAV
async function downloadFromWebDAV(url, auth) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname,
            method: 'GET',
            headers: {}
        };

        if (auth) {
            options.headers['Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : require('http');

        const req = protocol.request(options, (res) => {
            const chunks = [];

            res.on('data', (chunk) => chunks.push(chunk));

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`WebDAV erro: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// Upload do vídeo para YouTube
async function uploadToYouTube(videoBuffer, metadata, accessToken) {
    return new Promise((resolve, reject) => {
        const boundary = '-------314159265358979323846';
        const metadataStr = JSON.stringify(metadata);
        
        const preBoundary = `--${boundary}\r\n` +
                           `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                           `${metadataStr}\r\n` +
                           `--${boundary}\r\n` +
                           `Content-Type: video/mp4\r\n\r\n`;
        
        const postBoundary = `\r\n--${boundary}--`;
        
        const body = Buffer.concat([
            Buffer.from(preBoundary),
            videoBuffer,
            Buffer.from(postBoundary)
        ]);

        const options = {
            hostname: 'www.googleapis.com',
            port: 443,
            path: '/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => data += chunk);

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    resolve(response.id);
                } else {
                    reject(new Error(`YouTube API erro ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// Upload da thumbnail para YouTube
async function uploadThumbnail(videoId, thumbnailBuffer, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.googleapis.com',
            port: 443,
            path: `/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'image/jpeg',
                'Content-Length': thumbnailBuffer.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => data += chunk);

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Thumbnail API erro ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(thumbnailBuffer);
        req.end();
    });
}
