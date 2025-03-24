import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const execAsync = promisify(exec);
const app = express();
const port = 3000;

app.use(express.static('dist'));
app.use(express.json());

const tokenMap = {
  'ryjl3-tyaaa-aaaaa-aaaba-cai': 'ICP',
};

const HISTORY_FILE = path.join(process.cwd(), 'history.json');
const MONITORS_FILE = path.join(process.cwd(), 'monitors.json');

const TELEGRAM_TOKEN = "6050464823:AAGjS2ldGj28_CaZicCw6Dl3aZyboCE48Pc";
const CHAT_ID = "1545291653";
let lastUpdateId = 0;

const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:10086');

let monitorsData = [];

async function initHistoryFile() {
    try {
        await fs.access(HISTORY_FILE);
        console.log('历史数据文件已存在:', HISTORY_FILE);
    } catch {
        console.log('创建历史数据文件:', HISTORY_FILE);
        await fs.writeFile(HISTORY_FILE, JSON.stringify({}));
    }
}

async function initMonitorsFile() {
    try {
        await fs.access(MONITORS_FILE);
        const data = await fs.readFile(MONITORS_FILE, 'utf8');
        monitorsData = JSON.parse(data);
        console.log('监视器数据文件已存在:', MONITORS_FILE);
    } catch {
        console.log('创建监视器数据文件:', MONITORS_FILE);
        await fs.writeFile(MONITORS_FILE, JSON.stringify([]));
        monitorsData = [];
    }
}

async function getHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取历史数据失败:', error);
        return {};
    }
}

async function saveHistory(history) {
    try {
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log('历史数据保存成功:', HISTORY_FILE);
    } catch (error) {
        console.error('保存历史数据失败:', error);
        throw error;
    }
}

async function saveMonitors(newMonitors) {
    // 检查是否真的有变化
    const currentData = JSON.stringify(monitorsData);
    const newData = JSON.stringify(newMonitors);
    if (currentData === newData) {
        console.log('监视器数据未变化，跳过保存');
        return;
    }

    try {
        await fs.writeFile(MONITORS_FILE, JSON.stringify(newMonitors, null, 2));
        monitorsData = newMonitors;
        console.log('监视器数据保存成功:', MONITORS_FILE);
    } catch (error) {
        console.error('保存监视器数据失败:', error);
        throw error;
    }
}

async function sendTelegramMessage(chatId, message) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message
            }),
            agent: proxyAgent
        });
        const result = await response.json();
        if (!result.ok) {
            throw new Error(`Telegram API 错误: ${result.description}`);
        }
        console.log('Telegram 消息发送成功:', message);
    } catch (error) {
        console.error('发送 Telegram 消息失败:', error);
        throw error;
    }
}

async function pollTelegramUpdates() {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`;
        const response = await fetch(url, { agent: proxyAgent });
        const data = await response.json();
        if (!data.ok) {
            throw new Error(`获取 Telegram 更新失败: ${data.description}`);
        }

        const updates = data.result;
        for (const update of updates) {
            lastUpdateId = update.update_id;
            if (update.message && update.message.chat.id.toString() === CHAT_ID) {
                const text = update.message.text.toLowerCase();
                console.log('收到 Telegram 命令:', text);
                console.log('当前 monitorsData:', monitorsData);
                if (text === 'list') {
                    if (monitorsData.length === 0) {
                        await sendTelegramMessage(CHAT_ID, '暂无监视器数据');
                    } else {
                        const message = monitorsData.map(monitor => 
                            `代币: ${monitor.tokenName}\n钱包地址: ${monitor.accountOwner}\n余额: ${monitor.lastBalance ? monitor.lastBalance.toFixed(4) : '未知'} ICP`
                        ).join('\n\n');
                        await sendTelegramMessage(CHAT_ID, `监视器数据:\n\n${message}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('轮询 Telegram 更新失败:', error);
    }
}

setInterval(pollTelegramUpdates, 5000);

app.get('/canisters', (req, res) => {
    res.json(Object.values(tokenMap));
});

app.get('/token-map', (req, res) => {
    res.json(tokenMap);
});

app.get('/get-history', async (req, res) => {
    try {
        const history = await getHistory();
        console.log('获取历史记录:', history);
        res.json(history);
    } catch (error) {
        console.error('获取历史记录失败:', error);
        res.status(500).send('获取历史记录失败');
    }
});

app.post('/save-history', async (req, res) => {
    try {
        const { key, record } = req.body;
        const history = await getHistory();
        if (!history[key]) {
            history[key] = [];
        }
        history[key].push(record);
        if (history[key].length > 30) {
            history[key] = history[key].slice(-30);
        }
        await saveHistory(history);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('保存历史记录失败:', error);
        res.status(500).send('保存历史记录失败');
    }
});

app.post('/send-telegram', async (req, res) => {
    try {
        const { message } = req.body;
        await sendTelegramMessage(CHAT_ID, message);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('发送 Telegram 消息失败:', error);
        res.status(500).send('发送 Telegram 消息失败');
    }
});

app.get('/get-monitors', (req, res) => {
    res.json(monitorsData);
});

app.post('/update-monitors', async (req, res) => {
    const newMonitors = req.body.monitors;
    await saveMonitors(newMonitors);
    res.json({ status: 'success' });
});

app.post('/run-query', async (req, res) => {
    const { canisterId, accountOwner } = req.body;
    if (!canisterId || !accountOwner) {
        return res.status(400).send('缺少 canisterId 或 accountOwner');
    }

    try {
        const { stdout, stderr } = await execAsync(`node query.js ${canisterId} ${accountOwner}`);
        if (stderr) {
            res.status(500).send(`错误: ${stderr}`);
            return;
        }
        res.send(stdout);
    } catch (error) {
        res.status(500).send(`错误: ${error.message}`);
    }
});

async function startServer() {
    await initHistoryFile();
    await initMonitorsFile();
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}

startServer();