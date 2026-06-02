// server-https.js
// Servidor HTTPS para desenvolvimento local
const https = require('https');
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3006;

// Gerar certificado auto-assinado se não existir
const certPath = path.join(__dirname, 'server.crt');
const keyPath = path.join(__dirname, 'server.key');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.log('📜 Gerando certificado SSL auto-assinado...');
  const { exec } = require('child_process');
  const cmd = `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/CN=localhost"`;

  exec(cmd, (error) => {
    if (error) {
      console.error('❌ Erro ao gerar certificado:', error.message);
      console.log('📌 Instalando openssl ou usando alternativa...');
      // Fallback: usar certificado auto-gerado via Node.js
      const pem = require('pem');
      pem.createCertificate({ days: 365, selfSigned: true }, (err, keys) => {
        if (err) {
          console.error('Erro ao criar certificado:', err);
          process.exit(1);
        }
        fs.writeFileSync(certPath, keys.certificate);
        fs.writeFileSync(keyPath, keys.serviceKey);
        startServer();
      });
      return;
    }
    startServer();
  });
} else {
  startServer();
}

function startServer() {
  app.prepare().then(() => {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    https.createServer(options, (req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(port, () => {
      console.log(`
✅ Servidor HTTPS rodando em:
   https://localhost:${port}
   https://192.168.3.5:${port}

⚠️  Certificado auto-assinado (aviso no navegador é normal)
🔐 Câmera funcionará normalmente com HTTPS
`);
    });
  });
}
