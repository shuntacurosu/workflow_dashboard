# Workflow Dashboard

YAML設定ファイルでタスクを定義し、Web UIからワンクリックで実行できるダッシュボード。  
tmux (psmux) によるセッション永続化で、ブラウザを閉じてもプロセスは継続します。

## Features

- 📄 **YAML設定駆動** — `workflow.yaml` でタスク・コマンド・引数を定義
- 🖥️ **Web UI** — React + xterm.js によるリアルタイムログ表示
- 🔒 **セッション永続化** — tmux (psmux) でブラウザ切断後もプロセス継続
- ⚙️ **引数の自動フォーム生成** — required/optional、型（text, number, select）対応
- 📊 **セッション管理** — アクティブなtmuxセッションの一覧表示・手動kill

## Quick Start

```bash
# Backend
npm install
node server.js

# Frontend (dev)
cd dashboard && npm install && npm run dev
```

→ http://localhost:5173/

## Configuration

`workflow.yaml` を編集してタスクを定義します:

```yaml
title: My Workflow

tasks:
  - name: my_task
    label: My Task            # UI表示名
    description: 説明文
    cwd: ./path/to/task       # 実行ディレクトリ
    command: uv run main.py   # 実行コマンド
    args:
      required:
        - name: input
          flag: --input
          type: string        # string | number | select
          description: Input file
          placeholder: data.json
      optional:
        - name: format
          flag: --format
          type: select
          options: [json, csv]
          default: json
          description: Output format
```

### Arg Types

| type | UIレンダリング |
|------|--------------|
| `string` | テキスト入力 |
| `number` | 数値入力 |
| `select` | ドロップダウン（`options` 必須） |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Tailwind CSS, xterm.js |
| Backend | Node.js, Express, Socket.io |
| Session | psmux (tmux for Windows) |
| Task Runner | uv (Python) |

## Project Structure

```
workflow_dashboard/
├── workflow.yaml          # タスク定義
├── server.js              # Express + Socket.io + tmux管理
├── package.json
├── dashboard/
│   └── src/App.jsx        # React UI
└── tasks/
    ├── task_a/            # 各タスクフォルダ
    ├── task_b/
    └── task_c/
```

## License

MIT
