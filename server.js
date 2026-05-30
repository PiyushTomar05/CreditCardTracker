/**
 * ==========================================================================
 * FUELFLOW LEDGER - ZERO-DEPENDENCY SYNC SERVER & DATABASE
 * ==========================================================================
 * Persistent physical JSON storage engine for Karan Filling Station Ledger
 * Origin-free hybrid design with absolute CORS portability.
 * ==========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'data.json');

// MIME types for static asset serving
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // Set permissive CORS headers for local HTML (file://) files to sync
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API Endpoint: Get or Save data.json
    if (req.url === '/api/data') {
        if (req.method === 'GET') {
            fs.readFile(DB_FILE, 'utf8', (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        // DB file doesn't exist yet, send empty state
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({}));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Read failure on database file.' }));
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(data);
                }
            });
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    // Quick validation to ensure we're writing valid JSON
                    JSON.parse(body);
                    fs.writeFile(DB_FILE, body, 'utf8', (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to write to data.json' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, message: 'Database physically written.' }));
                        }
                    });
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON payload payload.' }));
                }
            });
        }
        return;
    }

    // Serve Static Dashboard Files
    let filePath = req.url === '/' ? '/index.html' : req.url;
    // Strip query strings or hash parameters
    filePath = filePath.split('?')[0].split('#')[0];
    const fullPath = path.join(__dirname, filePath);

    // Security guard: restrict path traversal outside project folder
    if (!fullPath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
    }

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1><p>The requested file does not exist on Karan Ledger Sync Server.</p>');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Internal Server Error: ${err.code}`);
            }
        } else {
            const ext = path.extname(fullPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 KARAN FILLING STATION LEDGER - PERSISTENCE SYNC SERVER RUNNING`);
    console.log(`💻 Local Address:  http://localhost:${PORT}`);
    console.log(`💾 Database File:  ${DB_FILE}`);
    console.log(`=============================================================\n`);
    console.log('Press Ctrl+C to terminate the sync server.\n');
});
