const monitors = [];
let tokenMap = {};
let historyCache = {};
let currentChart = null;

async function loadCanisters() {
    const response = await fetch('/canisters');
    const tokenNames = await response.json();
    const select = document.getElementById('canisterSelect');
    const mapResponse = await fetch('/token-map');
    tokenMap = await mapResponse.json();

    const reverseMap = {};
    for (const [canisterId, tokenName] of Object.entries(tokenMap)) {
        reverseMap[tokenName] = canisterId;
    }

    tokenNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.text = name;
        select.appendChild(option);
    });
    select.value = 'ICP';

    try {
        const historyResponse = await fetch('/get-history');
        historyCache = await historyResponse.json();
        console.log('前端加载历史数据:', historyCache);
    } catch (error) {
        console.log('预加载历史数据失败:', error);
        historyCache = {};
    }

    try {
        const monitorsResponse = await fetch('/get-monitors');
        const existingMonitors = await monitorsResponse.json();
        if (existingMonitors.length > 0) {
            existingMonitors.forEach(monitor => {
                const monitorId = monitors.length;
                monitors.push(monitor);
                const monitorDiv = document.createElement('div');
                monitorDiv.className = 'monitor';
                monitorDiv.innerHTML = `
                    <div class="token-name">${monitor.tokenName}</div>
                    <div>钱包地址: <a href="https://t5t44-naaaa-aaaah-qcutq-cai.raw.icp0.io/holder/${monitor.accountOwner}/summary" target="_blank">${monitor.accountOwner}</a></div>
                    <div>余额: <span id="balance-${monitorId}">加载中...</span> ICP</div>
                    <div class="timestamp" id="timestamp-${monitorId}">加载中...</div>
                `;
                monitorDiv.onclick = () => showChart(monitorId);
                document.getElementById('monitors').appendChild(monitorDiv);
                updateMonitor(monitorId);
            });
        }
    } catch (error) {
        console.log('加载后端监视器数据失败:', error);
    }
}

async function fetchBalance(canisterId, accountOwner) {
    const response = await fetch('/run-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canisterId, accountOwner })
    });
    return await response.json();
}

async function saveBalanceHistory(key, balance, timestamp) {
    try {
        const response = await fetch('/save-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key,
                record: { balance, timestamp }
            })
        });
        if (response.ok) {
            if (!historyCache[key]) {
                historyCache[key] = [];
            }
            historyCache[key].push({ balance, timestamp });
            if (historyCache[key].length > 30) {
                historyCache[key] = historyCache[key].slice(-30);
            }
        } else {
            throw new Error('保存历史记录失败');
        }
    } catch (error) {
        console.log('保存历史记录失败:', error);
        throw error;
    }
}

async function sendTelegramMessage(message) {
    try {
        const response = await fetch('/send-telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        if (!response.ok) {
            throw new Error('发送 Telegram 消息失败');
        }
    } catch (error) {
        console.log('发送 Telegram 消息失败:', error);
    }
}

async function updateMonitorsData() {
    try {
        const response = await fetch('/update-monitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitors })
        });
        if (!response.ok) {
            throw new Error('同步监视器数据失败');
        }
        console.log('监视器数据同步成功');
    } catch (error) {
        console.log('同步监视器数据失败:', error);
    }
}

function addMonitor() {
    const tokenName = document.getElementById('canisterSelect').value;
    const accountOwner = document.getElementById('accountInput').value;
    if (!tokenName || !accountOwner) return;

    const canisterId = Object.keys(tokenMap).find(key => tokenMap[key] === tokenName);
    const monitorId = monitors.length;
    monitors.push({ canisterId, tokenName, accountOwner, lastBalance: null });

    const monitorDiv = document.createElement('div');
    monitorDiv.className = 'monitor';
    monitorDiv.innerHTML = `
        <div class="token-name">${tokenName}</div>
        <div>钱包地址: <a href="https://t5t44-naaaa-aaaah-qcutq-cai.raw.icp0.io/holder/${accountOwner}/summary" target="_blank">${accountOwner}</a></div>
        <div>余额: <span id="balance-${monitorId}">加载中...</span> ICP</div>
        <div class="timestamp" id="timestamp-${monitorId}">加载中...</div>
    `;
    monitorDiv.onclick = () => showChart(monitorId);
    document.getElementById('monitors').appendChild(monitorDiv);

    updateMonitor(monitorId);
    updateMonitorsData(); // 添加监视器时同步
}

