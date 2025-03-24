import ctypes
import json
import os
import subprocess
import sys
import tkinter as tk
from datetime import datetime
from threading import Thread
from tkinter import ttk, messagebox

from apscheduler.schedulers.background import BackgroundScheduler
from PIL import Image
import pystray
from pytz import timezone  # 添加这行

# Windows 高DPI适配
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
    os.environ['TK_SCALE'] = '1'
except:
    pass

class BalanceMonitor:
    def __init__(self):
        # 初始化主窗口
        self.root = tk.Tk()
        self.root.title("ICP 余额监控")
        self.root.geometry("480x240")
        self.root.minsize(360, 180)
        
        # 配置响应式布局
        self._setup_ui()
        
        # 初始化定时任务
        self.scheduler = BackgroundScheduler()
        self.scheduler.add_job(self.update_balance, 'interval', minutes=1)
        self.scheduler.start()

        # 首次更新（延迟确保GUI初始化完成）
        self.root.after(100, self.update_balance)
        
        # 托盘图标设置
        self._setup_tray()
        self.root.mainloop()

    def _setup_ui(self):
        """初始化界面布局"""
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        
        # 主容器
        main_frame = ttk.Frame(self.root, padding=20)
        main_frame.grid(row=0, column=0, sticky="nsew")
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(1, weight=1)

        # 余额显示
        self.label = ttk.Label(
            main_frame,
            text="当前余额: 加载中...",
            font=('Segoe UI', 16, 'bold'),
            anchor='center'
        )
        self.label.grid(row=0, column=0, pady=10, sticky='ew')

        # 时间显示
        self.time_label = ttk.Label(
            main_frame,
            text="最后更新时间: -",
            font=('Segoe UI', 10),
            anchor='center'
        )
        self.time_label.grid(row=1, column=0, pady=5, sticky='ew')

        # 响应式布局绑定
        self.root.bind('<Configure>', self._adjust_layout)

    def _adjust_layout(self, event=None):
        """窗口大小变化时调整布局"""
        width = self.root.winfo_width()
        base_size = max(12, int(width / 30))
        self.label.config(font=('Segoe UI', base_size, 'bold'))

    def _setup_tray(self):
        """初始化系统托盘图标"""
        self.root.protocol("WM_DELETE_WINDOW", self.minimize_to_tray)
        self.tray_icon = None

    def run_node_script(self):
        """执行Node.js脚本获取余额"""
        try:
            result = subprocess.run(
                ['node', 'query.js'],
                capture_output=True,
                text=True,
                check=True,
                encoding='utf-8'
            )
            last_line = result.stdout.strip().split('\n')[-1]
            return json.loads(last_line)
        except subprocess.CalledProcessError as e:
            try:
                error_data = json.loads(e.stderr.split('\n')[-1])
                return error_data
            except:
                return {'status': 'error', 'message': '未知错误'}
        except Exception as e:
            return {'status': 'error', 'message': f'执行失败: {str(e)}'}

    def update_balance(self):
        data = self.run_node_script()
        if data.get('status') == 'success':
            balance = data['balance']
            # 原始时间戳（假设为UTC时间）
            raw_timestamp = data['timestamp']
            
            # 转换为 UTC+8
            utc_time = datetime.fromisoformat(raw_timestamp.replace('Z', '+00:00'))
            beijing_time = utc_time.astimezone(timezone('Asia/Shanghai'))
            formatted_time = beijing_time.strftime("%Y-%m-%d %H:%M:%S")
            
            self._update_ui(balance, formatted_time)
        else:
            error_msg = data.get('message', '未知错误')
            self.root.after(0, messagebox.showerror, "错误", error_msg)

    def _update_ui(self, balance, timestamp):
        """更新界面显示"""
        self.label.config(text=f"ODIN.FUN余额: {round(int(balance)/100000000,2)} ckBTC")
        self.time_label.config(text=f"最后更新时间: {timestamp}")

    def minimize_to_tray(self):
        """最小化到系统托盘"""
        self.root.withdraw()
        image = Image.open("icon.ico") if os.path.exists("icon.ico") else Image.new('RGB', (64, 64), 'white')
        menu = pystray.Menu(
            pystray.MenuItem("显示主界面", self.show_window),
            pystray.MenuItem("退出程序", self.quit_app)
        )
        self.tray_icon = pystray.Icon("ICP Monitor", image, menu=menu)
        Thread(target=self.tray_icon.run, daemon=True).start()

    def show_window(self):
        """从托盘恢复窗口"""
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.deiconify()

    def quit_app(self):
        """安全退出程序"""
        self.scheduler.shutdown()
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.destroy()
        sys.exit()

if __name__ == "__main__":
    BalanceMonitor()
