import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

/**
 * 配置管理 API 插件
 * 提供配置文件的读取和保存功能
 */
export function configApiPlugin(): Plugin {
  const configPath = path.resolve(process.cwd(), 'axhub.config.json');

  return {
    name: 'config-api-plugin',
    configureServer(server: any) {
      // GET /api/config - 读取配置
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method === 'GET' && req.url === '/api/config') {
          try {
            let config = { server: { host: 'localhost', port: 51720, allowLAN: true } };
            
            if (fs.existsSync(configPath)) {
              const fileContent = fs.readFileSync(configPath, 'utf8');
              config = JSON.parse(fileContent);
              
              // 确保有默认值
              if (!config.server) {
                config.server = { host: 'localhost', port: 51720, allowLAN: true };
              }
              if (config.server.allowLAN === undefined) {
                config.server.allowLAN = true;
              }
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(config));
          } catch (e: any) {
            console.error('Error reading config:', e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e?.message || 'Failed to read config' }));
          }
          return;
        }

        // POST /api/config - 保存配置
        if (req.method === 'POST' && req.url === '/api/config') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 10) { // 10KB 限制
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const newConfig = JSON.parse(raw);

              // 验证配置格式
              if (!newConfig.server || typeof newConfig.server !== 'object') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid config format' }));
                return;
              }

              // 验证端口号
              if (newConfig.server.port !== undefined) {
                const port = Number(newConfig.server.port);
                if (!Number.isInteger(port) || port < 1 || port > 65535) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ error: 'Invalid port number' }));
                  return;
                }
              }

              // 保存配置文件
              fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ 
                success: true, 
                message: '配置已保存，请重启服务器使配置生效' 
              }));
            } catch (e: any) {
              console.error('Error saving config:', e);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: e?.message || 'Failed to save config' }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}