async function updateMonitor(id) {
    const monitor = monitors[id];
    const { canisterId, accountOwner } = monitor;
    const monitorDiv = document.getElementsByClassName('monitor')[id];
    try {
        const data = await fetchBalance(canisterId, accountOwner);
        if (data.status === 'success') {
            const balanceICP = Number(data.balance) / 100000000;
            document.getElementById(`balance-${id}`).innerText = balanceICP.toFixed(4);
            document.getElementById(`timestamp-${id}`).innerText = new Date(data.timestamp).toLocaleString();

            if (monitor.lastBalance !== null && monitor.lastBalance !== balanceICP) {
                flashMonitor(monitorDiv);
                const diff = Math.abs(balanceICP - monitor.lastBalance);
                if (diff > 1000) {
                    playAlertSound();
                    alert(`余额变动超过 1000 ICP！\n代币名称: ${monitor.tokenName}\n钱包地址: ${accountOwner}\n变动: ${diff.toFixed(4)} ICP`);
                }
                const key = `${monitor.tokenName}-${monitor.accountOwner}`;
                const timestamp = new Date(data.timestamp).toLocaleString();
                await saveBalanceHistory(key, balanceICP, timestamp);

                const message = `余额变动通知\n代币: ${monitor.tokenName}\n钱包地址: ${monitor.accountOwner}\n旧余额: ${monitor.lastBalance.toFixed(4)} ICP\n新余额: ${balanceICP.toFixed(4)} ICP\n变动: ${diff.toFixed(4)} ICP\n时间: ${timestamp}`;
                await sendTelegramMessage(message);

                monitor.lastBalance = balanceICP;
                await updateMonitorsData(); // 仅在余额变化时同步
            } else if (monitor.lastBalance === null) {
                monitor.lastBalance = balanceICP; // 首次加载余额
                await updateMonitorsData(); // 首次加载时同步
            }
        } else {
            document.getElementById(`balance-${id}`).innerText = '查询失败';
        }
    } catch (error) {
        document.getElementById(`balance-${id}`).innerText = '错误';
    }
}

function flashMonitor(monitorDiv) {
    let flashes = 0;
    const interval = setInterval(() => {
        monitorDiv.classList.toggle('flash');
        flashes++;
        if (flashes >= 6) {
            clearInterval(interval);
            monitorDiv.classList.remove('flash');
        }
    }, 100);
}

function playAlertSound() {
    const audio = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
    audio.play().catch(error => console.log('音频播放失败:', error));
}

setInterval(() => {
    monitors.forEach((_, id) => updateMonitor(id));
}, 5000);

function exportMonitors() {
    if (monitors.length === 0) return;
    const exportData = monitors.map(m => ({ canisterId: m.canisterId, tokenName: m.tokenName, accountOwner: m.accountOwner }));
    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monitors.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importMonitors() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const importedMonitors = JSON.parse(event.target.result);
            if (!Array.isArray(importedMonitors)) return;

            for (const monitor of importedMonitors) {
                if (!monitor.canisterId || !monitor.accountOwner) continue;
                const tokenName = monitor.tokenName || tokenMap[monitor.canisterId] || 'Unknown';
                const monitorId = monitors.length;
                monitors.push({ canisterId: monitor.canisterId, tokenName, accountOwner: monitor.accountOwner, lastBalance: null });

                const monitorDiv = document.createElement('div');
                monitorDiv.className = 'monitor';
                monitorDiv.innerHTML = `
                    <div class="token-name">${tokenName}</div>
                    <div>钱包地址: <a href="https://t5t44-naaaa-aaaah-qcutq-cai.raw.icp0.io/holder/${monitor.accountOwner}/summary" target="_blank">${monitor.accountOwner}</a></div>
                    <div>余额: <span id="balance-${monitorId}">加载中...</span> ICP</div>
                    <div class="timestamp" id="timestamp-${monitorId}">加载中...</div>
                `;
                monitorDiv.onclick = () => showChart(monitorId);
                document.getElementById('monitors').appendChild(monitorDiv);
            }

            await Promise.all(monitors.map((_, id) => updateMonitor(id)));
            await updateMonitorsData(); // 导入完成后同步
        } catch (error) {
            console.log('导入失败:', error);
        }
        fileInput.value = '';
    };
    reader.readAsText(file);
}

async function showChart(id) {
    const modal = document.getElementById('chartModal');
    const monitor = monitors[id];
    const key = `${monitor.tokenName}-${monitor.accountOwner}`;
    const history = historyCache[key] || [];

    if (history.length === 0) {
        alert('暂无余额变动记录');
        return;
    }

    modal.classList.add('open');

    try {
        const sampledHistory = history.slice(-30);
        const labels = sampledHistory.map((record, index) => `第 ${index + 1} 次变动 (${record.timestamp})`);
        const data = sampledHistory.map(record => record.balance);

        if (currentChart) {
            currentChart.destroy();
        }

        const ctx = document.getElementById('balanceChart').getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '余额 (ICP)',
                    data: data,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: '余额变动'
                        },
                        ticks: {
                            autoSkip: true,
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '余额 (ICP)'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const index = context.dataIndex;
                                const record = sampledHistory[index];
                                return `余额: ${record.balance.toFixed(4)} ICP (时间: ${record.timestamp})`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('图表加载失败:', error);
        alert('图表加载失败，请检查数据格式或网络连接');
    }
}

function closeChart() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('open');
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

loadCanisters();