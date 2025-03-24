# ICP Balance Monitor

A tool to monitor token balances on the Internet Computer (ICP) blockchain, with real-time updates and Telegram notifications.

## Overview

This project allows users to monitor ICP token balances for multiple wallet addresses. It provides a web interface to add monitors, view balance history via line charts, and receive Telegram alerts when balances change. Data is persisted locally, and monitors can be imported/exported as JSON files.

## Features

- **Real-Time Monitoring**: Automatically checks balances every 5 seconds.
- **Web Interface**: Add and view monitors with a clean UI, including balance history charts.
- **Telegram Notifications**: Sends alerts for balance changes and supports a `list` command to view all monitors.
- **Data Persistence**: Stores balance history in `history.json` and monitor data in `monitors.json`.
- **Import/Export**: Save and load monitors via JSON files.

## Prerequisites

- **Node.js**: Version 16 or higher.
- **Git**: For cloning the repository.
- **Telegram Bot**: A bot token and chat ID for notifications.
- **Proxy (Optional)**: If accessing Telegram requires a proxy (e.g., `http://127.0.0.1:10086`).

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/ysyms/icp-balance-monitor.git
   cd icp-balance-monitor
